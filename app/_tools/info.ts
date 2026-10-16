import "server-only";
import { readFile } from "node:fs/promises";
import { buildModelMarkdown } from "./models.ts";
import { resolveModelDefinitions } from "./models-server.ts";
import { join } from "node:path";
import { appVersion, type InfoDrawers, type Language } from "./registry";
import { toolDefinitions } from "./generated/registry.data";
import { modelDefinitionsByFolder } from "./generated/registry.models";

async function readInfoFile(relativeFolder: string, language: Language) {
  return readFile(
    join(process.cwd(), "app", "_tools", relativeFolder, `info.${language}.md`),
    "utf8",
  );
}

export async function loadInfoDrawers(): Promise<InfoDrawers> {
  const result: InfoDrawers = { en: {}, cs: {} };
  const models = new Map(
    toolDefinitions.map(
      (tool) =>
        [
          tool.folder,
          resolveModelDefinitions(modelDefinitionsByFolder[tool.folder]),
        ] as const,
    ),
  );

  await Promise.all(
    (["en", "cs"] as const).flatMap((language) => [
      readInfoFile("", language).then((markdown) => {
        const versionHeading = language === "cs" ? "Verze" : "Version";
        result[language].general =
          `${markdown.trimEnd()}\n\n### ${versionHeading}\n\n${appVersion}\n`;
      }),
      ...toolDefinitions.map((app) =>
        readInfoFile(app.folder, language).then((markdown) => {
          const modelMarkdown = buildModelMarkdown(
            models.get(app.folder) ?? [],
            language,
          );
          // The final Markdown section is “How does it work?”; models continue its prose.
          result[language][app.id] = modelMarkdown
            ? `${markdown.trimEnd()}\n\n${modelMarkdown}`
            : markdown;
        }),
      ),
    ]),
  );

  return result;
}
