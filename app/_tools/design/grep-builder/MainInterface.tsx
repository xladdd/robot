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
};

export function GrepMainInterface(props: GrepMainInterfaceProps) {
  const { result } = props;
  const t = grepBuilderCopy[props.language];
  return (
    <div className="grep-module">
      <ToolMeta code={`${props.section} / GREP`} mode="ai" />
      <h1>{t.heading}</h1>
      <div className="grep-fields">
        <label className="grep-field">
          <span>{t.findLabel}</span>
          <input
            value={props.findPrompt}
            onChange={(event) => props.onFindPrompt(event.target.value)}
          />
        </label>
        <label className="grep-field">
          <span>{t.replaceLabel}</span>
          <input
            value={props.replacePrompt}
            onChange={(event) => props.onReplacePrompt(event.target.value)}
          />
        </label>
      </div>
      {props.error && (
        <p className="extraction-error" role="alert">
          {props.error}
        </p>
      )}
      <button
        className="grep-generate"
        onClick={props.onGenerate}
        disabled={
          (!props.findPrompt.trim() ||
            !props.replacePrompt.trim() ||
            props.isGenerating)
        }
      >
        <span>{result ? t.tryAgainLabel : t.generateLabel}</span>
        <b>{props.isGenerating ? "…" : "→"}</b>
      </button>
      {result && (
        <section className="grep-results" aria-label={t.copyLabel}>
          <div className="pane-label"><span>{t.heading}</span><span>GREP</span></div>
          <div className="grep-result-row"><span>{t.findLabel}</span><code>{result.findWhat}</code><button onClick={() => props.onCopy(result.findWhat, "find")} aria-label={t.copyLabel}>{props.copied === "find" ? "✓" : "▣"}</button></div>
          <div className="grep-result-row"><span>{t.replaceLabel}</span><code>{result.replaceWith}</code><button onClick={() => props.onCopy(result.replaceWith, "replace")} aria-label={t.copyLabel}>{props.copied === "replace" ? "✓" : "▣"}</button></div>
        </section>
      )}
    </div>
  );
}
