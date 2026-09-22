"use client";

import { useEffect, useState } from "react";
import type { Language } from "../../registry";
import { ToolHeader } from "../../../_components/ToolChrome";

type AdobeApp = "indesign" | "illustrator" | "photoshop";
type Filter = "all" | AdobeApp;
type Platform = "macos" | "windows";

const scripts = [
  {
    id: "make-silhouette-fill",
    name: "Make Silhouette Fill",
    description:
      "Creates a filled silhouette from selected vector page items while preserving the originals.",
    descriptionCs:
      "Vytvoří vyplněnou siluetu z vybraných vektorových objektů a zachová originály.",
    apps: ["indesign"] as AdobeApp[],
    href: "/script-buffet/Make Silhouette Fill.jsx",
  },
  {
    id: "opacity-set",
    name: "Opacity Set",
    description:
      "Applies Multiply or Screen blending with a chosen opacity to selected objects.",
    descriptionCs:
      "Použije na vybrané objekty režim násobení nebo závoje se zvolenou krytostí.",
    apps: ["indesign"] as AdobeApp[],
    href: "/script-buffet/Opacity Set.jsx",
  },
  {
    id: "split-text-frames-characters",
    name: "Split Text Frames into Characters",
    description:
      "Splits selected text frames into individually positioned character frames in one undoable action.",
    descriptionCs:
      "Rozdělí vybrané textové rámečky na samostatně umístěné rámečky znaků v jednom vratném kroku.",
    apps: ["indesign"] as AdobeApp[],
    href: "/script-buffet/Split Text Frames into Characters.jsx",
  },
] as const;

const appNames: Record<Language, Record<AdobeApp, string>> = {
  en: {
    indesign: "InDesign",
    illustrator: "Illustrator",
    photoshop: "Photoshop",
  },
  cs: {
    indesign: "InDesign",
    illustrator: "Illustrator",
    photoshop: "Photoshop",
  },
};

const installPaths: Record<AdobeApp, Record<Platform, string>> = {
  indesign: {
    macos:
      "~/Library/Preferences/Adobe InDesign/Version [version]/[language]/Scripts/Scripts Panel",
    windows:
      "%APPDATA%\\Adobe\\InDesign\\Version [version]\\[language]\\Scripts\\Scripts Panel",
  },
  illustrator: {
    macos:
      "/Applications/Adobe Illustrator [version]/Presets/[language]/Scripts",
    windows:
      "C:\\Program Files\\Adobe\\Adobe Illustrator [version]\\Presets\\[language]\\Scripts",
  },
  photoshop: {
    macos: "/Applications/Adobe Photoshop [version]/Presets/Scripts",
    windows:
      "C:\\Program Files\\Adobe\\Adobe Photoshop [version]\\Presets\\Scripts",
  },
};

export function ScriptBuffetMainInterface({
  language,
}: {
  language: Language;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [installApp, setInstallApp] = useState<AdobeApp>("indesign");
  const [installPlatform, setInstallPlatform] = useState<Platform>("macos");
  const [copiedInstallPath, setCopiedInstallPath] = useState(false);
  const cs = language === "cs";

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const script of scripts) {
      next[script.id] = Number(
        window.localStorage.getItem(`script-buffet:${script.id}`) || 0,
      );
    }
    setCounts(next);
  }, []);

  function recordDownload(id: string) {
    setCounts((current) => {
      const count = (current[id] || 0) + 1;
      window.localStorage.setItem(`script-buffet:${id}`, String(count));
      return { ...current, [id]: count };
    });
  }

  async function copyInstallPath() {
    await navigator.clipboard.writeText(
      installPaths[installApp][installPlatform],
    );
    setCopiedInstallPath(true);
    window.setTimeout(() => setCopiedInstallPath(false), 1800);
  }

  const visible = scripts.filter(
    (script) => filter === "all" || script.apps.includes(filter),
  );
  const filters: Filter[] = ["all", "indesign", "illustrator", "photoshop"];

  return (
    <div className="buffet-module">
      <ToolHeader
        className="library-tool-header buffet-header"
        code={cs ? "DESIGN / SKRIPTY" : "DESIGN / SCRIPTS"}
        title="Script Buffet"
        mode="local"
        language={language}
      />

      <details className="library-guide buffet-installation">
        <summary>
          <span>
            {cs ? "Kam skripty nainstalovat" : "Where to install scripts"}
          </span>
          <b aria-hidden="true">＋</b>
        </summary>
        <div className="buffet-install-picker">
          <div
            className="buffet-install-row"
            aria-label={cs ? "Aplikace Adobe" : "Adobe application"}
          >
            {(["indesign", "illustrator", "photoshop"] as AdobeApp[]).map(
              (app) => (
                <button
                  className={`${app} ${installApp === app ? "active" : ""}`}
                  type="button"
                  key={app}
                  onClick={() => {
                    setInstallApp(app);
                    setCopiedInstallPath(false);
                  }}
                >
                  {appNames[language][app]}
                </button>
              ),
            )}
          </div>
          <div
            className="buffet-install-row platforms"
            aria-label={cs ? "Operační systém" : "Operating system"}
          >
            {(["macos", "windows"] as Platform[]).map((platform) => (
              <button
                className={installPlatform === platform ? "active" : ""}
                type="button"
                key={platform}
                onClick={() => {
                  setInstallPlatform(platform);
                  setCopiedInstallPath(false);
                }}
              >
                {platform === "macos" ? "macOS" : "Windows"}
              </button>
            ))}
          </div>
          <div className="buffet-install-path">
            <code>{installPaths[installApp][installPlatform]}</code>
            <button
              className="action-button action-button-primary action-button-compact"
              type="button"
              onClick={() => void copyInstallPath()}
            >
              <span>
                {copiedInstallPath
                  ? cs
                    ? "Zkopírováno"
                    : "Copied"
                  : cs
                    ? "Kopírovat cestu"
                    : "Copy path"}
              </span>
              <b>{copiedInstallPath ? "✓" : "▣"}</b>
            </button>
          </div>
        </div>
      </details>

      <nav
        className="buffet-filters"
        aria-label={cs ? "Filtrovat podle aplikace" : "Filter by application"}
      >
        {filters.map((value) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? (cs ? "Vše" : "All") : appNames[language][value]}
          </button>
        ))}
      </nav>

      <section className="buffet-grid" aria-live="polite">
        {visible.map((script) => (
          <article className="buffet-card" key={script.id}>
            <img
              src="/script-buffet/preview-placeholder.svg"
              alt={
                cs
                  ? `Dočasná ukázka skriptu ${script.name}`
                  : `${script.name} placeholder preview`
              }
            />
            <div className="buffet-card-body">
              <div className="buffet-tags">
                {script.apps.map((app) => (
                  <span className={app} key={app}>
                    {appNames[language][app]}
                  </span>
                ))}
              </div>
              <h2>{script.name}</h2>
              <p>{cs ? script.descriptionCs : script.description}</p>
              <footer>
                <a
                  className="action-button action-button-success"
                  href={script.href}
                  download
                  onClick={() => recordDownload(script.id)}
                >
                  <span>{cs ? "Stáhnout" : "Download"}</span>
                  <b aria-hidden="true">↓</b>
                </a>
                <small
                  title={
                    cs
                      ? "Stažení v tomto prohlížeči"
                      : "Downloads in this browser"
                  }
                >
                  ↓ {counts[script.id] || 0}
                </small>
              </footer>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
