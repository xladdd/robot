import { NextResponse } from "next/server";
import { geoMercator, geoNaturalEarth1 } from "d3-geo";
import { geoEckert4, geoRobinson } from "./extra-projections.ts";
import { modelStages } from "../model-definitions.ts";
import {
  resolveFailureFallbackModels,
  resolveModel,
} from "../../../models-server.ts";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import { mapPalette } from "./palette";
import {
  createTerritoryAliasLookup,
  normalizeTerritoryName,
} from "./territory-aliases";
import {
  buildTimelineSpec,
  ensureCliopatriaTimeline,
  mapProjections,
  type TimelineProjection,
} from "./timeline-server";

const promptSystem = loadPrompt("image/map-generator/prompts/map-prompt.md");
const colors = new Set(Object.keys(mapPalette));

type Operation =
  | { type: "fill"; ids: string[]; targets: string[]; color: string }
  | { type: "label"; text: string; x: number; y: number };

function parseModelJson(content: string) {
  const stripped = content
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(stripped) as {
    operations?: Array<Record<string, unknown>>;
    notes?: unknown;
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      year?: unknown;
      projection?: unknown;
      lang?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const year = Number(body.year);
    const projection = String(body.projection || "schematic");
    const lang = body.lang === "cs" ? "cs" : "en";
    if (!prompt)
      return NextResponse.json(
        { error: "Describe the map edit you want." },
        { status: 400 },
      );
    if (prompt.length > 600)
      return NextResponse.json(
        { error: "The prompt is too long." },
        { status: 400 },
      );
    if (!Number.isInteger(year) || year === 0 || year < -3400 || year > 2026)
      return NextResponse.json(
        { error: "The requested year is outside the supported timeline." },
        { status: 400 },
      );
    if (!mapProjections.includes(projection as TimelineProjection))
      return NextResponse.json(
        { error: "Unsupported projection." },
        { status: 400 },
      );

    const openRouter = await getOpenRouterContext(request, "map");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("map") },
        { status: 503 },
      );

    if (year < 1886) await ensureCliopatriaTimeline();
    const { spec } = buildTimelineSpec(
      year,
      projection as TimelineProjection,
      lang,
    );
    const territoryNames = spec.regions
      .filter((region) => region.isoNumeric || region.label)
      .map((region) => region.label);

    type PromptResponse = {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string; code?: number };
      model?: string;
    };
    const models = [
      resolveModel(modelStages.interpretation),
      ...resolveFailureFallbackModels(modelStages.interpretation),
    ];
    let providerResult: Awaited<
      ReturnType<typeof requestOpenRouter<PromptResponse>>
    > | null = null;
    let requestedModel = models[0];
    for (const model of models) {
      requestedModel = model;
      providerResult = await requestOpenRouter<PromptResponse>(
        openRouter,
        "chat/completions",
        "interpret-map-prompt",
        {
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: promptSystem },
            {
              role: "user",
              content: JSON.stringify({
                request: prompt,
                year: spec.date,
                availableTerritories: territoryNames,
              }),
            },
          ],
        },
      );
      if (providerResult.response.ok) break;
      if (![429, 500, 502, 503, 504].includes(providerResult.response.status))
        break;
    }
    if (!providerResult?.response.ok)
      return NextResponse.json(
        {
          error:
            providerResult?.result.error?.message ||
            "The model request failed.",
        },
        { status: 502 },
      );
    const { result } = providerResult;
    const content = result.choices?.[0]?.message?.content ?? "";
    let parsed: ReturnType<typeof parseModelJson>;
    try {
      parsed = parseModelJson(content);
    } catch {
      return NextResponse.json(
        {
          error:
            "The model did not return valid JSON. Try rephrasing the request.",
        },
        { status: 502 },
      );
    }

    const regionByName = createTerritoryAliasLookup(
      spec.regions.filter((region) => region.isoNumeric || region.label),
    );
    const canvasProjection = (
      spec.projection === "robinson"
        ? geoRobinson()
        : spec.projection === "eckert4"
          ? geoEckert4()
          : spec.projection === "naturalEarth"
            ? geoNaturalEarth1()
            : geoMercator()
    ).fitExtent(
      [
        [0, 0],
        [1000, 700],
      ],
      { type: "Sphere" },
    );

    const operations: Operation[] = [];
    const unresolved: string[] = [];
    const rawOperations = Array.isArray(parsed.operations)
      ? parsed.operations.slice(0, 40)
      : [];
    for (const raw of rawOperations) {
      if (raw?.type === "fill") {
        const color = String(raw.color || "").toLowerCase();
        const targets = Array.isArray(raw.targets) ? raw.targets : [];
        if (!colors.has(color)) continue;
        const ids: string[] = [];
        const resolvedTargets: string[] = [];
        for (const target of targets) {
          if (typeof target !== "string" || !target.trim()) continue;
          const region = regionByName.get(normalizeTerritoryName(target));
          if (!region) {
            unresolved.push(target.trim());
            continue;
          }
          if (region.isoNumeric) ids.push(region.isoNumeric);
          else if (region.dataId) ids.push(region.dataId);
          resolvedTargets.push(region.label);
        }
        if (ids.length)
          operations.push({
            type: "fill",
            ids,
            targets: resolvedTargets,
            color,
          });
      } else if (raw?.type === "label") {
        const text =
          typeof raw.text === "string" ? raw.text.trim().slice(0, 60) : "";
        const lon = Number(raw.lon);
        const lat = Number(raw.lat);
        if (!text || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (lon < -180 || lon > 180 || lat < -58 || lat > 82) continue;
        const position = canvasProjection([lon, lat]);
        if (!position) continue;
        operations.push({
          type: "label",
          text,
          x: position[0],
          y: position[1],
        });
      }
    }

    return NextResponse.json({
      operations,
      unresolved: [...new Set(unresolved)].slice(0, 10),
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : "",
      model: result.model ?? requestedModel,
    });
  } catch (error) {
    console.error("[map-prompt] failed", error);
    return NextResponse.json(
      { error: "The prompt could not be interpreted." },
      { status: 500 },
    );
  }
}
