"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BugFeedbackDialog } from "./_components/BugFeedbackDialog";
import WorkspaceHeader from "./_components/WorkspaceHeader";
import WorkspaceSidebar from "./_components/WorkspaceSidebar";
import WorkspaceClock from "./_components/WorkspaceClock";
import InfoDrawer from "./_components/InfoDrawer";
import ToolHost from "./_components/ToolHost";
import DesignManualTool from "./_tools/design-manual/Tool";
import type { ManualContent } from "./_tools/design-manual/parse";
import { toolDefinitions } from "./_tools/generated/registry.data";
import {
  completedApps,
  groups,
  type AppId,
  type InfoDrawers,
} from "./_tools/registry";
import type { Language, ToolDiagnostics } from "./_tools/types";
import type { FeedbackDiagnostics } from "./_feedback/types";
import { copy } from "./content/ui";

type Theme = "light" | "dark";
const idleDiagnostics: ToolDiagnostics = {
  appStatus: "idle",
  progress: null,
  inputSummary: {
    hasInput: false,
    fileType: null,
    fileSize: null,
    referenceCount: 0,
    hasResult: false,
  },
};

export default function Workspace({
  infoDrawers,
  manuals,
  username,
}: {
  infoDrawers: InfoDrawers;
  manuals: Record<Language, ManualContent>;
  username: string;
}) {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [open, setOpen] = useState({ text: true, image: true, design: true });
  const [selected, setSelected] = useState<AppId | "manual" | null>(null);
  const [manualVisited, setManualVisited] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDiagnostics, setFeedbackDiagnostics] =
    useState<FeedbackDiagnostics | null>(null);
  const [comingSoon, setComingSoon] = useState<AppId | null>(null);
  const comingSoonTimer = useRef<number | null>(null);
  const bugReportButtonRef = useRef<HTMLButtonElement>(null);
  const diagnostics = useRef<Partial<Record<AppId, ToolDiagnostics>>>({});
  const t = copy[language];
  const definition = toolDefinitions.find((tool) => tool.id === selected);
  const selectedLabel =
    selected === "manual"
      ? t.apps.manual
      : (definition?.label[language] ?? null);
  const selectedGroup = groups.find((group) =>
    group.items.some((id) => id === selected),
  );
  const selectedNumber =
    selected === "manual"
      ? "01"
      : selectedGroup
        ? String(
            selectedGroup.items.findIndex((id) => id === selected) + 1,
          ).padStart(2, "0")
        : null;
  const selectedInitial = selectedLabel
    ?.trim()
    .charAt(0)
    .toLocaleUpperCase(language === "cs" ? "cs-CZ" : "en-US");
  const reportDiagnostics = useCallback(
    (id: AppId, summary: ToolDiagnostics) => {
      diagnostics.current[id] = summary;
    },
    [],
  );

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem("robot-theme") ||
      window.localStorage.getItem("ta-theme");
    const savedLanguage =
      window.localStorage.getItem("robot-language") ||
      window.localStorage.getItem("ta-language");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedLanguage === "cs" || savedLanguage === "en")
      setLanguage(savedLanguage);
  }, []);
  useEffect(
    () => () => {
      if (comingSoonTimer.current !== null)
        window.clearTimeout(comingSoonTimer.current);
    },
    [],
  );

  function selectApp(id: AppId) {
    if (completedApps.has(id)) {
      setComingSoon(null);
      setSelected(id);
      return;
    }
    setComingSoon(id);
    if (comingSoonTimer.current !== null)
      window.clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = window.setTimeout(
      () => setComingSoon(null),
      4000,
    );
  }

  function openBugFeedback() {
    const summary =
      selected && selected !== "manual"
        ? (diagnostics.current[selected] ?? idleDiagnostics)
        : idleDiagnostics;
    setFeedbackDiagnostics({
      selectedTool: selected,
      selectedToolName: selectedLabel || "Taktik Robot",
      language,
      theme,
      sidebarOpen,
      infoOpen,
      pathname: window.location.pathname,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent.slice(0, 300),
      online: navigator.onLine,
      ...summary,
      capturedAt: new Date().toISOString(),
    });
    setFeedbackOpen(true);
  }

  return (
    <main
      className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}
      data-theme={theme}
    >
      <WorkspaceHeader
        language={language}
        theme={theme}
        sidebarOpen={sidebarOpen}
        feedbackOpen={feedbackOpen}
        infoOpen={infoOpen}
        bugReportButtonRef={bugReportButtonRef}
        onSidebar={() => setSidebarOpen((value) => !value)}
        onHome={() => setSelected(null)}
        onFeedback={openBugFeedback}
        onLanguage={() => {
          const next = language === "en" ? "cs" : "en";
          setLanguage(next);
          window.localStorage.setItem("robot-language", next);
        }}
        onTheme={() => {
          const next = theme === "light" ? "dark" : "light";
          setTheme(next);
          window.localStorage.setItem("robot-theme", next);
        }}
        onInfo={() => setInfoOpen((value) => !value)}
      />
      <WorkspaceSidebar
        language={language}
        selected={selected}
        open={open}
        comingSoon={comingSoon}
        onGroup={(key) =>
          setOpen((current) => ({ ...current, [key]: !current[key] }))
        }
        onSelect={selectApp}
        onManual={() => {
          setManualVisited(true);
          setSelected("manual");
        }}
      />
      <section
        className={`workspace ${selected === "image" ? "image-generator-active" : ""}`.trim()}
      >
        <div className="workspace-grid" aria-hidden="true" />
        {selectedNumber && (
          <span className="axis axis-x">{selectedNumber}</span>
        )}
        {selectedInitial && (
          <span className="axis axis-y">{selectedInitial}</span>
        )}
        <ToolHost
          selected={selected === "manual" ? null : selected}
          language={language}
          onDiagnostics={reportDiagnostics}
        />
        {manualVisited && (
          <div
            className="tool-slot"
            data-tool-id="manual"
            hidden={selected !== "manual"}
            inert={selected !== "manual"}
          >
            <DesignManualTool
              language={language}
              active={selected === "manual"}
              section="REFERENCE"
              label={t.apps.manual}
              manuals={manuals}
            />
          </div>
        )}
        {!selected && (
          <div className="welcome">
            <div className="crosshair" aria-hidden="true">
              <span />
              <span />
            </div>
            <h1>{t.prompt}</h1>
          </div>
        )}
        {selected !== "extraction" &&
          selected !== "index" &&
          selected !== "prompt" && <WorkspaceClock />}
      </section>
      <BugFeedbackDialog
        open={feedbackOpen}
        language={language}
        username={username}
        diagnostics={feedbackDiagnostics}
        triggerRef={bugReportButtonRef}
        onCloseAction={() => setFeedbackOpen(false)}
      />
      <InfoDrawer
        open={infoOpen}
        language={language}
        selected={selected}
        label={selectedLabel}
        markdown={
          (selected ? infoDrawers[language][selected] : undefined) ??
          infoDrawers[language].general
        }
        onClose={() => setInfoOpen(false)}
      />
    </main>
  );
}
