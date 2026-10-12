import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appRegistry,
  appVersion,
  type InfoDrawers,
  type Language,
} from "./registry";

async function readInfoFile(relativeFolder: string, language: Language) {
  return readFile(
    join(process.cwd(), "app", "_tools", relativeFolder, `info.${language}.md`),
    "utf8",
  );
}

export async function loadInfoDrawers(): Promise<InfoDrawers> {
  const result: InfoDrawers = { en: {}, cs: {} };

  await Promise.all(
    (["en", "cs"] as const).flatMap((language) => [
      readInfoFile("", language).then((markdown) => {
        const versionHeading = language === "cs" ? "Verze" : "Version";
        result[language].general =
          `${markdown.trimEnd()}\n\n### ${versionHeading}\n\n${appVersion}\n`;
      }),
      ...appRegistry.map((app) =>
        readInfoFile(app.folder, language).then((markdown) => {
          result[language][app.id] = markdown;
        }),
      ),
    ]),
  );

  return result;
}
