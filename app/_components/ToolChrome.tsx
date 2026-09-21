import type { ReactNode } from "react";

export type ProcessingMode = "ai" | "local";
type Language = "en" | "cs";

export function ProcessingBadge({
  mode,
  language,
}: {
  mode: ProcessingMode;
  language: Language;
}) {
  return (
    <span className={`processing-badge processing-badge-${mode}`}>
      <i aria-hidden="true" />
      {language === "cs"
        ? mode === "ai"
          ? "AI AKTIVNÍ"
          : "ZPRACOVÁNO MÍSTNĚ"
        : mode === "ai"
          ? "AI ENABLED"
          : "PROCESSED LOCALLY"}
    </span>
  );
}

export function ToolMeta({
  mode,
  language,
  className = "",
}: {
  code: string;
  mode: ProcessingMode;
  language: Language;
  className?: string;
}) {
  return (
    <div className={`tool-header-meta ${className}`.trim()}>
      <ProcessingBadge mode={mode} language={language} />
    </div>
  );
}

export function ToolHeader({
  code,
  title,
  mode,
  language,
  actions,
  className = "",
}: {
  code: string;
  title: string;
  mode: ProcessingMode;
  language: Language;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`tool-header ${className}`.trim()}>
      <div className="tool-header-copy">
        <ToolMeta code={code} mode={mode} language={language} />
        <h1>{title}</h1>
      </div>
      {actions && <div className="tool-header-actions">{actions}</div>}
    </header>
  );
}

export function CrosshairInstruction({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`crosshair-instruction ${className}`.trim()}>
      <div className="crosshair" aria-hidden="true">
        <span />
        <span />
      </div>
      <p>{children}</p>
    </div>
  );
}

export const EmptyViewportState = CrosshairInstruction;
