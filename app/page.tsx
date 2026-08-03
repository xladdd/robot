"use client";

import { useEffect, useState } from "react";

type Language = "en" | "cs";
type Theme = "light" | "dark";

const copy = {
  en: {
    prompt: "How can I help you?",
    text: "Text",
    design: "Design",
    apps: {
      extraction: "Text Extraction",
      index: "Index Creator",
      typesetter: "Typesetter",
      prompt: "Prompt Extraction",
      image: "Image Generation",
      cover: "Cover Generator",
      figure: "Figure Generator",
    },
    ready: "Ready to start",
    choose: "Choose a file or begin a new task.",
    about: "About Taktik Automat",
    aboutBody:
      "A focused workspace for preparing textbook content, layouts and visual materials.",
    close: "Close information",
  },
  cs: {
    prompt: "Jak vám mohu pomoci?",
    text: "Text",
    design: "Design",
    apps: {
      extraction: "Extrakce textu",
      index: "Tvůrce rejstříku",
      typesetter: "Sazba",
      prompt: "Extrakce promptů",
      image: "Generování obrázků",
      cover: "Generátor obálek",
      figure: "Generátor ilustrací",
    },
    ready: "Připraveno",
    choose: "Vyberte soubor nebo začněte nový úkol.",
    about: "O aplikaci Taktik Automat",
    aboutBody:
      "Soustředěné pracovní prostředí pro přípravu učebnic, sazby a obrazových materiálů.",
    close: "Zavřít informace",
  },
} as const;

const groups = [
  { key: "text" as const, items: ["extraction", "index"] as const },
  {
    key: "design" as const,
    items: ["typesetter", "prompt", "image", "cover", "figure"] as const,
  },
];

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [open, setOpen] = useState({ text: true, design: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const t = copy[language];

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ta-theme") as Theme | null;
    const savedLanguage = window.localStorage.getItem("ta-language") as Language | null;
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedLanguage === "cs" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("ta-theme", next);
  }

  function toggleLanguage() {
    const next = language === "en" ? "cs" : "en";
    setLanguage(next);
    window.localStorage.setItem("ta-language", next);
  }

  const selectedLabel = selected
    ? t.apps[selected as keyof typeof t.apps]
    : null;

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <button className="brand" onClick={() => setSelected(null)} aria-label="Taktik Automat home">
          <span className="brand-mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
          </span>
          <span><strong>TAKTIK</strong> AUTOMAT</span>
        </button>

        <div className="topbar-controls">
          <span className="system-status"><i /> SYSTEM READY</span>
          <button className="utility language" onClick={toggleLanguage} aria-label="Change language">
            <span className={language === "en" ? "active-option" : ""}>EN</span>
            <span>/</span>
            <span className={language === "cs" ? "active-option" : ""}>CZ</span>
          </button>
          <button className="utility icon-button" onClick={toggleTheme} aria-label="Toggle color theme">
            <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
          </button>
          <button
            className={`utility icon-button ${infoOpen ? "pressed" : ""}`}
            onClick={() => setInfoOpen(true)}
            aria-label="Open information"
          >
            <span aria-hidden="true">i</span>
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Tools">
        {groups.map((group) => (
          <section className="nav-group" key={group.key}>
            <button
              className="group-toggle"
              onClick={() => setOpen((state) => ({ ...state, [group.key]: !state[group.key] }))}
              aria-expanded={open[group.key]}
            >
              <span>{t[group.key]}</span>
              <span className="disclosure" aria-hidden="true">{open[group.key] ? "−" : "+"}</span>
            </button>
            {open[group.key] && (
              <div className="nav-items">
                {group.items.map((item, index) => (
                  <button
                    className={`nav-item ${selected === item ? "selected" : ""}`}
                    key={item}
                    onClick={() => setSelected(item)}
                  >
                    <span className="item-number">{String(index + 1).padStart(2, "0")}</span>
                    <span>{t.apps[item]}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </aside>

      <section className="workspace">
        <div className="workspace-grid" aria-hidden="true" />
        <span className="axis axis-x">01</span>
        <span className="axis axis-y">A</span>
        <div className={`welcome ${selectedLabel ? "has-selection" : ""}`}>
          {selectedLabel ? (
            <>
              <div className="module-code">MODULE / {selected?.toUpperCase()}</div>
              <h1>{selectedLabel}</h1>
              <p>{t.choose}</p>
              <button className="start-button">{t.ready}<span>→</span></button>
            </>
          ) : (
            <>
              <div className="crosshair" aria-hidden="true"><span /><span /></div>
              <h1>{t.prompt}</h1>
              <p className="welcome-subtitle">TAKTIK AUTOMAT / PUBLISHING WORKSPACE</p>
            </>
          )}
        </div>
        <div className="workspace-status">
          <span>LOCAL</span><span>v0.1</span><span>08—2026</span>
        </div>
      </section>

      {infoOpen && <button className="drawer-scrim" onClick={() => setInfoOpen(false)} aria-label={t.close} />}
      <aside className={`info-drawer ${infoOpen ? "open" : ""}`} aria-hidden={!infoOpen}>
        <div className="drawer-header">
          <span>INFO / 01</span>
          <button onClick={() => setInfoOpen(false)} aria-label={t.close}>×</button>
        </div>
        <div className="drawer-content">
          <span className="drawer-kicker">TAKTIK AUTOMAT</span>
          <h2>{t.about}</h2>
          <p>{t.aboutBody}</p>
          <dl>
            <div><dt>STATUS</dt><dd>PROTOTYPE</dd></div>
            <div><dt>VERSION</dt><dd>0.1.0</dd></div>
            <div><dt>LANGUAGE</dt><dd>{language.toUpperCase()}</dd></div>
          </dl>
        </div>
        <div className="orange-block" aria-hidden="true" />
      </aside>
    </main>
  );
}
