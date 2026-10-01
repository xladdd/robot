import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    {
      error:
        "Map Maker is local-only and no longer supports AI-generated map requests. Use the Map Maker timeline and local controls instead.",
    },
    { status: 410 },
  );
}
