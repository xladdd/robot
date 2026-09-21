import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonObject, parseLayerPlan } from "../code/layer-plan.ts";

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
  assert.equal(plan.layers[0].reconstructionBounds.x, 0.28);
});

test("supports legacy sparse plans with safe fallback bounds", () => {
  const plan = parseLayerPlan({ layers: [{ name: "Object", order: 1 }] });
  assert.equal(plan.layers.length, 1);
  assert.ok(plan.layers[0].reconstructionBounds.width > 0);
});

test("rejects an empty layer plan", () => {
  assert.throws(() => parseLayerPlan({ layers: [] }), /No separable objects/);
});
