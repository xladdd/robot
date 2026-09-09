import type { Language } from "../../registry";
import { grepBuilderCopy } from "./copy";
import { ToolMeta } from "../../../_components/ToolChrome";

type GrepResult = { findWhat: string; replaceWith: string };

type GrepMainInterfaceProps = {
  language: Language;
  section: string | null;
  findPrompt: string;
  replacePrompt: string;
  result: GrepResult | null;
  error: string;
  copied: "find" | "replace" | null;
  isGenerating: boolean;
  onFindPrompt: (value: string) => void;
  onReplacePrompt: (value: string) => void;
  onCopy: (value: string, field: "find" | "replace") => void;
  onGenerate: () => void;
  onReset: () => void;
};

export function GrepMainInterface(props: GrepMainInterfaceProps) {
  const { result } = props;
  const t = grepBuilderCopy[props.language];
  return (
    <div className="grep-module compact-tool tool-family tool-family-compact">
      <ToolMeta code={`${props.section} / GREP`} mode="ai" />
      <h1>{t.heading}</h1>
      <div className="grep-fields compact-fields">
        <label className={`grep-field compact-field ${result ? "has-result" : ""}`}>
          <span>{t.findLabel}</span>
          <input
            value={result?.findWhat ?? props.findPrompt}
            onChange={(event) => props.onFindPrompt(event.target.value)}
            readOnly={Boolean(result)}
          />
          {result && <button onClick={() => props.onCopy(result.findWhat, "find")} aria-label={t.copyLabel}>{props.copied === "find" ? "✓" : "▣"}</button>}
        </label>
        <label className={`grep-field compact-field ${result ? "has-result" : ""}`}>
          <span>{t.replaceLabel}</span>
          <input
            value={result?.replaceWith ?? props.replacePrompt}
            onChange={(event) => props.onReplacePrompt(event.target.value)}
            readOnly={Boolean(result)}
          />
          {result && <button onClick={() => props.onCopy(result.replaceWith, "replace")} aria-label={t.copyLabel}>{props.copied === "replace" ? "✓" : "▣"}</button>}
        </label>
      </div>
      {props.error && (
        <p className="extraction-error" role="alert">
          {props.error}
        </p>
      )}
      <button
        className="grep-generate compact-action"
        onClick={result ? props.onReset : props.onGenerate}
        disabled={
          !result && (!props.findPrompt.trim() ||
            !props.replacePrompt.trim() ||
            props.isGenerating)
        }
      >
        <span>{result ? t.tryAgainLabel : t.generateLabel}</span>
        <b>{props.isGenerating ? "…" : "→"}</b>
      </button>
    </div>
  );
}
