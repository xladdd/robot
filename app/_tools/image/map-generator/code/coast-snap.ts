import naturalEarthLand10m from "./data/natural-earth-land.json" with { type: "json" };

// Coastline conflation for historical political geometry. The renderer clips
// historical fills to the Natural Earth 1:10m land outline, so political
// boundaries near the coast are snapped onto that same outline at render time:
// fills meet the waterline, coastal stretches follow the rendered coastline,
// and genuinely internal borders keep their source geometry. Runs once per
// request on the selected year only; the stored Cliopatria data stays unmodified.

const COAST_SNAP_TOLERANCE_DEGREES = 0.25;
const COAST_WALK_FACTOR = 6;
const COAST_WALK_MAX_DEGREES = 40;
const COAST_WALK_SIMPLIFY_DEGREES = 0.01;

type CoastRing = { points: [number, number][]; segLen: number[]; total: number };
type CoastSegment = { ringId: number; segIdx: number; ax: number; ay: number; dx: number; dy: number };
type CoastIndex = { rings: CoastRing[]; grid: Map<string, CoastSegment[]> };
type CoastHit = { dist: number; point: [number, number]; ringId: number; segIdx: number; t: number };

function wrappedLongitudeDelta(from: number, to: number) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function buildCoastIndex(): CoastIndex {
  const geometry = naturalEarthLand10m.geometry as unknown as GeoJSON.MultiPolygon;
  const polygons = geometry.coordinates;
  const rings: [number, number][][] = [];
  for (const polygon of polygons) for (const ring of polygon) {
    const unique = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1).map(([lon, lat]) => [lon, lat] as [number, number])
      : ring.map(([lon, lat]) => [lon, lat] as [number, number]);
    if (unique.length >= 3) rings.push(unique);
  }
  const coastRings: CoastRing[] = rings.map((points) => {
    const segLen: number[] = [];
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const len = Math.hypot(wrappedLongitudeDelta(ax, bx), by - ay);
      segLen.push(len);
      total += len;
    }
    return { points, segLen, total };
  });
  const grid = new Map<string, CoastSegment[]>();
  for (let ringId = 0; ringId < coastRings.length; ringId++) {
    const { points } = coastRings[ringId];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const dx = wrappedLongitudeDelta(ax, bx);
      const dy = by - ay;
      const x0 = Math.floor(Math.min(ax, ax + dx)), x1 = Math.floor(Math.max(ax, ax + dx));
      const y0 = Math.floor(Math.min(ay, by)), y1 = Math.floor(Math.max(ay, by));
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        const list = grid.get(key);
        if (list) list.push({ ringId, segIdx: i, ax, ay, dx, dy });
        else grid.set(key, [{ ringId, segIdx: i, ax, ay, dx, dy }]);
      }
    }
  }
  return { rings: coastRings, grid };
}

let coastIndex: CoastIndex | null = null;
function coast(): CoastIndex {
  coastIndex ??= buildCoastIndex();
  return coastIndex;
}

function nearestOnCoast(x: number, y: number): CoastHit | null {
  const index = coast();
  const tolerance = COAST_SNAP_TOLERANCE_DEGREES;
  let best: CoastHit | null = null;
  let bestSquared = tolerance * tolerance;
  const x0 = Math.floor(x - tolerance), x1 = Math.floor(x + tolerance);
  const y0 = Math.floor(y - tolerance), y1 = Math.floor(y + tolerance);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const segments = index.grid.get(`${cx},${cy}`);
    if (!segments) continue;
    for (const segment of segments) {
      // Wrap the query point into the segment's longitude frame so antimeridian
      // edges measure the short way.
      let localX = x;
      const offset = localX - segment.ax;
      if (offset > 180) localX -= 360;
      else if (offset < -180) localX += 360;
      let sx = segment.ax, sy = segment.ay;
      let position = 0;
      if (segment.dx || segment.dy) {
        position = ((localX - sx) * segment.dx + (y - sy) * segment.dy) / (segment.dx ** 2 + segment.dy ** 2);
        if (position > 1) { position = 1; sx += segment.dx; sy += segment.dy; }
        else if (position > 0) { sx += segment.dx * position; sy += segment.dy * position; }
        else position = 0;
      }
      const squared = (localX - sx) ** 2 + (y - sy) ** 2;
      if (squared <= bestSquared) {
        bestSquared = squared;
        let lon = sx;
        if (lon > 180) lon -= 360;
        else if (lon < -180) lon += 360;
        best = { dist: Math.sqrt(squared), point: [lon, sy], ringId: segment.ringId, segIdx: segment.segIdx, t: position };
      }
    }
  }
  return best;
}

type CoastWalk = { points: [number, number][]; length: number };

function coastWalk(a: CoastHit, b: CoastHit): CoastWalk | null {
  if (a.ringId !== b.ringId) return null;
  const ring = coast().rings[a.ringId]!;
  const count = ring.points.length;
  let forward: number;
  if (a.segIdx === b.segIdx) {
    forward = a.t <= b.t ? (b.t - a.t) * ring.segLen[a.segIdx]! : ring.total - (a.t - b.t) * ring.segLen[a.segIdx]!;
  } else {
    forward = (1 - a.t) * ring.segLen[a.segIdx]! + b.t * ring.segLen[b.segIdx]!;
    for (let i = (a.segIdx + 1) % count; i !== b.segIdx; i = (i + 1) % count) forward += ring.segLen[i]!;
  }
  const backward = ring.total - forward;
  const points: [number, number][] = [];
  if (forward <= backward) {
    if (a.segIdx !== b.segIdx || a.t > b.t) {
      for (let i = (a.segIdx + 1) % count; ; i = (i + 1) % count) {
        points.push(ring.points[i]!);
        if (i === b.segIdx) break;
      }
    }
  } else {
    for (let i = a.segIdx; ; i = (i - 1 + count) % count) {
      points.push(ring.points[i]!);
      if (i === (b.segIdx + 1) % count) break;
    }
  }
  return { points, length: Math.min(forward, backward) };
}

function simplifyOpenPath(points: [number, number][], threshold: number): [number, number][] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const squared = threshold * threshold;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maximum = squared, selected = -1;
    for (let index = first + 1; index < last; index++) {
      const [ax, ay] = points[first]!;
      const [bx, by] = points[last]!;
      const [px, py] = points[index]!;
      let sx = ax, sy = ay;
      const dx = bx - sx, dy = by - sy;
      if (dx || dy) {
        const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy);
        if (t > 1) { sx = bx; sy = by; }
        else if (t > 0) { sx += dx * t; sy += dy * t; }
      }
      const distance = (px - sx) ** 2 + (py - sy) ** 2;
      if (distance > maximum) { maximum = distance; selected = index; }
    }
    if (selected >= 0) {
      keep[selected] = 1;
      stack.push([first, selected], [selected, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function snapRing(ring: number[][]): number[][] {
  const unique = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  const nearest: Array<CoastHit | null> = unique.map(([x, y]) => nearestOnCoast(x, y));
  const out: number[][] = [];
  let index = 0;
  while (index < unique.length) {
    const hit = nearest[index];
    if (!hit) { out.push(unique[index]!); index += 1; continue; }
    let end = index;
    while (end < unique.length && nearest[end]) end += 1;
    // A run covering the whole ring would collapse an island outline onto one coast arc.
    const wholeRing = end - index >= unique.length - 1;
    if (end - index === 1 || wholeRing) {
      for (let i = index; i < end; i++) out.push(nearest[i]!.point);
    } else {
      const start = nearest[index]!;
      const finish = nearest[end - 1]!;
      const walk = coastWalk(start, finish);
      const chord = Math.hypot(finish.point[0] - start.point[0], finish.point[1] - start.point[1]);
      if (walk && chord > 0 && walk.length <= COAST_WALK_FACTOR * chord && walk.length <= COAST_WALK_MAX_DEGREES) {
        const walkPoints = simplifyOpenPath(walk.points, COAST_WALK_SIMPLIFY_DEGREES);
        out.push(start.point, ...walkPoints, finish.point);
      } else for (let i = index; i < end; i++) out.push(nearest[i]!.point);
    }
    index = end;
  }
  if (out.length < 3) return ring;
  const deduped = [out[0]!];
  for (let i = 1; i < out.length; i++) {
    const previous = deduped[deduped.length - 1]!;
    const current = out[i]!;
    if (current[0] !== previous[0] || current[1] !== previous[1]) deduped.push(current);
  }
  if (deduped.length < 3) return ring;
  const first = deduped[0]!;
  const last = deduped[deduped.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) deduped.push([first[0], first[1]]);
  return deduped;
}

function snapPolygon(polygon: number[][][]): number[][][] {
  return polygon.map(snapRing).filter((ring) => ring.length >= 4);
}

export function snapGeometryToCoast(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geometry.type === "Polygon") {
    const coordinates = snapPolygon(geometry.coordinates);
    return coordinates.length ? { type: "Polygon", coordinates } : geometry;
  }
  const coordinates = geometry.coordinates.map(snapPolygon).filter((polygon) => polygon.length);
  return coordinates.length ? { type: "MultiPolygon", coordinates } : geometry;
}
