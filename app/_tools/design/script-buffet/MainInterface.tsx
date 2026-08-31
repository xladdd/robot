"use client";

import { useEffect, useState } from "react";
import type { Language } from "../../registry";

type AdobeApp = "indesign" | "illustrator" | "photoshop";
type Filter = "all" | AdobeApp;

const scripts = [
  {
    id: "solutions-simple",
    name: "Solutions Importer: Simple",
    description: "Places reviewed solution text directly at the matching PDF coordinates.",
    descriptionCs: "Vloží zkontrolovaný text řešení přímo na odpovídající souřadnice z PDF.",
    apps: ["indesign"] as AdobeApp[],
    href: "/solutions/import_solutions_simple.jsx",
  },
  {
    id: "solutions-advanced",
    name: "Solutions Importer: Advanced",
    description: "Places solutions into table cells and aligns answer frames when the layout can be recognised.",
    descriptionCs: "Vkládá řešení do buněk tabulek a zarovnává pole odpovědí, pokud rozpozná layout.",
    apps: ["indesign"] as AdobeApp[],
    href: "/solutions/import_solutions_advanced.jsx",
  },
] as const;

const appNames: Record<Language, Record<AdobeApp, string>> = {
  en: { indesign: "InDesign", illustrator: "Illustrator", photoshop: "Photoshop" },
  cs: { indesign: "InDesign", illustrator: "Illustrator", photoshop: "Photoshop" },
};

export function ScriptBuffetMainInterface({ language }: { language: Language }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const cs = language === "cs";

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const script of scripts) {
      next[script.id] = Number(window.localStorage.getItem(`script-buffet:${script.id}`) || 0);
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

  const visible = scripts.filter((script) => filter === "all" || script.apps.includes(filter));
  const filters: Filter[] = ["all", "indesign", "illustrator", "photoshop"];

  return (
    <div className="buffet-module">
      <header className="buffet-header">
        <div>
          <span className="module-code">{cs ? "DESIGN / SKRIPTY" : "DESIGN / SCRIPTS"}</span>
          <h1>Script Buffet</h1>
          <p>{cs ? "Užitečné produkční skripty pro aplikace Adobe na jednom místě." : "Useful production scripts for Adobe applications, kept in one place."}</p>
        </div>
      </header>

      <details className="buffet-installation">
        <summary><span>{cs ? "Kam skripty nainstalovat" : "Where to install scripts"}</span><i>+</i></summary>
        <div className="buffet-install-grid">
          <section>
            <span>InDesign</span>
            <p><b>macOS</b><code>~/Library/Preferences/Adobe InDesign/Version [version]/[language]/Scripts/Scripts Panel</code></p>
            <p><b>Windows</b><code>%APPDATA%\Adobe\InDesign\Version [version]\[language]\Scripts\Scripts Panel</code></p>
          </section>
          <section>
            <span>Illustrator</span>
            <p><b>macOS</b><code>/Applications/Adobe Illustrator [version]/Presets/[language]/Scripts</code></p>
            <p><b>Windows</b><code>C:\Program Files\Adobe\Adobe Illustrator [version]\Presets\[language]\Scripts</code></p>
          </section>
          <section>
            <span>Photoshop</span>
            <p><b>macOS</b><code>/Applications/Adobe Photoshop [version]/Presets/Scripts</code></p>
            <p><b>Windows</b><code>C:\Program Files\Adobe\Adobe Photoshop [version]\Presets\Scripts</code></p>
          </section>
        </div>
      </details>

      <nav className="buffet-filters" aria-label={cs ? "Filtrovat podle aplikace" : "Filter by application"}>
        {filters.map((value) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {value === "all" ? (cs ? "Vše" : "All") : appNames[language][value]}
          </button>
        ))}
      </nav>

      <section className="buffet-grid" aria-live="polite">
        {visible.map((script) => (
          <article className="buffet-card" key={script.id}>
            <img src="/script-buffet/preview-placeholder.svg" alt={cs ? `Dočasná ukázka skriptu ${script.name}` : `${script.name} placeholder preview`} />
            <div className="buffet-card-body">
              <div className="buffet-tags">{script.apps.map((app) => <span className={app} key={app}>{appNames[language][app]}</span>)}</div>
              <h2>{script.name}</h2>
              <p>{cs ? script.descriptionCs : script.description}</p>
              <footer>
                <a href={script.href} download onClick={() => recordDownload(script.id)}>
                  <span>{cs ? "Stáhnout" : "Download"}</span><b aria-hidden="true">↓</b>
                </a>
                <small title={cs ? "Stažení v tomto prohlížeči" : "Downloads in this browser"}>↓ {counts[script.id] || 0}</small>
              </footer>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
