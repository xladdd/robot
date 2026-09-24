import { readFile, writeFile } from "node:fs/promises";

const projectGid = process.env.ASANA_PROJECT_GID;
const clientId = process.env.ASANA_CLIENT_ID;
const clientSecret = process.env.ASANA_CLIENT_SECRET;
const refreshToken = process.env.ASANA_REFRESH_TOKEN;
const targetName = "Bugs and Feedback";

const missing = [
  ["ASANA_PROJECT_GID", projectGid],
  ["ASANA_CLIENT_ID", clientId],
  ["ASANA_CLIENT_SECRET", clientSecret],
  ["ASANA_REFRESH_TOKEN", refreshToken],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

const tokenResponse = await fetch("https://app.asana.com/-/oauth_token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }),
});
if (!tokenResponse.ok)
  throw new Error(`Asana token exchange failed with HTTP ${tokenResponse.status}`);
const tokenData = await tokenResponse.json();
if (typeof tokenData.access_token !== "string")
  throw new Error("Asana token response did not contain an access token.");

const headers = { Authorization: `Bearer ${tokenData.access_token}` };
let nextUrl =
  `https://app.asana.com/api/1.0/projects/${encodeURIComponent(projectGid)}/tasks` +
  "?limit=100&opt_fields=memberships.project.gid,memberships.section.gid,memberships.section.name";
let match = null;
while (nextUrl && !match) {
  const response = await fetch(nextUrl, { headers });
  if (!response.ok)
    throw new Error(`Asana task lookup failed with HTTP ${response.status}`);
  const data = await response.json();
  for (const task of data.data || []) {
    for (const membership of task.memberships || []) {
      if (
        membership.project?.gid === projectGid &&
        membership.section?.name === targetName &&
        membership.section?.gid
      ) {
        match = membership.section.gid;
        break;
      }
    }
    if (match) break;
  }
  nextUrl = data.next_page?.uri || "";
}

if (!match) {
  throw new Error(
    `No task in the ${targetName} section was found. Create or move a temporary task there, then run this command again.`,
  );
}

const envPath = ".env.local";
let envText = await readFile(envPath, "utf8");
const line = `ASANA_SECTION_GID=${match}`;
const pattern = /^ASANA_SECTION_GID=.*$/m;
if (pattern.test(envText)) envText = envText.replace(pattern, () => line);
else envText += `${envText.endsWith("\n") ? "" : "\n"}\n${line}\n`;
await writeFile(envPath, envText);
console.log(`Saved ASANA_SECTION_GID for the ${targetName} section.`);
