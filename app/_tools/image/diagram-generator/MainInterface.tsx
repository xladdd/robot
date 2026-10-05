"use client";

import { useState, type ChangeEvent, type RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import {
  EmptyViewportState,
  ToolHeader,
} from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
import type { DiagramCheck, DiagramSpec } from "./code/diagram";
import type {
  BiologicalBriefV1,
  DiagramCandidate,
  DiagramPipelineOutput,
  DiagramReview,
  DiagramUsage,
  ReferenceSelection,
} from "./code/contracts";
import { diagramProcessing, diagramUi } from "./copy";

export type DiagramReference = { name: string; data: string };

/** Compatibility shape retained for the shared workspace's figure union. */
export type DiagramOutput = {
  svg: string;
  report: string;
  checks: DiagramCheck[];
  model: string;
  spec: DiagramSpec;
};

type Stage =
  | "input"
  | "planning"
  | "generating-candidates"
  | "candidate-selection"
  | "vectorizing"
  | "complete"
  | "reviewing";

type PlanResponse = {
  brief: BiologicalBriefV1;
  reference: ReferenceSelection;
  usage: DiagramUsage;
};
type CandidateResponse = {
  candidates: DiagramCandidate[];
  warnings?: string[];
};
type PipelineResponse = DiagramPipelineOutput & {
  error?: string;
  usage?: DiagramUsage;
};

async function postPipeline(action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/diagrams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const result = (await response.json()) as { error?: string } & Record<
    string,
    unknown
  >;
  if (!response.ok) throw new Error(result.error || "Diagram pipeline failed.");
  return result;
}

export function DiagramMainInterface({
  language,
  section,
  label,
  request,
  references,
  palette,
  paletteName,
  output: _legacyOutput,
  error: _legacyError,
  isGenerating: _legacyGenerating,

  referenceInputRef,
  paletteInputRef,
  onPaletteInput,
  onClearPalette,
  onReferenceInput,
  onRemoveReference,
  onRequest,
  onGenerate: _legacyGenerate,
  onDownload,
  onVerificationMarkdown,
}: {
  language: Language;
  section: string | null;
  label: string | null;
  request: string;
  references: DiagramReference[];
  palette: AseSwatch[];
  paletteName: string;
  output: DiagramOutput | null;
  error: string;
  isGenerating: boolean;

  referenceInputRef: RefObject<HTMLInputElement | null>;
  paletteInputRef: RefObject<HTMLInputElement | null>;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearPalette: () => void;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveReference: (index: number) => void;
  onRequest: (request: string) => void;
  onGenerate: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onVerificationMarkdown: (report: string) => string;
}) {
  void _legacyOutput;
  void _legacyGenerating;
  void _legacyGenerate;
  const t = diagramUi[language];
  const example =
    language === "cs"
      ? "Popsané biologické schéma měňavky pro žáky 2. stupně. Zobraz buněčnou membránu, cytoplazmu, jádro, potravní vakuolu, stažitelnou vakuolu a panožky."
      : "A labelled biological diagram of an amoeba for lower-secondary students. Show the cell membrane, cytoplasm, nucleus, food vacuole, contractile vacuole, and pseudopodia.";
  const [stage, setStage] = useState<Stage>("input");
  const [brief, setBrief] = useState<BiologicalBriefV1 | null>(null);
  const [reference, setReference] = useState<ReferenceSelection | null>(null);
  const [candidates, setCandidates] = useState<DiagramCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [pipelineOutput, setPipelineOutput] =
    useState<DiagramPipelineOutput | null>(null);
  const [review, setReview] = useState<DiagramReview | null>(null);
  const [repairUsed, setRepairUsed] = useState(false);
  const [pipelineError, setPipelineError] = useState("");
  const [usageRecords, setUsageRecords] = useState<DiagramUsage[]>([]);

  const busy =
    stage === "planning" ||
    stage === "generating-candidates" ||
    stage === "vectorizing" ||
    stage === "reviewing";
  const stageLabel =
    stage === "candidate-selection"
      ? t["candidate-selection"]
      : stage === "complete"
        ? t.complete
        : stage === "input"
          ? t.ready
          : t[stage];

  function resetWorkflow() {
    setStage("input");
    setBrief(null);
    setReference(null);
    setCandidates([]);
    setSelectedCandidate(0);
    setPipelineOutput(null);
    setReview(null);
    setRepairUsed(false);
    setPipelineError("");
    setUsageRecords([]);
  }

  async function generateWorkflow() {
    if (!request.trim() || busy) return;
    setPipelineError("");
    setBrief(null);
    setReference(null);
    setCandidates([]);
    setPipelineOutput(null);
    setReview(null);
    setRepairUsed(false);
    setUsageRecords([]);
    try {
      setStage("planning");
      const planned = (await postPipeline("plan", {
        request: request.trim(),
        language,
        references: references.map(({ data }) => data),
      })) as unknown as PlanResponse;
      setBrief(planned.brief);
      setReference(planned.reference);
      setUsageRecords([planned.usage]);
      setStage("generating-candidates");
      const generated = (await postPipeline("candidates", {
        brief: planned.brief,
        references: references.map(({ data }) => data),
        palette,
      })) as unknown as CandidateResponse;
      setCandidates(generated.candidates);
      setUsageRecords([
        planned.usage,
        ...generated.candidates.map((candidate) => candidate.usage),
      ]);
      setPipelineError(generated.warnings?.join(" ") || "");
      setSelectedCandidate(0);
      setStage("candidate-selection");
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : t.failed);
      setStage("input");
    }
  }

  async function vectorizeWorkflow() {
    const chosen = candidates[selectedCandidate];
    if (!brief || !chosen || busy) return;
    setPipelineError("");
    try {
      setStage("vectorizing");
      const result = (await postPipeline("vectorize", {
        brief,
        candidate: chosen.data,
        candidateModel: chosen.model,
        palette,
        referenceCount: references.length,
        priorUsage: usageRecords,
      })) as unknown as PipelineResponse;
      setPipelineOutput(result);
      if (result.usage)
        setUsageRecords((current) => [...current, result.usage!]);
      setReview(null);
      setStage("complete");
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : t.failed);
      setStage("candidate-selection");
    }
  }

  async function reviewWorkflow() {
    const chosen = candidates[selectedCandidate];
    if (!brief || !chosen || !pipelineOutput || busy) return;
    setPipelineError("");
    try {
      setStage("reviewing");
      const result = (await postPipeline("review", {
        brief,
        candidate: chosen.data,
        reconstruction: pipelineOutput.reconstruction,
      })) as { review: DiagramReview; usage: DiagramUsage[] };
      setReview(result.review);
      const nextUsage = [...usageRecords, ...(result.usage || [])];
      setUsageRecords(nextUsage);
      const report = JSON.parse(pipelineOutput.report) as Record<
        string,
        unknown
      >;
      setPipelineOutput({
        ...pipelineOutput,
        review: result.review,
        report: JSON.stringify(
          { ...report, usage: nextUsage, review: result.review },
          null,
          2,
        ),
      });
      setStage("complete");
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : t.failed);
      setStage("complete");
    }
  }

  async function repairWorkflow() {
    const chosen = candidates[selectedCandidate];
    if (!brief || !chosen || !pipelineOutput || !review || repairUsed || busy)
      return;
    setPipelineError("");
    try {
      setStage("vectorizing");
      const result = (await postPipeline("repair", {
        brief,
        candidate: chosen.data,
        candidateModel: chosen.model,
        reconstruction: pipelineOutput.reconstruction,
        findings: review.findings,
        palette,
        referenceCount: references.length,
        priorUsage: usageRecords,
      })) as unknown as PipelineResponse;
      setPipelineOutput(result);
      if (result.usage)
        setUsageRecords((current) => [...current, result.usage!]);
      setReview(null);
      setRepairUsed(true);
      setStage("complete");
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : t.failed);
      setStage("complete");
    }
  }

  const title = brief?.title || "diagram";
  const filename = `${
    title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "diagram"
  }`;

  return (
    <div className="cover-module visual-single-module diagram-module">
      <section className="cover-stage visual-single-stage diagram-stage">
        <ToolHeader
          className="cover-stage-head diagram-stage-head"
          code={`${section} / DIAGRAM`}
          title={label || "Diagram Generator"}
          mode="ai"
          language={language}
        />
        <section className="figure-result diagram-result">
          <div className="pane-label">
            <span>{stageLabel}</span>
            <span>
              {pipelineOutput
                ? "1000 × 750 / SVG 1.1"
                : "image-first / semantic vector"}
            </span>
          </div>
          <div className="figure-paper diagram-paper">
            {busy ? (
              <LoadingText items={diagramProcessing[language]} />
            ) : pipelineOutput ? (
              <div dangerouslySetInnerHTML={{ __html: pipelineOutput.svg }} />
            ) : stage === "candidate-selection" ? (
              <div className="diagram-candidate-preview">
                <img
                  src={candidates[selectedCandidate]?.data}
                  alt={t.candidateAlt}
                />
              </div>
            ) : (
              <EmptyViewportState>{t.empty}</EmptyViewportState>
            )}
          </div>
        </section>
      </section>
      <aside className="cover-toolbar editor-sidebar visual-single-toolbar diagram-toolbar">
        <section className="cover-control diagram-request-control">
          <div className="figure-label-row">
            <label htmlFor="diagram-request">{t.label}</label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                resetWorkflow();
                onRequest(example);
              }}
            >
              {t.example}
            </button>
          </div>
          <textarea
            id="diagram-request"
            value={request}
            onChange={(event) => {
              resetWorkflow();
              onRequest(event.target.value);
            }}
            placeholder={t.placeholder}
            rows={7}
            disabled={busy}
          />
        </section>
        {brief && (
          <section className="cover-control diagram-brief">
            <span>{t.brief}</span>
            <b>{brief.title}</b>
            <p>{brief.view}</p>
            <small>
              {brief.structures.map((item) => item.name).join(" · ")}
            </small>
            {reference?.id && (
              <small>
                {t.referenceMatch}: {reference.subject}
              </small>
            )}
          </section>
        )}
        <section className="cover-control">
          <div className="figure-palette">
            <span>{t.palette}</span>
            <input
              ref={paletteInputRef}
              type="file"
              accept=".ase,application/octet-stream"
              onChange={(event) => {
                resetWorkflow();
                onPaletteInput(event);
              }}
              disabled={busy}
              hidden
            />
            {palette.length ? (
              <>
                <div className="figure-palette-head">
                  <b>{paletteName}</b>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      resetWorkflow();
                      onClearPalette();
                    }}
                  >
                    {t.clearPalette}
                  </button>
                </div>
                <div className="figure-swatches">
                  {palette.map((swatch, index) => (
                    <i
                      key={`${swatch.name}-${index}`}
                      title={`${swatch.name} · ${swatch.model} · ${swatch.hex}`}
                      style={{ background: swatch.hex }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                className="figure-add-palette"
                disabled={busy}
                onClick={() => paletteInputRef.current?.click()}
              >
                <b>＋</b>
                {t.addPalette}
              </button>
            )}
          </div>
        </section>
        <section className="cover-control">
          <div className="figure-references">
            <span>{t.references}</span>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => {
                resetWorkflow();
                onReferenceInput(event);
              }}
              disabled={busy}
              hidden
            />
            <div>
              {references.map((referenceItem, index) => (
                <figure key={`${referenceItem.name}-${index}`}>
                  <img src={referenceItem.data} alt={referenceItem.name} />
                  <figcaption>{referenceItem.name}</figcaption>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      resetWorkflow();
                      onRemoveReference(index);
                    }}
                    aria-label={`${t.remove} ${referenceItem.name}`}
                  >
                    ×
                  </button>
                </figure>
              ))}
              {references.length < 3 && (
                <button
                  type="button"
                  className="figure-add-reference"
                  disabled={busy}
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <b>＋</b>
                  {t.addReference}
                </button>
              )}
            </div>
          </div>
        </section>
        {candidates.length > 0 && stage === "candidate-selection" && (
          <section className="cover-control diagram-candidates">
            <span>{t.candidates}</span>
            <div>
              {candidates.map((candidate, index) => (
                <button
                  type="button"
                  className={selectedCandidate === index ? "selected" : ""}
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(index)}
                >
                  <img
                    src={candidate.data}
                    alt={`${t.candidateAlt} ${index + 1}`}
                  />
                  <small>{candidate.model}</small>
                </button>
              ))}
            </div>
            <button
              className="action-button action-button-primary"
              type="button"
              onClick={() => void vectorizeWorkflow()}
            >
              {t.vectorize}
              <b>→</b>
            </button>
          </section>
        )}
        {(pipelineError || _legacyError) && (
          <p className="extraction-error" role="alert">
            {pipelineError || _legacyError}
          </p>
        )}
        {stage !== "candidate-selection" && (
          <button
            className="cover-generate action-button action-button-primary"
            onClick={() => void generateWorkflow()}
            disabled={!request.trim() || busy}
          >
            {busy ? t.generating : t.generate}
            <b>{busy ? "…" : "→"}</b>
          </button>
        )}
        {pipelineOutput && stage === "complete" && (
          <div className="diagram-actions">
            {!review && (
              <button
                className="action-button action-button-secondary"
                type="button"
                onClick={() => void reviewWorkflow()}
                disabled={busy}
              >
                {t.review}
              </button>
            )}
            {review?.repairRecommended && !repairUsed && (
              <button
                className="action-button action-button-secondary"
                type="button"
                onClick={() => void repairWorkflow()}
                disabled={busy}
              >
                {t.repair}
              </button>
            )}
            <div className="figure-checks">
              <span>{t.checks}</span>
              {pipelineOutput.checks.map((check, index) => (
                <p className={check.level} key={`${check.message}-${index}`}>
                  <b>{check.level === "pass" ? "✓" : "!"}</b>
                  {check.message}
                </p>
              ))}
            </div>
            {review && (
              <div className="diagram-review">
                <span>{t.reviewResult}</span>
                <p>{review.summary}</p>
                <small>
                  {t.scores}: {review.fidelity}/{review.editability}/
                  {review.completeness}/{review.biologicalConfidence}
                </small>
                {review.findings.map((finding, index) => (
                  <p
                    className={finding.severity}
                    key={`${finding.message}-${index}`}
                  >
                    {finding.message}
                  </p>
                ))}
              </div>
            )}
            <div className="cover-export-actions cover-toolbar-exports diagram-export-actions">
              <button
                className="cover-export action-button action-button-success"
                onClick={() =>
                  onDownload(
                    pipelineOutput.svg,
                    `${filename}.svg`,
                    "image/svg+xml",
                  )
                }
              >
                {t.downloadSvg}
              </button>
              <button
                className="cover-export action-button action-button-success"
                onClick={() =>
                  onDownload(
                    onVerificationMarkdown(pipelineOutput.report),
                    "figure-verification.md",
                    "text/markdown",
                  )
                }
              >
                {t.downloadReport}
              </button>
            </div>
          </div>
        )}
        <p className="cover-note">{t.warning}</p>
      </aside>
    </div>
  );
}
