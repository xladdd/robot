import assert from "node:assert/strict";
import test from "node:test";
import { renderDiagramSvg, validateDiagramSpec } from "../code/diagram.ts";

const amoeba = {
  version: 1,
  kind: "biology",
  title: "Amoeba <schema>",
  subtitle: "Simplified anatomy",
  subject: "amoeba",
  outline: [
    { x: 15, y: 45 },
    { x: 24, y: 20 },
    { x: 43, y: 15 },
    { x: 55, y: 28 },
    { x: 83, y: 18 },
    { x: 76, y: 46 },
    { x: 88, y: 72 },
    { x: 57, y: 78 },
    { x: 34, y: 90 },
    { x: 18, y: 68 },
  ],
  structures: [
    {
      label: "Nucleus <x>",
      description: "Contains genetic material",
      shape: "circle",
      x: 48,
      y: 48,
      width: 14,
      height: 14,
      labelX: 90,
      labelY: 35,
      color: "purple",
    },
  ],
  notes: ["Schematic; not to scale."],
  referenceSummary: "No reference image.",
};

test("validates and safely renders a constrained biological diagram", () => {
  const { spec, checks } = validateDiagramSpec(amoeba);
  const svg = renderDiagramSvg(spec);
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.match(svg, /Amoeba &lt;schema&gt;/);
  assert.match(svg, /Nucleus &lt;x&gt;/);
  assert.match(svg, /x="500" y="60" text-anchor="middle" class="title"/);
  assert.doesNotMatch(
    svg,
    /Simplified anatomy<\/text>|class="note"|not to scale/i,
  );
  assert.doesNotMatch(svg, /<ellipse/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("accepts large-area structures such as cytoplasm", () => {
  const cytoplasm = {
    ...amoeba.structures[0],
    label: "Cytoplasm",
    shape: "ellipse",
    width: 72,
    height: 64,
  };
  const { spec } = validateDiagramSpec({ ...amoeba, structures: [cytoplasm] });
  assert.equal(spec.structures[0].width, 72);
});

test("rejects unbounded diagram geometry and unsupported styles", () => {
  assert.throws(
    () =>
      validateDiagramSpec({
        ...amoeba,
        outline: [{ x: 150, y: 20 }, ...amoeba.outline],
      }),
    /between 8 and 92/,
  );
  assert.throws(
    () =>
      validateDiagramSpec({
        ...amoeba,
        structures: [{ ...amoeba.structures[0], color: "url(javascript:1)" }],
      }),
    /unsupported colour/,
  );
});

test("normalizes slightly out-of-range model diagram coordinates", () => {
  const { spec, checks } = validateDiagramSpec({
    ...amoeba,
    outline: [{ x: 7, y: 4 }, ...amoeba.outline.slice(1)],
  });
  assert.deepEqual(spec.outline[0], { x: 8, y: 8 });
  assert.ok(
    checks.some(({ message }) =>
      /2 model coordinates were normalized/.test(message),
    ),
  );
});

test("renders membrane, cytoplasm and pseudopodia as organism annotations", () => {
  const structural = [
    { ...amoeba.structures[0], label: "Cell membrane", color: "green" },
    {
      ...amoeba.structures[0],
      label: "Cytoplasm",
      color: "teal",
      labelX: 88,
      labelY: 70,
    },
    {
      ...amoeba.structures[0],
      label: "Pseudopodia",
      color: "green",
      labelX: 90,
      labelY: 40,
    },
    amoeba.structures[0],
  ];
  const svg = renderDiagramSvg(
    validateDiagramSpec({
      ...amoeba,
      title: "Schematic Diagram of an Amoeba",
      structures: structural,
    }).spec,
  );
  assert.match(svg, />Amoeba<\/text>/);
  assert.match(svg, /data-structural-role="membrane"/);
  assert.match(svg, /data-structural-role="cytoplasm"/);
  assert.match(svg, /data-structural-role="pseudopodia"/);
  assert.match(
    svg,
    new RegExp(
      `<path d="[^"]+" fill="${"#73d3cf"}" stroke="#1a1a1a" stroke-width="4"`,
    ),
  );
});

const v2Diagram = {
  version: 2,
  kind: "biology",
  diagramType: "sequence",
  title: "Schematic Diagram of a transport sequence",
  subtitle: "Přenos látek mezi oddíly",
  subject: "cell transport",
  panels: [
    { id: "source-panel", title: "Source", x: 5, y: 14, width: 40, height: 78 },
    {
      id: "target-panel",
      title: "Target",
      x: 55,
      y: 14,
      width: 40,
      height: 78,
    },
  ],
  elements: [
    {
      id: "organic",
      type: "organic",
      x: 15,
      y: 32,
      width: 12,
      height: 12,
      color: "green",
      panelId: "source-panel",
    },
    {
      id: "ellipse",
      type: "ellipse",
      x: 27,
      y: 52,
      width: 11,
      height: 7,
      color: "teal",
      panelId: "source-panel",
    },
    {
      id: "circle",
      type: "circle",
      x: 17,
      y: 70,
      width: 9,
      height: 9,
      color: "purple",
      panelId: "source-panel",
    },
    {
      id: "tube",
      type: "tube",
      x: 38,
      y: 35,
      width: 12,
      height: 5,
      color: "orange",
      panelId: "source-panel",
    },
    {
      id: "open-route",
      type: "open-path",
      x: 43,
      y: 22,
      width: 12,
      height: 8,
      color: "blue",
      points: [
        { x: 0, y: 50 },
        { x: 45, y: 10 },
        { x: 100, y: 70 },
      ],
    },
    {
      id: "network",
      type: "membrane-network",
      x: 68,
      y: 30,
      width: 17,
      height: 12,
      color: "pink",
      panelId: "target-panel",
    },
    {
      id: "cisternae",
      type: "cisternae",
      x: 77,
      y: 48,
      width: 16,
      height: 12,
      color: "yellow",
      panelId: "target-panel",
    },
    {
      id: "vesicle",
      type: "vesicle",
      x: 65,
      y: 68,
      width: 9,
      height: 9,
      color: "blue",
      panelId: "target-panel",
    },
    {
      id: "vacuole",
      type: "vacuole",
      x: 78,
      y: 72,
      width: 10,
      height: 8,
      color: "teal",
      panelId: "target-panel",
    },
    {
      id: "dots",
      type: "dots",
      x: 48,
      y: 86,
      width: 8,
      height: 6,
      color: "grey",
    },
    {
      id: "layer",
      type: "layer",
      x: 49,
      y: 20,
      width: 12,
      height: 5,
      color: "green",
    },
    {
      id: "chromosome",
      type: "chromosome",
      x: 48,
      y: 38,
      width: 7,
      height: 14,
      color: "purple",
    },
    {
      id: "spindle",
      type: "spindle",
      x: 49,
      y: 58,
      width: 16,
      height: 10,
      color: "orange",
    },
    {
      id: "centrosome",
      type: "centrosome",
      x: 49,
      y: 76,
      width: 10,
      height: 10,
      color: "pink",
    },
  ],
  labels: [
    {
      id: "label-source",
      text: "Zdroj",
      targetId: "organic",
      x: 2,
      y: 32,
      leader: "straight",
    },
    {
      id: "label-target",
      text: "Cílový oddíl č. 1",
      targetId: "network",
      x: 96,
      y: 30,
      leader: "elbow",
    },
    {
      id: "label-no-leader",
      text: "Jádro",
      targetId: "chromosome",
      x: 52,
      y: 38,
      leader: "none",
    },
  ],
  connections: [
    {
      id: "transport",
      from: "organic",
      to: "vesicle",
      arrow: "end",
      route: "elbow",
      label: "přenos",
      points: [
        { x: 15, y: 32 },
        { x: 42, y: 28 },
        { x: 65, y: 68 },
      ],
    },
    {
      id: "return",
      from: "vesicle",
      to: "source-panel",
      arrow: "both",
      route: "straight",
    },
  ],
  notes: ["Schematic; not to scale."],
  referenceSummary: "Controlled test fixture.",
};

test("validates and deterministically renders v2 panels, primitives, labels and connections", () => {
  const { spec, checks } = validateDiagramSpec(v2Diagram);
  const first = renderDiagramSvg(spec);
  const second = renderDiagramSvg(spec);
  assert.equal(first, second);
  assert.equal(spec.version, 2);
  assert.equal(spec.elements.length, 14);
  assert.match(first, /data-panel-id="source-panel"/);
  assert.match(first, /data-primitive="membrane-network"/);
  assert.match(first, /data-primitive="open-path"/);
  assert.match(first, /data-from="organic" data-to="vesicle"/);
  assert.match(first, /marker-end="url\(#arrow-end\)"/);
  assert.match(first, /marker-start="url\(#arrow-start\)"/);
  assert.match(first, /Zdroj/);
  assert.match(first, /Cílový oddíl č\. 1/);
  assert.ok(
    checks.some(
      ({ level, message }) => level === "pass" && /controlled/.test(message),
    ),
  );
  assert.doesNotMatch(first, /<script|foreignObject|onload=|javascript:/i);
});

test("renders a late cytosol background before organelles and connections", () => {
  const lateBackground = {
    ...v2Diagram,
    elements: [
      {
        ...v2Diagram.elements[4],
        id: "nucleus",
        description: "Nucleus organelle",
      },
      {
        ...v2Diagram.elements[0],
        id: "cytosol",
        description: "Open cytosol background field",
      },
    ],
    labels: [],
    connections: [
      {
        id: "cytosol-to-nucleus",
        from: "cytosol",
        to: "nucleus",
        arrow: "end",
        route: "straight",
      },
    ],
  };
  const { spec } = validateDiagramSpec(lateBackground);
  const svg = renderDiagramSvg(spec);
  const cytosolPosition = svg.indexOf('data-element-id="cytosol"');
  const nucleusPosition = svg.indexOf('data-element-id="nucleus"');
  const connectionPosition = svg.indexOf('id="connection-cytosol-to-nucleus"');
  assert.ok(cytosolPosition >= 0);
  assert.ok(nucleusPosition > cytosolPosition);
  assert.ok(connectionPosition > nucleusPosition);
  assert.equal(spec.elements[0].id, "nucleus");
  assert.equal(spec.elements[1].id, "cytosol");
});

test("renders a plasma membrane boundary as an open path", () => {
  const boundary = {
    ...v2Diagram,
    elements: [
      {
        ...v2Diagram.elements[0],
        id: "plasma_membrane",
        type: "organic",
        description: "Plasma membrane boundary",
        points: [
          { x: 70, y: 20 },
          { x: 82, y: 50 },
          { x: 70, y: 80 },
        ],
      },
    ],
    labels: [],
    connections: [],
  };
  const svg = renderDiagramSvg(validateDiagramSpec(boundary).spec);
  assert.match(
    svg,
    /data-element-id="plasma_membrane" data-primitive="organic"><path d="[^"]+" fill="none"/,
  );
  assert.doesNotMatch(
    svg,
    /data-element-id="plasma_membrane" data-primitive="organic"><path d="[^"]+" fill="#[0-9a-f]{6}"/,
  );
});

test("recognizes Czech cytoplasm and plasma membrane semantics", () => {
  const czechElements = [
    {
      ...v2Diagram.elements[0],
      id: "plasma_membrane",
      type: "organic",
      description: "Plazmatická membrána",
      points: [
        { x: 70, y: 20 },
        { x: 82, y: 50 },
        { x: 70, y: 80 },
      ],
    },
    {
      ...v2Diagram.elements[1],
      id: "cytoplazma",
      type: "organic",
      description: "Otevřené pole cytoplazmy",
    },
  ];
  const { spec } = validateDiagramSpec({
    ...v2Diagram,
    elements: czechElements,
    labels: [],
    connections: [],
  });
  const svg = renderDiagramSvg(spec);
  assert.ok(
    svg.indexOf('data-element-id="cytoplazma"') <
      svg.indexOf('data-element-id="plasma_membrane"'),
  );
  assert.match(
    svg,
    /data-element-id="cytoplazma" data-primitive="organic"><\/g>/,
  );
  assert.match(
    svg,
    /data-element-id="plasma_membrane" data-primitive="organic"><path d="[^"]+" fill="none"/,
  );
});

test("falls back when optional element point geometry is malformed", () => {
  const malformed = {
    ...v2Diagram,
    elements: [
      {
        ...v2Diagram.elements[0],
        id: "golgi",
        type: "cisternae",
        description: "Golgiho aparát",
        points: [
          { x: 40, y: 40 },
          { x: 50, y: 40 },
        ],
      },
    ],
    labels: [],
    connections: [],
  };
  const { spec, checks } = validateDiagramSpec(malformed);
  assert.equal(spec.elements[0].points, undefined);
  assert.ok(checks.some(({ message }) => /point list.*ignored/i.test(message)));
  assert.doesNotMatch(renderDiagramSvg(spec), /points must contain/);
});

test("uses the fixed canvas when a structured response omits canvas dimensions", () => {
  const { spec } = validateDiagramSpec({
    ...v2Diagram,
    canvas: { width: null, height: null },
  });
  assert.equal(spec.version, 2);
  if (spec.version === 2)
    assert.deepEqual(spec.canvas, { width: 1000, height: 700 });
  assert.match(renderDiagramSvg(spec), /viewBox="0 0 1000 700"/);
});

test("warns about approximate v2 label overlap and validates references and IDs", () => {
  const overlapping = {
    ...v2Diagram,
    labels: [
      {
        id: "one",
        text: "Same place",
        targetId: "organic",
        x: 2,
        y: 32,
        leader: "none",
      },
      {
        id: "two",
        text: "Same place",
        targetId: "circle",
        x: 2,
        y: 32,
        leader: "none",
      },
    ],
  };
  const { checks } = validateDiagramSpec(overlapping);
  assert.ok(
    checks.some(
      ({ level, message }) =>
        level === "warning" && /label overlap/i.test(message),
    ),
  );
  assert.throws(
    () =>
      validateDiagramSpec({
        ...v2Diagram,
        elements: [
          { ...v2Diagram.elements[0] },
          { ...v2Diagram.elements[1], id: "organic" },
          ...v2Diagram.elements.slice(2),
        ],
      }),
    /IDs must be unique/,
  );
  assert.throws(
    () =>
      validateDiagramSpec({
        ...v2Diagram,
        connections: [{ ...v2Diagram.connections[0], to: "missing" }],
      }),
    /unknown endpoint/,
  );
  assert.throws(
    () =>
      validateDiagramSpec({
        ...v2Diagram,
        elements: [
          { ...v2Diagram.elements[0], x: Number.NaN },
          ...v2Diagram.elements.slice(1),
        ],
      }),
    /finite number/,
  );
});

test("escapes v2 Unicode text and rejects raw SVG/path fields", () => {
  const unsafeText = {
    ...v2Diagram,
    title: "Schéma <script>alert(1)</script>",
    labels: [
      {
        id: "unicode",
        text: "Příčný řez & membrána",
        targetId: "organic",
        x: 2,
        y: 32,
        leader: "none",
      },
    ],
  };
  const svg = renderDiagramSvg(validateDiagramSpec(unsafeText).spec);
  assert.match(svg, /Schéma &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(svg, /Příčný řez &amp; membrána/);
  assert.doesNotMatch(svg, /<script|onload=|javascript:/i);
  assert.throws(
    () =>
      validateDiagramSpec({
        ...v2Diagram,
        elements: [
          { ...v2Diagram.elements[0], path: "M 0 0" },
          ...v2Diagram.elements.slice(1),
        ],
      }),
    /not accepted/,
  );
  assert.throws(
    () =>
      validateDiagramSpec({
        ...v2Diagram,
        elements: [
          { ...v2Diagram.elements[0], type: "raw-svg" },
          ...v2Diagram.elements.slice(1),
        ],
      }),
    /unsupported controlled primitive/,
  );
});
