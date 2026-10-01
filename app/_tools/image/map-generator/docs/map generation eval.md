# Map Maker evaluation — 13 August 2026

All prompts came from [`prompts.md`](prompts.md). Calls used `mistralai/mistral-large-2512` through OpenRouter and the live local application. Every call has its raw JSON response here; every successful call also has the exact SVG and a PNG inspection render.

## Acceptance criteria

- Recognizable normal map on a projected Natural Earth basemap.
- Tight, relevant viewport; no floating-Europe or whole-world framing.
- Requested facts and feature types are present without fabricated precision.
- Historical/thematic overlays align to longitude/latitude.
- Labels and metadata remain readable and do not dominate the map.
- Sources are limited to URLs returned by the research stage.

## Summary

| Prompt | Baseline | Revised | Assessment |
| --- | --- | --- | --- |
| Physical South America | 49 s, rendered only political countries | 84 s validation failure; 82 s successful retry | Much improved; country borders, five physical features, oceans, north arrow and scale indicator render. Broad area geometry remains schematic. |
| European climates | 82 s validation failure | 85 s successful | Now renders six geographic feature areas, but LLM-generated climate envelopes are too coarse for publication. Coastline-over-overlay styling was added afterward. |
| Europe 1914 | 93 s, screen-space blobs | 119 s, geographic polygons | Still unacceptable as a factual political map. Coordinates align to the basemap, but prose-to-polygon generation cannot reproduce historical borders. |
| Roman expansion | 145 s, screen-space blobs | 138 s, geographic polygons | Still unacceptable as a factual territorial map. Chronological envelopes remain too coarse and labels too dense. |
| Alexander routes | 124 s, no routes | 112 s and 96 s route-aware renders | Substantially improved: geographic paths, arrowheads, cities and battles work. Deterministic post-processing now removes irrelevant territory fills and route-segment labels. |

## 1. Physical geography

### Attempt 01 — baseline

Rendered successfully in 49 seconds, but only produced a modern political map. All requested physical features, scale bar and north arrow were absent.

- [JSON](1-physical-geography/attempt-01.json)
- [SVG](1-physical-geography/attempt-01.svg)
- [PNG](1-physical-geography/attempt-01.png)

![Attempt 01](1-physical-geography/attempt-01.png)

### Attempt 02 — new geographic schema

Failed after 84 seconds: `Argentina must cite one or more declared sources.` The model used a source ID that did not exactly match its declared bibliography. Validation now repairs such IDs against the already verified research-source set; it does not accept new URLs.

- [JSON](1-physical-geography/attempt-02.json)

### Attempt 03 — citation repair

Rendered in 82 seconds with 16 Natural Earth country units, five physical features and four free-standing labels. The viewport and base geography are correct. The title panel was subsequently narrowed and physical areas made more translucent with coastlines redrawn above them.

- [JSON](1-physical-geography/attempt-03.json)
- [SVG](1-physical-geography/attempt-03.svg)
- [PNG](1-physical-geography/attempt-03.png)

![Attempt 03](1-physical-geography/attempt-03.png)

### Attempt 04 — first deterministic catalogue render

Rendered in 74 seconds. Unlike earlier attempts, requested physical geometry is no longer taken from the model: the Amazon uses a sampled Natural Earth 1:10m river centerline, while the Andes, Amazon Basin, Atacama and Brazilian Highlands use locally reviewed generalized overview extents. The output has a fixed South America viewport, a calculated 1,000 km scale, and a north arrow. Inspection led to a final deterministic cleanup that hides irrelevant political legend categories, shortens long official country names, reduces the panel width and moves the Pacific label below the panel.

- [JSON](1-physical-geography/attempt-04.json)
- [SVG](1-physical-geography/attempt-04.svg)
- [PNG](1-physical-geography/attempt-04.png)

![Attempt 04](1-physical-geography/attempt-04.png)

## 2. Thematic geography

### Attempt 01 — baseline

Failed after 82 seconds with `Use between 1 and 240 map regions.` The former schema had no thematic feature layer.

- [JSON](2-thematic-geography/attempt-01.json)

### Attempt 02 — thematic areas

Rendered in 85 seconds with six climate features and 22 orientation labels. The output demonstrates that thematic layers now work, but the polygons are generalized LLM envelopes and cross water. This is suitable only as a schematic draft, not a factual climate product. Renderer changes made after inspection keep modern coastlines visible above translucent thematic areas.

- [JSON](2-thematic-geography/attempt-02.json)
- [SVG](2-thematic-geography/attempt-02.svg)
- [PNG](2-thematic-geography/attempt-02.png)

![Attempt 02](2-thematic-geography/attempt-02.png)

## 3. Historical political map

### Attempt 01 — baseline

Rendered in 93 seconds. Historical areas were arbitrary screen-space polygons laid over Europe and did not follow geography.

- [JSON](3-historical-political-map/attempt-01.json)
- [SVG](3-historical-political-map/attempt-01.svg)
- [PNG](3-historical-political-map/attempt-01.png)

![Attempt 01](3-historical-political-map/attempt-01.png)

### Attempt 02 — longitude/latitude polygons

Rendered in 119 seconds. The overlay is now geographically projected, but the 21 national polygons are crude and several labels are malformed or collide. Verdict: rejected. A factual 1914 political map requires a vetted historical boundary dataset; an LLM plus prose citations is not sufficient geometry.

- [JSON](3-historical-political-map/attempt-02.json)
- [SVG](3-historical-political-map/attempt-02.svg)
- [PNG](3-historical-political-map/attempt-02.png)

![Attempt 02](3-historical-political-map/attempt-02.png)

## 4. Historical expansion / movement

### Attempt 01 — baseline

Rendered in 145 seconds. Large screen-space polygons did not align with the Mediterranean basemap.

- [JSON](4-historical-expansion-movement-map/attempt-01.json)
- [SVG](4-historical-expansion-movement-map/attempt-01.svg)
- [PNG](4-historical-expansion-movement-map/attempt-01.png)

![Attempt 01](4-historical-expansion-movement-map/attempt-01.png)

### Attempt 02 — geographic chronological areas

Rendered in 138 seconds with seven territorial regions and five additional features. Alignment is improved, but the shapes remain broad envelopes, exceed plausible extents, and carry 33 crowded labels. Verdict: rejected for factual publication; it needs curated period polygons.

- [JSON](4-historical-expansion-movement-map/attempt-02.json)
- [SVG](4-historical-expansion-movement-map/attempt-02.svg)
- [PNG](4-historical-expansion-movement-map/attempt-02.png)

![Attempt 02](4-historical-expansion-movement-map/attempt-02.png)

## 5. Route-heavy historical map

### Attempt 01 — baseline

Rendered in 124 seconds with 45 filled regions and no route geometry. It did not satisfy the prompt.

- [JSON](5-route-heavy-historical-map/attempt-01.json)
- [SVG](5-route-heavy-historical-map/attempt-01.svg)
- [PNG](5-route-heavy-historical-map/attempt-01.png)

![Attempt 01](5-route-heavy-historical-map/attempt-01.png)

### Attempt 02 — route primitives

Rendered in 112 seconds with 20 geographic features. The route, arrowheads and point symbols work and follow a recognizable campaign corridor. Territorial fills and verbose segment labels clutter the map.

- [JSON](5-route-heavy-historical-map/attempt-02.json)
- [SVG](5-route-heavy-historical-map/attempt-02.svg)
- [PNG](5-route-heavy-historical-map/attempt-02.png)

![Attempt 02](5-route-heavy-historical-map/attempt-02.png)

### Attempt 03 — tightened route prompt

Rendered in 96 seconds with 14 geographic features. The model still returned irrelevant filled regions and dated labels on every route segment. After this inspection, deterministic renderer rules were added: route maps discard model-generated filled regions and unused legend categories, and route segment text is suppressed while city/battle labels remain. This final cleanup is applied to new app output.

- [JSON](5-route-heavy-historical-map/attempt-03.json)
- [SVG](5-route-heavy-historical-map/attempt-03.svg)
- [PNG](5-route-heavy-historical-map/attempt-03.png)

![Attempt 03](5-route-heavy-historical-map/attempt-03.png)

## Implementation changes made during the evaluation

- Replaced screen percentages with validated longitude/latitude coordinates.
- Added explicit viewport bounds to every map specification.
- Added geographic area, line, arrowed route, city and battle feature primitives.
- Added north-arrow and scale-indicator support.
- Allowed feature-only thematic maps instead of requiring a country/territory region.
- Repaired model source-ID mismatches only against the verified research bibliography.
- Preserved coastlines above translucent overlays.
- Reduced the top-left information panel footprint.
- Added deterministic route cleanup to prevent territorial blobs and repeated route labels.

## Conclusion

The app is now capable of normal projected contemporary country maps, schematic physical/thematic overlays, and route/point historical maps. It should **not** claim to generate factual historical political borders or empire extents from prose alone. Those two categories need vetted GeoJSON/TopoJSON templates keyed by date or period; the research model should select and annotate that geometry, not invent it.

## Open-weight model comparison

Added after the initial Mistral evaluation. The physical South America prompt was selected because it exercises modern boundaries, geographic lines and areas, labels, viewport selection, legend, scale and north arrow without depending on a historical polygon dataset. Alternative generation models received the same web-researched factual packet. Qwen was also tried as the research model once.

Model choices were verified against their current OpenRouter listings: Qwen 3.6 35B A3B, OpenAI gpt-oss-120b, Google Gemma 4 26B A4B, and Meta Llama 4 Maverick.

| Model and attempt | Time | Result | Visual assessment |
| --- | ---: | --- | --- |
| Qwen 3.6 35B A3B, 01 | 500 s | Validation failure: one-point Pacific Ocean area | No SVG. Poor schema semantics and unacceptable latency. |
| Qwen 3.6 35B A3B, 02 | 16 s | Research returned no citations with reasoning disabled | No SVG. |
| Qwen 3.6 35B A3B, 03 | 97 s | Undeclared feature category/style | No SVG. |
| Qwen 3.6 35B A3B, 04 | ~300 s | HTTP headers timeout | No SVG. |
| OpenAI gpt-oss-120b | 329 s | Rendered | Rejected: duplicated labels, oceans treated as point-like features, angular basin, excessive panel overlap. |
| Google Gemma 4 26B A4B | 134 s | Honest refusal because research lacked coordinate geometry | No SVG. Safest behavior, but cannot fulfill the task. |
| Meta Llama 4 Maverick | 65 s | Undeclared category in first region | No SVG. |

### Qwen attempts

- [Attempt 01 JSON](1-physical-geography/qwen-attempt-01.json)
- [Attempt 02 JSON](1-physical-geography/qwen-attempt-02.json)
- [Attempt 03 JSON](1-physical-geography/qwen-attempt-03.json)
- [Attempt 04 timeout record](1-physical-geography/qwen-attempt-04.json)

### OpenAI gpt-oss-120b

- [JSON](1-physical-geography/gpt-oss-120b-attempt-01.json)
- [SVG](1-physical-geography/gpt-oss-120b-attempt-01.svg)
- [PNG](1-physical-geography/gpt-oss-120b-attempt-01.png)

![gpt-oss-120b result](1-physical-geography/gpt-oss-120b-attempt-01.png)

### Gemma 4 26B A4B

- [JSON](1-physical-geography/gemma-4-26b-a4b-it-attempt-01.json)

### Llama 4 Maverick

- [JSON](1-physical-geography/llama-4-maverick-attempt-01.json)

### Comparison verdict

Do not switch the app to Qwen, gpt-oss-120b, Gemma 4, or Llama 4 Maverick as a fix for map quality. Mistral remains the least unsuccessful generator in this test, but the root problem is architectural rather than model selection: web prose does not contain machine-usable feature geometry. The next implementation should retrieve verified geographic datasets (Natural Earth for current borders; HydroRIVERS or equivalent for rivers; curated physical-region and historical-period GeoJSON) and let the model select, style and label known features. The model should not draw factual polygons itself.
