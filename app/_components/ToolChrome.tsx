import type { ReactNode } from "react";

export type ProcessingMode = "ai" | "local";

export function ProcessingBadge({ mode }: { mode: ProcessingMode }) {
  return (
    <span className={`processing-badge processing-badge-${mode}`}>
      <i aria-hidden="true" />
      {mode === "ai" ? "AI ENABLED" : "PROCESSED LOCALLY"}
    </span>
  );
}

export function ToolMeta({ code, mode, className = "" }: {
  code: string;
  mode: ProcessingMode;
  className?: string;
}) {
  return (
    <div className={`tool-header-meta ${className}`.trim()}>
      <span className="module-code">{code}</span>
      <ProcessingBadge mode={mode} />
    </div>
  );
}

export function ToolHeader({ code, title, subtitle, mode, actions, className = "" }: {
  code: string;
  title: string;
  subtitle?: string;
  mode: ProcessingMode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`tool-header ${className}`.trim()}>
      <div className="tool-header-copy">
        <ToolMeta code={code} mode={mode} />
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="tool-header-actions">{actions}</div>}
    </header>
  );
}
