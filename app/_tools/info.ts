import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appRegistry, type InfoDrawers, type Language } from "./registry";

async function readInfoFile(relativeFolder: string, language: Language) {
  return readFile(join(process.cwd(), "app", "_tools", relativeFolder, `info.${language}.md`), "utf8");
}

export async function loadInfoDrawers(): Promise<InfoDrawers> {
  const result: InfoDrawers = { en: {}, cs: {} };

  await Promise.all(
    (["en", "cs"] as const).flatMap((language) => [
      readInfoFile("", language).then((markdown) => { result[language].general = markdown; }),
      ...appRegistry.map((app) =>
        readInfoFile(app.folder, language).then((markdown) => { result[language][app.id] = markdown; }),
      ),
    ]),
  );

  return result;
}
