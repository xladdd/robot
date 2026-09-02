import { NextResponse } from "next/server";
import { POST as generateGraph } from "../../_tools/image/graph-generator/code/server";
import { POST as generateDiagram } from "../../_tools/image/diagram-generator/code/server";
import { POST as generateMap } from "../../_tools/image/map-generator/code/generate-server";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("invalid body");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const handler =
    body.mode === "diagram"
      ? generateDiagram
      : body.mode === "map"
        ? generateMap
        : generateGraph;

  return handler(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    }),
  );
}
