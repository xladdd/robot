export type HistoricalBoundaryRecord = {
  id: string;
  code: number;
  name: string;
  validFrom: string;
  validTo: string;
  capital: { name: string; lon: number; lat: number } | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

export type HistoricalTimeline = {
  version: 1;
  source: { title: string; url: string; downloadUrl: string; citation: string; license: string; sha256: string; importedAt: string; simplificationToleranceDegrees: number };
  coverage: { globalFrom: string; through: string };
  eventDates: string[];
  records: HistoricalBoundaryRecord[];
};

export function boundariesAt(timeline: HistoricalTimeline, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Historical map dates must use YYYY-MM-DD.");
  return timeline.records.filter(({ validFrom, validTo }) => validFrom <= date && date < validTo);
}

export function nearestBoundaryEvent(timeline: HistoricalTimeline, date: string) {
  if (!timeline.eventDates.length) return null;
  let low = 0, high = timeline.eventDates.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline.eventDates[middle] <= date) low = middle + 1;
    else high = middle - 1;
  }
  return timeline.eventDates[Math.max(0, high)];
}
