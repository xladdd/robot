"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import { EmptyViewportState, ToolMeta } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { ToolProps } from "../../types";
import { styleTrainerUi } from "./copy";
import type { StylePlan } from "./code/plan";

type StyleReference = { name: string; data: string };
type ImageUsage = {
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
type GeneratedImage = {
  data: string;
  seed: number;
  model: string;
  resolution: string;
  generationId?: string;
  usage: ImageUsage;
};
type RoundJob = {
  id: string;
  status: "queued" | "generating" | "complete" | "failed" | "stopped";
  image?: GeneratedImage;
  error?: string;
};
type ChatEntry = { id: string; author: "user" | "planner"; text: string };
type Submission = {
  status: "idle" | "sending" | "sent" | "error";
  taskUrl: string | null;
};

const MAX_REFERENCES = 6;
const ROUND_SIZE = 3;

function prepareReferenceImage(file: File) {
  const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!supportedTypes.includes(file.type))
    return Promise.reject(
      new Error(`${file.name}: use a PNG, JPEG, or WebP image.`),
    );
  if (file.size > 30_000_000)
    return Promise.reject(
      new Error(`${file.name}: the source image is larger than 30 MB.`),
    );

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(
        1,
        1600 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(
          new Error(`${file.name}: the browser could not prepare this image.`),
        );
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(`${file.name}: the image could not be compressed.`),
            );
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error(`${file.name}: the image could not be read.`));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.88,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`${file.name}: the image could not be opened.`));
    };
    image.src = objectUrl;
  });
}

function safeFilename(styleId: string, seed: number) {
  return `${styleId || "style"}-${seed}-1K.jpg`;
}

export function StyleTrainerMainInterface({
  language,
  onDiagnostics,
  active = true,
}: {
  language: Language;
  onDiagnostics?: ToolProps["onDiagnostics"];
  active?: boolean;
}) {
  const t = styleTrainerUi[language];
  const [references, setReferences] = useState<StyleReference[]>([]);
  const [testPrompt, setTestPrompt] = useState("");
  const [plan, setPlan] = useState<StylePlan | null>(null);
  const [roundJobs, setRoundJobs] = useState<RoundJob[]>([]);
  const [roundCount, setRoundCount] = useState(0);
  const [votedId, setVotedId] = useState<string | null>(null);
  const [usePreferred, setUsePreferred] = useState(true);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [phase, setPhase] = useState<"testing" | "summary">("testing");
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submission, setSubmission] = useState<Submission>({
    status: "idle",
    taskUrl: null,
  });
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const activeControllersRef = useRef(new Set<AbortController>());
  const roundRunRef = useRef(0);

  useEffect(
    () => () => {
      roundRunRef.current += 1;
      activeControllersRef.current.forEach((controller) => controller.abort());
    },
    [],
  );

  const votedJob =
    roundJobs.find((job) => job.id === votedId && job.image) || null;
  const completedCount = roundJobs.filter(
    (job) => job.status === "complete",
  ).length;
  const zoomedJob = roundJobs.find((job) => job.id === zoomedId) || null;

  async function addReferenceFiles(files: File[]) {
    if (isAnalyzing) return;
    const selected = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_REFERENCES - references.length);
    if (!selected.length) return;
    try {
      const additions = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          data: await prepareReferenceImage(file),
        })),
      );
      setReferences((current) =>
        [...current, ...additions].slice(0, MAX_REFERENCES),
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.referenceError);
    }
  }

  function handleReferenceInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    void addReferenceFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void addReferenceFiles(Array.from(event.dataTransfer.files));
  }

  function updateJob(id: string, update: Partial<RoundJob>) {
    setRoundJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...update } : job)),
    );
  }

  async function requestTestImage(job: RoundJob, stylePrompt: string) {
    updateJob(job.id, { status: "generating", error: undefined });
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    try {
      const response = await fetch("/api/style-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "generate",
          stylePrompt,
          testPrompt,
        }),
      });
      const result = (await response.json()) as {
        image?: GeneratedImage;
        error?: string;
      };
      if (!response.ok || !result.image)
        throw new Error(result.error || t.generationError);
      updateJob(job.id, { status: "complete", image: result.image });
    } catch (reason) {
      if (controller.signal.aborted) return;
      const message =
        reason instanceof Error ? reason.message : t.generationError;
      updateJob(job.id, { status: "failed", error: message });
      setError(message);
    } finally {
      activeControllersRef.current.delete(controller);
    }
  }

  function stopRound() {
    roundRunRef.current += 1;
    activeControllersRef.current.forEach((controller) => controller.abort());
    activeControllersRef.current.clear();
    setIsGenerating(false);
    setRoundJobs((current) =>
      current.map((job) =>
        job.status === "queued" || job.status === "generating"
          ? { ...job, status: "stopped" }
          : job,
      ),
    );
  }

  // A round is three generations of the same style prompt and test prompt,
  // each with its own random seed; voting pins the selected image's seed.
  async function startRound(stylePrompt: string) {
    const runId = roundRunRef.current + 1;
    roundRunRef.current = runId;
    const nextRound = roundCount + 1;
    const jobs = Array.from({ length: ROUND_SIZE }, (_, index) => ({
      id: `round-${nextRound}-${index}`,
      status: "queued" as const,
    }));
    setRoundCount(nextRound);
    setRoundJobs(jobs);
    setVotedId(null);
    setError("");
    setIsGenerating(true);
    await Promise.all(
      jobs.map((job) => {
        if (roundRunRef.current !== runId) return Promise.resolve();
        return requestTestImage(job, stylePrompt);
      }),
    );
    if (roundRunRef.current === runId) setIsGenerating(false);
  }

  async function analyze() {
    if (isAnalyzing) return;
    if (!references.length) {
      setError(t.referencesRequired);
      return;
    }
    if (!testPrompt.trim()) {
      setError(t.testPromptRequired);
      return;
    }
    setError("");
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/style-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analyze",
          references: references.map((reference) => reference.data),
        }),
      });
      const result = (await response.json()) as {
        plan?: StylePlan;
        error?: string;
      };
      if (!response.ok || !result.plan)
        throw new Error(result.error || t.analyzeError);
      setPlan(result.plan);
      setChat((current) => [
        ...current,
        {
          id: `planner-${Date.now()}`,
          author: "planner",
          text: result.plan!.analysis,
        },
      ]);
      await startRound(result.plan.prompt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.analyzeError);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function revise() {
    if (isRevising || !plan) return;
    if (!instruction.trim()) {
      setError(t.chatInstructionRequired);
      return;
    }
    setError("");
    setIsRevising(true);
    const preferredImage =
      usePreferred && votedJob ? votedJob.image!.data : null;
    try {
      const response = await fetch("/api/style-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "refine",
          references: references.map((reference) => reference.data),
          currentPrompt: plan.prompt,
          instruction,
          ...(preferredImage ? { preferredImage } : {}),
        }),
      });
      const result = (await response.json()) as {
        plan?: StylePlan;
        error?: string;
      };
      if (!response.ok || !result.plan)
        throw new Error(result.error || t.analyzeError);
      setPlan(result.plan);
      setChat((current) => [
        ...current,
        { id: `user-${Date.now()}`, author: "user", text: instruction },
        {
          id: `planner-${Date.now()}`,
          author: "planner",
          text: result.plan!.analysis,
        },
      ]);
      setInstruction("");
      await startRound(result.plan.prompt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.analyzeError);
    } finally {
      setIsRevising(false);
    }
  }

  async function retryJob(job: RoundJob) {
    if (!plan || isGenerating) return;
    setError("");
    setIsGenerating(true);
    await requestTestImage(job, plan.prompt);
    setIsGenerating(false);
  }

  function downloadImage(job: RoundJob) {
    if (!job.image) return;
    const link = document.createElement("a");
    link.href = job.image.data;
    link.download = safeFilename(plan?.id || "", job.image.seed);
    link.click();
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 2_000);
    } catch {
      setError(t.copy);
    }
  }

  function presetJson() {
    if (!plan || !votedJob) return "";
    return JSON.stringify(
      { id: plan.id, prompt: plan.prompt, seed: votedJob.image!.seed },
      null,
      2,
    );
  }

  async function submitStyleRequest() {
    if (!plan || !votedJob) return;
    setSubmission({ status: "sending", taskUrl: null });
    try {
      const response = await fetch("/api/style-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "submit",
          styleId: plan.id,
          styleName: plan.name,
          stylePrompt: plan.prompt,
          seed: votedJob.image!.seed,
          testPrompt,
          roundCount,
          notes: submitNotes,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        taskUrl?: string | null;
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error);
      setSubmission({
        status: "sent",
        taskUrl: typeof result.taskUrl === "string" ? result.taskUrl : null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.submitError);
      setSubmission({ status: "error", taskUrl: null });
    }
  }

  function primaryAction() {
    if (isGenerating) {
      stopRound();
      return;
    }
    if (!plan) {
      void analyze();
      return;
    }
    void startRound(plan.prompt);
  }

  const primaryLabel = isGenerating
    ? `${t.stop} · ${t.progress
        .replace("{complete}", String(completedCount))
        .replace("{total}", String(roundJobs.length))}`
    : isAnalyzing
      ? t.analyzing
      : !plan
        ? t.analyze
        : t.retest;

  useEffect(() => {
    if (!active || !onDiagnostics) return;
    onDiagnostics({
      appStatus:
        isAnalyzing ||
        isRevising ||
        isGenerating ||
        submission.status === "sending"
          ? "running"
          : error || submission.status === "error"
            ? "error"
            : Boolean(plan)
              ? "completed"
              : "idle",
      progress: null,
      inputSummary: {
        hasInput: Boolean(testPrompt.trim()) || references.length > 0,
        fileType: null,
        fileSize: null,
        referenceCount: references.length,
        hasResult: Boolean(plan),
      },
    });
  }, [
    active,
    onDiagnostics,
    isAnalyzing,
    isRevising,
    isGenerating,
    submission.status,
    plan,
    testPrompt,
    references.length,
    error,
  ]);

  return (
    <div
      className="cover-module style-trainer-module"
      onDragOver={(event) => {
        if (active) event.preventDefault();
      }}
      onDrop={active ? handleDrop : undefined}
    >
      <section
        className={`cover-stage ${!roundJobs.length && !isGenerating ? "initial" : ""}`}
      >
        <header className="cover-stage-head">
          <div className="tool-header-copy">
            <ToolMeta code={t.code} mode="ai" language={language} />
            <div className="cover-title-row">
              <h1>
                {t.heading}
                {roundCount > 0 && phase === "testing" ? (
                  <small>
                    {t.roundLabel.replace("{count}", String(roundCount))}
                  </small>
                ) : null}
              </h1>
            </div>
          </div>
        </header>
        <div
          className={`cover-grid visual-multiple-grid style-trainer-grid ${roundJobs.length ? "has-results" : ""}`}
          aria-live="polite"
        >
          {roundJobs.map((job, index) => (
            <article
              className={`cover-card visual-multiple-card style-trainer-card style-trainer-card-${job.status} ${job.image ? "" : "cover-loading"} ${job.id === votedId ? "selected" : ""}`}
              key={job.id}
            >
              {job.image ? (
                <button
                  className="cover-image"
                  onClick={() => setZoomedId(job.id)}
                  aria-label={`${t.zoom} ${index + 1}`}
                >
                  <img src={job.image.data} alt={testPrompt} />
                </button>
              ) : (
                <span>
                  {job.status === "generating"
                    ? t.generating
                    : job.status === "failed"
                      ? t.failed
                      : job.status === "stopped"
                        ? t.stopped
                        : t.queued}
                  <br />
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
              {job.image ? (
                <footer className="image-generator-card-actions style-trainer-card-actions">
                  <button
                    className={`action-button action-button-compact style-trainer-select ${job.id === votedId ? "style-trainer-select-active" : ""}`}
                    onClick={() =>
                      setVotedId((current) =>
                        current === job.id ? null : job.id,
                      )
                    }
                    aria-pressed={job.id === votedId}
                  >
                    {job.id === votedId ? t.selected : t.select}
                  </button>
                  <button
                    className="action-button action-button-compact"
                    onClick={() => downloadImage(job)}
                    aria-label={t.download}
                  >
                    ↓
                  </button>
                </footer>
              ) : job.status === "failed" && !isGenerating ? (
                <footer className="image-generator-card-actions">
                  <button
                    className="action-button action-button-compact"
                    onClick={() => void retryJob(job)}
                  >
                    ↻ {t.retry}
                  </button>
                </footer>
              ) : null}
            </article>
          ))}
          {!roundJobs.length && !isGenerating && (
            <EmptyViewportState className="cover-empty">
              {t.empty}
            </EmptyViewportState>
          )}
        </div>
      </section>

      <aside className="cover-toolbar editor-sidebar style-trainer-toolbar">
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleReferenceInput}
          hidden
        />

        <section className="cover-control cover-reference-control">
          <label>
            {t.references}{" "}
            <b>
              {t.referencesCount.replace("{count}", String(references.length))}
            </b>
          </label>
          <div className="cover-references style-trainer-references">
            {Array.from({ length: MAX_REFERENCES }, (_, index) => {
              const reference = references[index];
              return reference ? (
                <figure key={`${reference.name}-${index}`}>
                  <img src={reference.data} alt={reference.name} />
                  <button
                    onClick={() =>
                      setReferences((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    disabled={isAnalyzing || isGenerating}
                    aria-label={`${t.remove} ${reference.name}`}
                  >
                    ×
                  </button>
                  <figcaption>{String(index + 1).padStart(2, "0")}</figcaption>
                </figure>
              ) : (
                <button
                  className="cover-add-reference"
                  key={`empty-${index}`}
                  onClick={() => referenceInputRef.current?.click()}
                  onDragOver={(event) => {
                    if (active) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!active) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void addReferenceFiles(
                      Array.from(event.dataTransfer.files),
                    );
                  }}
                  disabled={isAnalyzing || isGenerating}
                  aria-label={`${t.addImage.replace("\n", " ")} ${index + 1}`}
                >
                  <b>+</b>
                  <span>
                    {t.addImage.split("\n").map((line, lineIndex) => (
                      <span key={line}>
                        {line}
                        {lineIndex === 0 && <br />}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <small>{t.referencesHint}</small>
        </section>

        <section className="cover-control">
          <label htmlFor="style-trainer-test-prompt">{t.testPrompt}</label>
          <textarea
            id="style-trainer-test-prompt"
            value={testPrompt}
            onChange={(event) => setTestPrompt(event.target.value)}
            placeholder={t.testPromptPlaceholder}
            rows={3}
            disabled={isAnalyzing || isGenerating}
          />
          <small>{t.testPromptHint}</small>
        </section>

        {plan && phase === "testing" ? (
          <>
            <section className="cover-control style-trainer-plan">
              <label>
                {t.styleName} <b>{plan.name}</b>
              </label>
              <label>
                {t.styleId} <b>{plan.id}</b>
              </label>
              <label htmlFor="style-trainer-style-prompt">
                {t.stylePrompt} <b>{t.stylePromptHint}</b>
              </label>
              <textarea
                id="style-trainer-style-prompt"
                value={plan.prompt}
                onChange={(event) =>
                  setPlan((current) =>
                    current
                      ? { ...current, prompt: event.target.value }
                      : current,
                  )
                }
                rows={8}
                disabled={isRevising || isGenerating}
              />
            </section>

            <section className="cover-control style-trainer-chat">
              <label>{t.chatTitle}</label>
              <small>{t.chatHint}</small>
              {chat.length > 0 && (
                <div className="style-trainer-chat-log">
                  {chat.map((entry) => (
                    <p
                      className={`style-trainer-chat-entry style-trainer-chat-${entry.author}`}
                      key={entry.id}
                    >
                      {entry.text}
                    </p>
                  ))}
                </div>
              )}
              <label
                className="cover-checkbox"
                htmlFor="style-trainer-use-preferred"
              >
                <input
                  id="style-trainer-use-preferred"
                  type="checkbox"
                  checked={usePreferred}
                  onChange={(event) => setUsePreferred(event.target.checked)}
                  disabled={isRevising || isGenerating || !votedJob}
                />
                <span>
                  <b>{t.usePreferred}</b>
                </span>
              </label>
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t.chatPlaceholder}
                rows={3}
                disabled={isRevising || isGenerating}
              />
              <button
                type="button"
                className="action-button style-trainer-revise"
                onClick={() => void revise()}
                disabled={isRevising || isGenerating || !instruction.trim()}
              >
                {isRevising ? t.revising : t.revise}
              </button>
              {votedJob && <small>{t.selectedHint}</small>}
            </section>
          </>
        ) : null}

        {plan && phase === "summary" ? (
          <section className="cover-control style-trainer-summary">
            <label>
              {t.summaryTitle} <b>{plan.name}</b>
            </label>
            <dl>
              <div>
                <dt>{t.summaryId}</dt>
                <dd>
                  <code>{plan.id}</code>
                </dd>
              </div>
              <div>
                <dt>{t.summarySeed}</dt>
                <dd>
                  <code>{votedJob?.image?.seed ?? "—"}</code>
                </dd>
              </div>
              <div>
                <dt>{t.summaryTestPrompt}</dt>
                <dd>{testPrompt}</dd>
              </div>
            </dl>
            <label>{t.summaryPrompt}</label>
            <textarea value={plan.prompt} rows={7} readOnly />
            <div className="style-trainer-summary-actions">
              <button
                type="button"
                className="action-button action-button-compact"
                onClick={() => void copyText("prompt", plan.prompt)}
              >
                {copiedKey === "prompt" ? t.copied : t.copy}
              </button>
              <button
                type="button"
                className="action-button action-button-compact"
                onClick={() => void copyText("preset", presetJson())}
              >
                {copiedKey === "preset" ? t.copied : t.copyPreset}
              </button>
            </div>

            <hr />
            <p className="style-trainer-submit-heading">{t.submitTitle}</p>
            <small>{t.submitIntro}</small>
            <label htmlFor="style-trainer-submit-notes">{t.submitNotes}</label>
            <textarea
              id="style-trainer-submit-notes"
              value={submitNotes}
              onChange={(event) => setSubmitNotes(event.target.value)}
              placeholder={t.submitNotesPlaceholder}
              rows={2}
              disabled={
                submission.status === "sending" || submission.status === "sent"
              }
            />
            {submission.status === "sent" ? (
              <p className="style-trainer-submit-result" role="status">
                {t.submitSuccess}
                {submission.taskUrl ? (
                  <>
                    {" "}
                    <a
                      href={submission.taskUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.openTask} ↗
                    </a>
                  </>
                ) : null}
              </p>
            ) : (
              <button
                type="button"
                className="action-button action-button-success style-trainer-submit"
                onClick={() => void submitStyleRequest()}
                disabled={submission.status === "sending"}
              >
                {submission.status === "sending" ? t.submitting : t.submit}
              </button>
            )}
            <button
              type="button"
              className="action-button style-trainer-back"
              onClick={() => setPhase("testing")}
              disabled={submission.status === "sending"}
            >
              {t.backToTesting}
            </button>
          </section>
        ) : null}

        {error && (
          <p className="extraction-error" role="alert">
            {error}
          </p>
        )}

        <div className="image-generator-bottom-actions style-trainer-bottom-actions">
          {phase === "testing" && plan && votedJob && (
            <div className="cover-export-actions cover-toolbar-exports">
              <button
                className="cover-export action-button action-button-success"
                onClick={() => setPhase("summary")}
                disabled={isGenerating}
              >
                {t.finish}
              </button>
            </div>
          )}
          <div className="cover-generate-group image-generator-generate-group style-trainer-generate-group">
            <button
              className={`cover-generate action-button action-button-primary ${isGenerating ? "image-generator-stop" : ""}`}
              onClick={() => primaryAction()}
              disabled={
                !isGenerating && (isAnalyzing || (phase === "summary" && !plan))
              }
            >
              <span>{primaryLabel}</span>
              <b>{isGenerating ? "×" : "→"}</b>
            </button>
          </div>
        </div>
      </aside>

      {active &&
        zoomedJob?.image &&
        createPortal(
          <div
            className="manual-lightbox cover-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={testPrompt}
            onClick={() => setZoomedId(null)}
          >
            <button
              className="manual-lightbox-close"
              onClick={() => setZoomedId(null)}
              aria-label={t.close}
            >
              ×
            </button>
            <figure onClick={(event) => event.stopPropagation()}>
              <img src={zoomedJob.image.data} alt={testPrompt} />
              <figcaption>
                <span>{testPrompt}</span>
                <small>
                  {`${zoomedJob.image.model} · ${zoomedJob.image.resolution} · ${t.seedLabel} ${zoomedJob.image.seed} · ${zoomedJob.image.usage.cost === null ? "—" : `${zoomedJob.image.usage.cost.toFixed(4)} cr`}`}
                </small>
              </figcaption>
            </figure>
          </div>,
          document.body,
        )}
    </div>
  );
}
