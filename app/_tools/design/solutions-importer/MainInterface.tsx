"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { extractPositionedPdfText } from "./code/pdf";
import { solutionsImporterUi } from "./copy";
import { ToolHeader } from "../../../_components/ToolChrome";

type Language = "en" | "cs";
type SolutionOperation = {
  id: string;
  kind: "text" | "cross" | "circle" | "color_mark" | "note" | string;
  page: number;
  text?: string;
  hue?: string;
  confidence: number;
  status: "ready" | "review";
  enabled?: boolean;
  review_reason?: string;
};
type SolutionPage = {
  page: number;
  document_page: string;
  width: number;
  height: number;
  operations: SolutionOperation[];
};
type SolutionsManifest = {
  format: string;
  version: number;
  clean_pdf: string;
  manuscript_pdf: string;
  idml: string;
  printers_marks: boolean;
  settings?: { font_family: SolutionFont; point_size: 12 | 14 };
  summary: {
    pages: number;
    operations: number;
    text: number;
    crosses: number;
    circles: number;
    color_marks: number;
    notes: number;
    review: number;
    idml_tables: number;
    ignored_annotations: number;
  };
  document: {
    page_count: number;
    table_count: number;
    linked_artwork_count: number;
    layers: Array<{ name: string; visible: boolean; locked: boolean }>;
    paragraph_styles: string[];
    swatches: Array<{ name: string; space: string; values: number[] }>;
  };
  pages: SolutionPage[];
};
type InputKind = "clean" | "manuscript" | "idml";
type ReviewFilter = "all" | "ready" | "review";
type SolutionFont = "Arial" | "Noto Sans" | "Times New Roman";

export function SolutionsImporterMainInterface({ language }: { language: Language }) {
  const t = solutionsImporterUi[language];
  const [files, setFiles] = useState<Record<InputKind, File | null>>({ clean: null, manuscript: null, idml: null });
  const [manifest, setManifest] = useState<SolutionsManifest | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [printersMarks, setPrintersMarks] = useState(false);
  const [solutionFont, setSolutionFont] = useState<SolutionFont>("Noto Sans");
  const [solutionSize, setSolutionSize] = useState<12 | 14>(14);
  const cleanInput = useRef<HTMLInputElement>(null);
  const manuscriptInput = useRef<HTMLInputElement>(null);
  const idmlInput = useRef<HTMLInputElement>(null);
  const inputRefs = { clean: cleanInput, manuscript: manuscriptInput, idml: idmlInput };

  const filteredPages = useMemo(() => {
    if (!manifest) return [];
    return manifest.pages
      .map((page) => ({
        ...page,
        operations: page.operations.filter((operation) => filter === "all" || operation.status === filter),
      }))
      .filter((page) => page.operations.length > 0);
  }, [manifest, filter]);

  function resetResult() {
    setManifest(null);
    setExcluded(new Set());
    setReviewExpanded(false);
    setProgress(0);
    setLog([]);
    setError("");
  }

  function selectFile(kind: InputKind, file: File) {
    const extension = file.name.toLowerCase().split(".").pop();
    const valid = kind === "idml" ? extension === "idml" : extension === "pdf";
    if (!valid) {
      setError(kind === "idml" ? t.idmlError : t.pdfError);
      return;
    }
    setFiles((current) => ({ ...current, [kind]: file }));
    resetResult();
  }

  function handleInput(kind: InputKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectFile(kind, file);
    event.target.value = "";
  }

  function handleDrop(kind: InputKind, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(kind, file);
  }

  function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLog((current) => [...current, `[${timestamp}] ${message}`]);
  }

  async function analyse() {
    if (!files.clean || !files.manuscript || !files.idml || processing) return;
    setProcessing(true);
    setManifest(null);
    setExcluded(new Set());
    setReviewExpanded(false);
    setError("");
    setLog([]);
    setProgress(1);
    try {
      addLog(t.starting);
      addLog(`${t.clean}: ${files.clean.name}`);
      addLog(`${t.manuscript}: ${files.manuscript.name}`);
      addLog(`${t.idml}: ${files.idml.name}`);
      if (printersMarks) addLog(t.printersMarksLog);
      addLog("Extracting positioned text from the clean PDF…");
      const cleanText = await extractPositionedPdfText(files.clean, (page, total) => {
        setProgress(3 + Math.round((page / total) * 12));
        addLog(`Clean PDF text: page ${page}/${total}`);
      });
      addLog("Extracting positioned text from the manuscript PDF…");
      const manuscriptText = await extractPositionedPdfText(files.manuscript, (page, total) => {
        setProgress(15 + Math.round((page / total) * 12));
        addLog(`Manuscript PDF text: page ${page}/${total}`);
      });
      const json = await new Promise<string>(async (resolve, reject) => {
        const worker = new Worker("/solutions/pyodide-worker.js");
        worker.onmessage = (event: MessageEvent<{ type: string; message?: string; progress?: number; json?: string }>) => {
          const message = event.data;
          if (message.type === "log" && message.message) {
            if (typeof message.progress === "number") setProgress(message.progress);
            addLog(message.message);
          } else if (message.type === "result" && message.json) {
            worker.terminate();
            resolve(message.json);
          } else if (message.type === "error") {
            worker.terminate();
            reject(new Error(message.message || t.failed));
          }
        };
        worker.onerror = (event) => {
          worker.terminate();
          reject(new Error(event.message || t.failed));
        };
        const [clean, manuscript, idml] = await Promise.all([
          files.clean!.arrayBuffer(),
          files.manuscript!.arrayBuffer(),
          files.idml!.arrayBuffer(),
        ]);
        worker.postMessage(
          {
            clean,
            manuscript,
            idml,
            cleanName: files.clean!.name,
            manuscriptName: files.manuscript!.name,
            idmlName: files.idml!.name,
            cleanText,
            manuscriptText,
            printersMarks,
            language,
          },
          [clean, manuscript, idml],
        );
      });
      const parsed = JSON.parse(json) as SolutionsManifest;
      if (parsed.format !== "indesign-solutions-v2") throw new Error(t.failed);
      setManifest(parsed);
      setExcluded(new Set(parsed.pages.flatMap((page) => page.operations.filter((operation) => operation.enabled === false).map((operation) => operation.id))));
      setProgress(100);
      addLog(t.ready);
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : t.failed;
      setError(message);
      addLog(`${t.error}: ${message}`);
    } finally {
      setProcessing(false);
    }
  }

  function toggleOperation(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadManifest() {
    if (!manifest) return;
    const output: SolutionsManifest = JSON.parse(JSON.stringify(manifest));
    output.settings = { font_family: solutionFont, point_size: solutionSize };
    for (const page of output.pages) {
      for (const operation of page.operations) operation.enabled = !excluded.has(operation.id);
    }
    const sourceName = (files.manuscript?.name || manifest.manuscript_pdf).replace(/\.[^.]+$/, "") || "chapter";
    downloadText(`${JSON.stringify(output, null, 2)}\n`, `${sourceName}_Solutions.json`, "application/json");
  }

  function downloadText(text: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function operationTitle(operation: SolutionOperation) {
    return t.kinds[operation.kind as keyof typeof t.kinds] || operation.kind;
  }

  function operationDetail(operation: SolutionOperation) {
    if (operation.text) return operation.text;
    if (operation.hue) return `${t.colour}: ${operation.hue}`;
    return t.positionedMark;
  }

  const hasAllFiles = Boolean(files.clean && files.manuscript && files.idml);
  const solutionPreviewFont = solutionFont === "Times New Roman" ? solutionFont : "Arial";
  const analysisComplete = Boolean(manifest && !processing);

  return (
    <div className="solutions-module solutions-detail-module">
      <ToolHeader className="solutions-header" code={language === "cs" ? "DESIGN / ŘEŠENÍ" : "DESIGN / SOLUTIONS"} title={t.heading} subtitle={t.subtitle} mode="local" />

      <section className="solutions-generator">
        <input ref={cleanInput} type="file" accept="application/pdf,.pdf" onChange={(event) => handleInput("clean", event)} hidden />
        <input ref={manuscriptInput} type="file" accept="application/pdf,.pdf" onChange={(event) => handleInput("manuscript", event)} hidden />
        <input ref={idmlInput} type="file" accept=".idml,application/octet-stream" onChange={(event) => handleInput("idml", event)} hidden />
        <div className="solutions-file-grid solutions-detail-files">
          {(["clean", "manuscript", "idml"] as InputKind[]).map((kind, index) => (
            <button
              key={kind}
              className={files[kind] ? "has-file" : ""}
              onClick={() => inputRefs[kind].current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(kind, event)}
            >
              <span>{String(index + 1).padStart(2, "0")} / {t[kind]}</span>
              <strong>{files[kind]?.name || t.choose}</strong>
              <b>{files[kind] ? "✓" : "+"}</b>
            </button>
          ))}
        </div>
        <div className="solutions-detail-options-row">
          <section className="solutions-detail-type-settings" aria-label={t.solutionTypography}>
            <div className="solutions-detail-type-intro">
              <i style={{ fontFamily: solutionPreviewFont }}>Aa</i>
              <span><b>{t.solutionTypography}</b><small>{solutionFont} · {solutionSize} pt</small></span>
            </div>
            <label>
              <span>{t.solutionFont}</span>
              <select value={solutionFont} onChange={(event) => setSolutionFont(event.target.value as SolutionFont)}>
                <option value="Arial">Arial</option>
                <option value="Noto Sans">Noto Sans</option>
                <option value="Times New Roman">Times New Roman</option>
              </select>
            </label>
            <label>
              <span>{t.solutionSize}</span>
              <select value={solutionSize} onChange={(event) => setSolutionSize(Number(event.target.value) as 12 | 14)}>
                <option value={12}>12 pt</option>
                <option value={14}>14 pt</option>
              </select>
            </label>
          </section>
          <label className="solutions-detail-printer-option">
            <input
              type="checkbox"
              checked={printersMarks}
              onChange={(event) => {
                setPrintersMarks(event.target.checked);
                resetResult();
              }}
            />
            <span><b>{t.printersMarks}</b><small>{t.printersMarksHelp}</small></span>
          </label>
        </div>
        {error && <p className="extraction-error" role="alert">{error}</p>}
        <button className={`solutions-create${analysisComplete ? " is-complete" : ""}`} onClick={() => void analyse()} disabled={!hasAllFiles || processing}>
          <span>{processing ? `${t.analysing} ${progress}%` : manifest ? t.analyseAgain : t.analyse}</span>
          <b>{processing ? "…" : "→"}</b>
        </button>
        {(processing || log.length > 0) && (
          <div className={`solutions-progress${analysisComplete ? " is-complete" : ""}`} aria-live="polite">
            <div className="solutions-progress-head"><span>{t.processLog}</span><b>{progress}%</b></div>
            <div className="solutions-progress-track"><i style={{ width: `${progress}%` }} /></div>
            <div className="solutions-console">{log.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)}</div>
          </div>
        )}
        <p className="solutions-privacy">{t.privacy}</p>
      </section>

      {manifest && (
        <section className="solutions-detail-review" aria-label={t.reviewHeading}>
          <div className="solutions-detail-review-head">
            <h2 className="solutions-detail-review-heading">
              <button
                type="button"
                className="solutions-detail-review-toggle"
                onClick={() => setReviewExpanded((current) => !current)}
                aria-expanded={reviewExpanded}
                aria-controls="solutions-report-details"
              >
                <span className="solutions-detail-review-title">
                  <span>{t.reviewKicker}</span>
                  <span className="solutions-detail-review-name">{t.reviewHeading}</span>
                </span>
                <b aria-hidden="true">{reviewExpanded ? "−" : "+"}</b>
              </button>
            </h2>
            <button type="button" className="solutions-detail-download" onClick={downloadManifest}>
              <span>{t.downloadJson}</span><b>↓</b>
            </button>
          </div>
          <dl className="solutions-detail-stats">
            <div><dt>{t.pages}</dt><dd>{manifest.summary.pages}</dd></div>
            <div><dt>{t.textOperations}</dt><dd>{manifest.summary.text}</dd></div>
            <div><dt>{t.visualMarks}</dt><dd>{manifest.summary.crosses + manifest.summary.circles + manifest.summary.color_marks}</dd></div>
            <div><dt>{t.idmlTables}</dt><dd>{manifest.summary.idml_tables}</dd></div>
            <div><dt>{t.needsReview}</dt><dd>{manifest.summary.review}</dd></div>
            <div><dt>{t.excluded}</dt><dd>{excluded.size}</dd></div>
          </dl>
          {reviewExpanded && (
            <div id="solutions-report-details" className="solutions-detail-review-body">
              <div className="solutions-detail-filter" role="tablist" aria-label={t.reviewFilter}>
                {(["all", "ready", "review"] as ReviewFilter[]).map((value) => (
                  <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} role="tab" aria-selected={filter === value}>{t.filters[value]}</button>
                ))}
              </div>
              <div className="solutions-detail-pages">
                {filteredPages.map((page) => {
                  const reviewCount = page.operations.filter((operation) => operation.status === "review").length;
                  return (
                    <details key={page.page}>
                      <summary>
                        <span>{t.pdfPage} {page.page}</span>
                        <strong>{t.bookPage} {page.document_page}</strong>
                        <small>{page.operations.length} {t.operations}{reviewCount ? ` · ${reviewCount} ${t.reviewShort}` : ""}</small>
                        <i>+</i>
                      </summary>
                      <div className="solutions-detail-operation-list">
                        {page.operations.map((operation) => (
                          <label key={operation.id} className={excluded.has(operation.id) ? "excluded" : ""}>
                            <input type="checkbox" checked={!excluded.has(operation.id)} onChange={() => toggleOperation(operation.id)} />
                            <span className={`solutions-detail-kind ${operation.status}`}>{operationTitle(operation)}</span>
                            <strong>{operationDetail(operation)}</strong>
                            <small>{Math.round(operation.confidence * 100)}%</small>
                          </label>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
              <p className="solutions-detail-review-note">{t.reviewNote}</p>
            </div>
          )}
        </section>
      )}

      <details className="solutions-guide">
        <summary>
          <span>{language === "cs" ? "Návod k instalaci a použití" : "Installation and usage guide"}</span>
          <b aria-hidden="true">＋</b>
        </summary>
        <div className="solutions-content">
        <aside className="solutions-summary">
          <span>{t.download}</span>
          <div className="solutions-downloads">
            <a href="/solutions/import_solutions.jsx" download>
              <b>JSX</b><span><strong>{t.importer}</strong><small>import_solutions.jsx</small></span><i>↓</i>
            </a>
          </div>
          <p className="solutions-script-help">{t.scriptChoice}</p>
          <span>{t.need}</span>
          <ul>{t.needs.map((item) => <li key={item}>{item}</li>)}</ul>
          <div className="solutions-note"><b>{t.warningTitle}</b><br />{t.warning}</div>
        </aside>

        <div className="solutions-steps">
          {t.steps.map(([title, body], index) => (
            <section className="solution-step" key={title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{title}</h2><p>{body}</p>
                {index === t.steps.length - 1 && <ul className="check-list">{t.checks.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>
            </section>
          ))}
          <section className="solutions-troubleshooting">
            <h2>{t.trouble}</h2>
            <dl>{t.troubles.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl>
          </section>
        </div>
        </div>
      </details>
    </div>
  );
}
