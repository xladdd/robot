import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadInfoDrawers } from "./_tools/info";
import { loadDesignManual } from "./_tools/design-manual/parse";
import { authCookieName, readSession } from "./lib/auth";
import Workspace from "./Workspace";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await readSession(cookieStore.get(authCookieName)?.value);
  if (!session) redirect("/login");

  const [infoDrawers, englishManual, czechManual] = await Promise.all([
    loadInfoDrawers(),
    loadDesignManual("en"),
    loadDesignManual("cs"),
  ]);
  return (
    <Workspace
      infoDrawers={infoDrawers}
      manuals={{ en: englishManual, cs: czechManual }}
      username={session.username}
    />
  );
}
