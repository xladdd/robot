import assert from "node:assert/strict";
import test from "node:test";
import {
  parseJsonObject,
  parseLayerPlan,
  shouldRegenerateFullSubject,
} from "../code/layer-plan.ts";

test("normalizes complete object metadata and orders front layers first", () => {
  const plan = parseLayerPlan(
    parseJsonObject(
      JSON.stringify({
        backgroundDescription: "A complete desk scene.",
        textRegions: [
          {
            description: "A label",
            bounds: { x: -0.05, y: 0.2, width: 0.2, height: 0.1 },
          },
        ],
        shadowRegions: [
          {
            ownerId: "book",
            description: "Soft shadow below the book.",
            bounds: { x: 0.15, y: 0.5, width: 0.5, height: 0.2 },
          },
          {
            ownerId: "missing",
            description: "Invalid owner.",
            bounds: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
        layers: [
          {
            id: "book",
            name: "Book",
            description:
              "A complete closed book, including the part behind the pen.",
            order: 1,
            visibleBounds: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 },
            reconstructionBounds: { x: 0.1, y: 0.25, width: 0.6, height: 0.4 },
            occludedBy: ["pen"],
          },
          {
            id: "pen",
            name: "Pen",
            description: "A complete pen.",
            order: 3,
            visibleBounds: { x: 0.3, y: 0.35, width: 0.3, height: 0.1 },
            reconstructionBounds: {
              x: 0.28,
              y: 0.32,
              width: 0.35,
              height: 0.16,
            },
            occludedBy: ["missing"],
          },
        ],
      }),
    ),
  );
  assert.deepEqual(
    plan.layers.map((layer) => layer.id),
    ["pen", "book"],
  );
  assert.deepEqual(plan.layers[1].occludedBy, ["pen"]);
  assert.equal(plan.textRegions.length, 1);
  assert.deepEqual(
    plan.shadowRegions.map(({ ownerId }) => ownerId),
    ["book"],
  );
  assert.equal(plan.layers[0].reconstructionBounds.x, 0.28);
  assert.deepEqual(plan.supportSurfaces, []);
  assert.ok(plan.layers.every(({ subjectKind }) => subjectKind === "object"));
});

test("supports legacy sparse plans with safe fallback bounds", () => {
  const plan = parseLayerPlan({ layers: [{ name: "Object", order: 1 }] });
  assert.equal(plan.layers.length, 1);
  assert.deepEqual(plan.shadowRegions, []);
  assert.deepEqual(plan.supportSurfaces, []);
  assert.equal(plan.layers[0].subjectKind, "object");
  assert.equal(plan.layers[0].supportOcclusion, undefined);
  assert.ok(plan.layers[0].reconstructionBounds.width > 0);
});

test("keeps compact furniture and retains scene-spanning layers as support surfaces", () => {
  const plan = parseLayerPlan({
    shadowRegions: [
      {
        ownerId: "tabletop",
        bounds: { x: 0, y: 0.7, width: 1, height: 0.3 },
      },
      {
        ownerId: "side-table",
        bounds: { x: 0.2, y: 0.55, width: 0.5, height: 0.4 },
      },
    ],
    layers: [
      {
        id: "tabletop",
        name: "Light table surface",
        description: "A broad tabletop spanning the bottom of the scene.",
        order: 1,
        visibleBounds: { x: 0, y: 0.7, width: 1, height: 0.3 },
      },
      {
        id: "side-table",
        name: "Small side table",
        description: "A compact movable wooden table.",
        order: 2,
        visibleBounds: { x: 0.2, y: 0.55, width: 0.5, height: 0.4 },
      },
    ],
  });
  assert.deepEqual(
    plan.layers.map(({ id }) => id),
    ["side-table"],
  );
  assert.deepEqual(
    plan.shadowRegions.map(({ ownerId }) => ownerId),
    ["side-table"],
  );
  assert.equal(plan.supportSurfaces.length, 1);
  assert.deepEqual(
    {
      ...plan.supportSurfaces[0],
      bounds: undefined,
    },
    {
      id: "tabletop",
      name: "Light table surface",
      description: "A broad tabletop spanning the bottom of the scene.",
      order: 1,
      bounds: undefined,
    },
  );
  assert.deepEqual(
    {
      x: plan.supportSurfaces[0].bounds.x,
      y: plan.supportSurfaces[0].bounds.y,
      width: plan.supportSurfaces[0].bounds.width,
    },
    { x: 0, y: 0.7, width: 1 },
  );
  assert.ok(Math.abs(plan.supportSurfaces[0].bounds.height - 0.3) < 1e-12);
});

test("parses explicit support surfaces and validates subject references", () => {
  const plan = parseLayerPlan({
    supportSurfaces: [
      {
        id: "desk",
        name: "Studio desk",
        description: "A complete pale desk crossing the foreground.",
        order: 2,
        bounds: { x: 0, y: 0.7, width: 1, height: 0.3 },
      },
    ],
    layers: [
      {
        id: "host",
        name: "Host",
        subjectKind: "person",
        order: 3,
        visibleBounds: { x: 0.2, y: 0.25, width: 0.4, height: 0.5 },
        reconstructionBounds: { x: 0.15, y: 0.2, width: 0.5, height: 0.8 },
        supportOcclusion: {
          supportSurfaceId: "desk",
          foregroundPartsDescription:
            "Both forearms, wrists, and hands rest in front of the desk edge.",
        },
      },
      {
        id: "guest",
        name: "Guest",
        subjectKind: "unknown-kind",
        order: 1,
        supportOcclusion: {
          supportSurfaceId: "missing",
          foregroundPartsDescription: "Hands in front.",
        },
      },
    ],
  });

  assert.deepEqual(
    plan.supportSurfaces.map(({ id }) => id),
    ["desk"],
  );
  assert.equal(plan.layers[0].subjectKind, "person");
  assert.equal(plan.layers[0].supportOcclusion?.supportSurfaceId, "desk");
  assert.equal(plan.layers[1].subjectKind, "object");
  assert.equal(plan.layers[1].supportOcclusion, undefined);
});

test("shouldRegenerateFullSubject is conservative and fidelity-only", () => {
  const [person] = parseLayerPlan({
    supportSurfaces: [
      {
        id: "desk",
        name: "Desk",
        order: 1,
        bounds: { x: 0, y: 0.72, width: 1, height: 0.28 },
      },
    ],
    layers: [
      {
        id: "person",
        name: "Person behind desk",
        subjectKind: "person",
        order: 2,
        visibleBounds: { x: 0.2, y: 0.2, width: 0.35, height: 0.55 },
        reconstructionBounds: { x: 0.15, y: 0.15, width: 0.45, height: 0.85 },
        supportOcclusion: {
          supportSurfaceId: "desk",
          foregroundPartsDescription:
            "Forearms and hands visible over the desk.",
        },
      },
    ],
  }).layers;

  assert.equal(shouldRegenerateFullSubject(person, "fidelity"), true);
  assert.equal(
    shouldRegenerateFullSubject(
      { ...person, reconstructionBounds: person.visibleBounds },
      "fidelity",
    ),
    true,
  );
  assert.equal(
    shouldRegenerateFullSubject(
      {
        ...person,
        supportOcclusion: {
          supportSurfaceId: "desk",
          foregroundPartsDescription: "Visible portions cross the desk edge.",
        },
      },
      "fidelity",
    ),
    true,
  );
  assert.equal(
    shouldRegenerateFullSubject(
      {
        ...person,
        reconstructionBounds: person.visibleBounds,
        supportOcclusion: {
          supportSurfaceId: "desk",
          foregroundPartsDescription: "Visible portions cross the desk edge.",
        },
      },
      "fidelity",
    ),
    false,
  );
  assert.equal(shouldRegenerateFullSubject(person, "fast"), false);
  assert.equal(shouldRegenerateFullSubject(person, "fidelity", 0.009), false);
  assert.equal(shouldRegenerateFullSubject(person, "fidelity", 0.03), true);
  assert.equal(
    shouldRegenerateFullSubject(
      { ...person, subjectKind: "plant" },
      "fidelity",
      0.03,
    ),
    false,
  );
  assert.equal(
    shouldRegenerateFullSubject(
      {
        ...person,
        visibleBounds: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 },
      },
      "fidelity",
    ),
    false,
  );
  const withoutSupport = { ...person };
  delete withoutSupport.supportOcclusion;
  assert.equal(
    shouldRegenerateFullSubject(withoutSupport, "fidelity", 0.03),
    false,
  );
});

test("market support surface does not trigger regeneration of ordinary objects", () => {
  const plan = parseLayerPlan({
    supportSurfaces: [
      {
        id: "market-table",
        name: "Foreground market tabletop",
        description: "A broad worn wooden market table.",
        order: 1,
        bounds: { x: 0, y: 0.56, width: 1, height: 0.44 },
      },
    ],
    layers: [
      {
        id: "scales",
        name: "Balance scales",
        subjectKind: "object",
        order: 4,
        visibleBounds: { x: 0.08, y: 0.2, width: 0.55, height: 0.55 },
      },
      {
        id: "pouch-coins",
        name: "Coin pouch and coins",
        subjectKind: "object",
        order: 5,
        visibleBounds: { x: 0.5, y: 0.55, width: 0.42, height: 0.28 },
      },
      {
        id: "brass-vessels",
        name: "Small brass vessels",
        subjectKind: "object",
        order: 3,
        visibleBounds: { x: 0, y: 0.53, width: 0.3, height: 0.22 },
      },
    ],
  });

  assert.deepEqual(
    plan.supportSurfaces.map(({ id }) => id),
    ["market-table"],
  );
  assert.ok(plan.layers.every(({ subjectKind }) => subjectKind === "object"));
  assert.ok(
    plan.layers.every(
      (layer) => !shouldRegenerateFullSubject(layer, "fidelity", 0.1),
    ),
  );
});

test("repairs common missing commas in model-generated JSON arrays", () => {
  assert.deepEqual(
    parseJsonObject(
      '{"confidence":0.8,"components":[{"outer":[[10,20] [30,40]],"holes":[]}]}',
    ),
    {
      confidence: 0.8,
      components: [
        {
          outer: [
            [10, 20],
            [30, 40],
          ],
          holes: [],
        },
      ],
    },
  );
});

test("repairs missing commas between primitive array values", () => {
  assert.deepEqual(
    parseJsonObject(
      '{"coordinates":[10 20 -3.5 4e2],"occludedBy":["microphone" "headphones"],"flags":[true false null]}',
    ),
    {
      coordinates: [10, 20, -3.5, 400],
      occludedBy: ["microphone", "headphones"],
      flags: [true, false, null],
    },
  );
});

test("repairs missing commas between object properties and mixed array values", () => {
  assert.deepEqual(
    parseJsonObject(
      '{"components":[{"outer":[{"x":10 "y":20} {"x":30,"y":40}],"holes":[]} "fallback" [1,2]],"confidence":0.8}',
    ),
    {
      components: [
        {
          outer: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
          holes: [],
        },
        "fallback",
        [1, 2],
      ],
      confidence: 0.8,
    },
  );
});

test("does not repair JSON-like punctuation inside strings", () => {
  const valid = {
    description: 'Keep ][, }{, ,], and } "key": exactly as written.',
    values: [1, 2],
  };
  assert.deepEqual(parseJsonObject(JSON.stringify(valid)), valid);
});

test("repairs trailing commas in model-generated JSON", () => {
  assert.deepEqual(parseJsonObject('{"confidence":0.8,"components":[],}'), {
    confidence: 0.8,
    components: [],
  });
});

test("rejects an empty layer plan", () => {
  assert.throws(() => parseLayerPlan({ layers: [] }), /No separable objects/);
});
