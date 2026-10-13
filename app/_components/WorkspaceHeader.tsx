"use client";

import { useEffect, useState, type RefObject } from "react";
import { copy, robotStatusPhrases } from "../content/ui";
import type { Language } from "../_tools/types";

function PageLoadStatus({ items }: { items: readonly string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setIndex(Math.floor(Math.random() * items.length)), 0);
    return () => window.clearTimeout(timer);
  }, [items]);
  return <span>{items[index]}</span>;
}

export default function WorkspaceHeader({ language, theme, sidebarOpen, feedbackOpen, infoOpen, bugReportButtonRef, onSidebar, onHome, onFeedback, onLanguage, onTheme, onInfo }: {
  language: Language;
  theme: "light" | "dark";
  sidebarOpen: boolean;
  feedbackOpen: boolean;
  infoOpen: boolean;
  bugReportButtonRef: RefObject<HTMLButtonElement | null>;
  onSidebar: () => void;
  onHome: () => void;
  onFeedback: () => void;
  onLanguage: () => void;
  onTheme: () => void;
  onInfo: () => void;
}) {
  const t = copy[language];
  return <header className="topbar">
    <div className="brand">
      <button className="brand-mark" onClick={onSidebar} aria-label={language === "cs" ? sidebarOpen ? "Zavřít postranní panel" : "Otevřít postranní panel" : sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen}><span className="brand-logo" aria-hidden="true" /></button>
      <button className="brand-name" onClick={onHome} aria-label={t.home}><strong>TAKTIK</strong> ROBOT</button>
    </div>
    <div className="topbar-controls">
      <span className="system-status"><i /><PageLoadStatus items={robotStatusPhrases[language]} /></span>
      <button ref={bugReportButtonRef} className={`utility icon-button bug-report ${feedbackOpen ? "pressed" : ""}`} onClick={onFeedback} aria-label={t.bugFeedback.heading} aria-expanded={feedbackOpen}><span aria-hidden="true" className="material-icons">bug_report</span></button>
      <button className="utility language" onClick={onLanguage} aria-label={t.changeLanguage}><span className={language === "en" ? "active-option" : ""}>EN</span><span>/</span><span className={language === "cs" ? "active-option" : ""}>CZ</span></button>
      <button className="utility icon-button" onClick={onTheme} aria-label={t.toggleTheme}><span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span></button>
      <button className={`utility icon-button ${infoOpen ? "pressed" : ""}`} onClick={onInfo} aria-label={t.openInformation} aria-expanded={infoOpen}><span aria-hidden="true">i</span></button>
    </div>
  </header>;
}
