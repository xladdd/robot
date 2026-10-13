"use client";

import { brandGuidelinesUrl, copy } from "../content/ui";
import { completedApps, groups, sidebarStatuses, type AppId } from "../_tools/registry";
import { toolDefinitions } from "../_tools/generated/registry.data";
import type { Language } from "../_tools/types";

type Category = "text" | "image" | "design";
export default function WorkspaceSidebar({ language, selected, open, comingSoon, onGroup, onSelect, onManual }: {
  language: Language;
  selected: string | null;
  open: Record<Category, boolean>;
  comingSoon: string | null;
  onGroup: (category: Category) => void;
  onSelect: (id: AppId) => void;
  onManual: () => void;
}) {
  const t = copy[language];
  return <aside className="sidebar" aria-label={t.tools}>
    {groups.map((group) => <section className="nav-group" key={group.key}>
      <button className="group-toggle" onClick={() => onGroup(group.key)} aria-expanded={open[group.key]}><span>{t[group.key]}</span><span className="disclosure" aria-hidden="true">{open[group.key] ? "−" : "+"}</span></button>
      {open[group.key] && <div className="nav-items">{group.items.map((item, index) => {
        const status = sidebarStatuses[item];
        const label = toolDefinitions.find((tool) => tool.id === item)!.label[language];
        return <button className={`nav-item ${selected === item ? "selected" : ""} ${completedApps.has(item) ? "" : "unavailable"} ${status ? "has-sidebar-status" : ""}`} key={item} data-app-id={item} onClick={() => onSelect(item)} aria-disabled={!completedApps.has(item)}>
          <span className="item-number">{String(index + 1).padStart(2, "0")}</span><span>{label}</span>
          {status && <span className={`sidebar-status sidebar-status-${status}`} aria-hidden="true">{status === "tested" ? "✓" : status === "to-test" ? "T" : "α"}</span>}
          {comingSoon === item && <span className="coming-soon-tooltip" role="status">{t.comingSoon}</span>}
        </button>;
      })}</div>}
    </section>)}
    <nav className="sidebar-reference" aria-label={language === "cs" ? "Referenční materiály" : "Reference materials"}>
      <button className={`nav-item reference-item ${selected === "manual" ? "selected" : ""}`} onClick={onManual}><span className="book-icon" aria-hidden="true" /><span>{t.apps.manual}</span></button>
      <a className="nav-item reference-item" href={brandGuidelinesUrl} target="_blank" rel="noreferrer"><span className="book-icon" aria-hidden="true" /><span>{t.apps.brand}</span><span className="external-mark" aria-hidden="true">↗</span></a>
    </nav>
  </aside>;
}
