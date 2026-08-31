import { loadInfoDrawers } from "./_tools/info";
import { loadDesignManual } from "./_tools/design-manual/parse";
import Workspace from "./Workspace";

export default async function Home() {
  const [infoDrawers, englishManual, czechManual] = await Promise.all([
    loadInfoDrawers(),
    loadDesignManual("en"),
    loadDesignManual("cs"),
  ]);
  return <Workspace infoDrawers={infoDrawers} manuals={{ en: englishManual, cs: czechManual }} />;
}
