import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliopatriaTimeline } from "./map-catalog";

let timelinePromise: Promise<CliopatriaTimeline> | null = null;

export function loadCliopatriaTimeline() {
  const dataPath = join(process.cwd(), "app", "_tools", "image", "map-generator", "code", "data", "cliopatria-timeline.json");
  timelinePromise ??= readFile(dataPath, "utf8")
    .then((contents) => JSON.parse(contents) as CliopatriaTimeline)
    .catch((error) => {
      timelinePromise = null;
      throw error;
    });
  return timelinePromise;
}
