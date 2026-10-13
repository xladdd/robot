"use client";

import ReactMarkdown from "react-markdown";
import { copy } from "../content/ui";
import type { Language } from "../_tools/types";

export default function InfoDrawer({ open, language, selected, label, markdown, onClose }: {
  open: boolean;
  language: Language;
  selected: string | null;
  label: string | null;
  markdown: string;
  onClose: () => void;
}) {
  const t = copy[language];
  return <>
    {open && <button className="drawer-scrim" onClick={onClose} aria-label={t.close} />}
    <aside className={`info-drawer${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="drawer-header"><span>INFO / {selected?.toUpperCase() || "ROBOT"}</span><button onClick={onClose} aria-label={t.close}>×</button></div>
      <div className="drawer-content"><h2>{label || t.about}</h2><ReactMarkdown>{markdown}</ReactMarkdown></div>
      <div className="orange-block" aria-hidden="true" />
    </aside>
  </>;
}
