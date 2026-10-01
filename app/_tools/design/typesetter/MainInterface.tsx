"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { ToolHeader } from "../../../_components/ToolChrome";
import { typesetterUi } from "./copy";
import { semanticRoles, isSemanticRoleId } from "./roles";
import {
  IMAGE_LAYER,
  MAIN_STORY_LABEL,
  TYPESETTER_FORMAT,
  TYPESETTER_VERSION,
  manifestSummary,
  requiresReview,
  validateAnalysedBlocks,
  validateManifest,
  validateMappings,
} from "./code/validation";
import type {
  AnalysedBlock,
  LocalTypesetterInput,
  RoleMapping,
  RoleSuggestion,
  SemanticRoleId,
  TypesetterManifest,
  TypesetterSourceBlock,
} from "./types";

type Language = "en" | "cs";
type InputKind = "manuscript" | "template";
type ReviewFilter = "all" | "review" | "images" | "unsupported";
type ModelClassification = {
  id: string;
  role: SemanticRoleId;
  confidence: number;
  warning: string | null;
  imagePrompt: string | null;
};

const roleById = new Map(semanticRoles.map((role) => [role.id, role]));

function safeStem(filename: string) {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}

function sampleBlocks(blocks: TypesetterSourceBlock[]) {
  const sampled: TypesetterSourceBlock[] = [];
  const count = Math.min(100, blocks.length);
  const step = blocks.length / count;
  let characters = 0;
  for (let index = 0; index < count; index += 1) {
    const block = blocks[Math.min(blocks.length - 1, Math.floor(index * step))];
    if (characters + block.text.length > 70_000) break;
    sampled.push(block);
    characters += block.text.length;
  }
  return sampled;
}

function manuscriptBatches(blocks: TypesetterSourceBlock[]) {
  const batches: TypesetterSourceBlock[][] = [];
  let batch: TypesetterSourceBlock[] = [];
  let characters = 0;
  for (const block of blocks) {
    if (
      batch.length >= 80 ||
      (batch.length > 0 && characters + block.text.length > 60_000)
    ) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(block);
    characters += block.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TypesetterMainInterface({ language }: { language: Language }) {
  const t = typesetterUi[language];
  const [files, setFiles] = useState<Record<InputKind, File | null>>({
    manuscript: null,
    template: null,
  });
  const [localInput, setLocalInput] = useState<LocalTypesetterInput | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<RoleSuggestion[]>([]);
  const [prescanNotes, setPrescanNotes] = useState<string[]>([]);
  const [activeRoles, setActiveRoles] = useState<SemanticRoleId[]>(["body"]);
  const [mappings, setMappings] = useState<
    Partial<Record<SemanticRoleId, RoleMapping>>
  >({});
  const [analysed, setAnalysed] = useState<AnalysedBlock[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateVersion, setTemplateVersion] = useState("1");
  const [localLog, setLocalLog] = useState<string[]>([]);
  const [aiLog, setAiLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [prescanning, setPrescanning] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const manuscriptInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const inputRefs = { manuscript: manuscriptInput, template: templateInput };

  const mappingsErrors = useMemo(
    () =>
      localInput
        ? validateMappings(activeRoles, mappings, localInput.template)
        : [],
    [activeRoles, localInput, mappings],
  );
  const hasMainLabel = Boolean(
    localInput?.template.labels.includes(MAIN_STORY_LABEL),
  );
  const mappingReady = Boolean(
    localInput &&
    hasMainLabel &&
    templateId.trim() &&
    templateVersion.trim() &&
    activeRoles.length > 0 &&
    mappingsErrors.length === 0,
  );
  const summary = useMemo(() => manifestSummary(analysed), [analysed]);
  const filteredBlocks = useMemo(
    () =>
      analysed.filter((block) => {
        if (reviewFilter === "review")
          return requiresReview(block) && !block.reviewed;
        if (reviewFilter === "images") return block.role === "image.request";
        if (reviewFilter === "unsupported") return block.role === "unsupported";
        return true;
      }),
    [analysed, reviewFilter],
  );
  const exportReady = Boolean(
    analysed.length &&
    mappingReady &&
    summary.unresolved === 0 &&
    validateAnalysedBlocks(
      localInput?.manuscript.blocks || [],
      analysed,
      activeRoles,
    ).length === 0,
  );
  const currentStep =
    !files.manuscript || !files.template
      ? 0
      : !localInput
        ? 1
        : suggestions.length === 0
          ? 2
          : !mappingReady
            ? 3
            : analysed.length === 0
              ? 4
              : !exportReady
                ? 5
                : 6;

  function addLog(kind: "local" | "ai", message: string) {
    const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    const line = `[${timestamp}] ${message}`;
    if (kind === "local") setLocalLog((current) => [...current, line]);
    else setAiLog((current) => [...current, line]);
  }

  function resetAfterFiles() {
    setLocalInput(null);
    setSuggestions([]);
    setPrescanNotes([]);
    setActiveRoles(["body"]);
    setMappings({});
    setAnalysed([]);
    setReviewExpanded(false);
    setLocalLog([]);
    setAiLog([]);
    setProgress(0);
    setError("");
  }

  function selectFile(kind: InputKind, file: File) {
    const extension = file.name.toLowerCase().split(".").pop();
    const valid =
      kind === "manuscript" ? extension === "docx" : extension === "idml";
    if (!valid) {
      setError(kind === "manuscript" ? t.docxError : t.idmlError);
      return;
    }
    setFiles((current) => ({ ...current, [kind]: file }));
    resetAfterFiles();
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

  async function inspectFiles() {
    if (!files.manuscript || !files.template || inspecting) return;
    setInspecting(true);
    setError("");
    setLocalLog([]);
    setProgress(2);
    setLocalInput(null);
    setSuggestions([]);
    setAnalysed([]);
    try {
      addLog("local", `${t.manuscript}: ${files.manuscript.name}`);
      addLog("local", `${t.template}: ${files.template.name}`);
      const parsed = await new Promise<LocalTypesetterInput>(
        async (resolve, reject) => {
          const worker = new Worker("/typesetter/pyodide-worker.js");
          worker.onmessage = (
            event: MessageEvent<{
              type: string;
              message?: string;
              progress?: number;
              json?: string;
            }>,
          ) => {
            if (event.data.type === "log" && event.data.message) {
              if (typeof event.data.progress === "number")
                setProgress(event.data.progress);
              addLog("local", event.data.message);
            } else if (event.data.type === "result" && event.data.json) {
              worker.terminate();
              resolve(JSON.parse(event.data.json) as LocalTypesetterInput);
            } else if (event.data.type === "error") {
              worker.terminate();
              reject(new Error(event.data.message || t.failed));
            }
          };
          worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || t.failed));
          };
          const [manuscript, idml] = await Promise.all([
            files.manuscript!.arrayBuffer(),
            files.template!.arrayBuffer(),
          ]);
          worker.postMessage(
            {
              manuscript,
              idml,
              manuscriptName: files.manuscript!.name,
              idmlName: files.template!.name,
              language,
            },
            [manuscript, idml],
          );
        },
      );
      setLocalInput(parsed);
      setTemplateId(safeStem(parsed.template.filename));
      setProgress(100);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.failed);
    } finally {
      setInspecting(false);
    }
  }

  async function postAi(body: Record<string, unknown>) {
    const response = await fetch("/api/typesetter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        typeof result.error === "string" ? result.error : t.failed,
      );
    return result;
  }

  async function runPrescan() {
    if (!localInput || prescanning) return;
    setPrescanning(true);
    setError("");
    setAiLog([]);
    setSuggestions([]);
    setAnalysed([]);
    try {
      const blocks = sampleBlocks(localInput.manuscript.blocks);
      addLog(
        "ai",
        `${blocks.length}/${localInput.manuscript.blocks.length} manuscript blocks selected for pre-scan.`,
      );
      const result = await postAi({ mode: "prescan", language, blocks });
      const rawSuggestions = Array.isArray(result.suggestions)
        ? result.suggestions
        : [];
      const nextSuggestions = rawSuggestions.filter(
        (value): value is RoleSuggestion => {
          if (!value || typeof value !== "object") return false;
          const suggestion = value as Partial<RoleSuggestion>;
          return (
            isSemanticRoleId(suggestion.role) &&
            suggestion.role !== "unsupported" &&
            typeof suggestion.confidence === "number" &&
            typeof suggestion.reason === "string" &&
            Array.isArray(suggestion.examples)
          );
        },
      );
      if (!nextSuggestions.length) throw new Error(t.noSuggestions);
      const nextRoles = [
        ...new Set<SemanticRoleId>([
          "body",
          ...nextSuggestions.map(({ role }) => role),
        ]),
      ];
      setSuggestions(nextSuggestions);
      setPrescanNotes(
        Array.isArray(result.notes)
          ? result.notes.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      );
      setActiveRoles(nextRoles);
      addLog("ai", `${nextSuggestions.length} semantic roles suggested.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.failed);
    } finally {
      setPrescanning(false);
    }
  }

  function toggleRole(role: SemanticRoleId) {
    setAnalysed([]);
    setActiveRoles((current) =>
      current.includes(role)
        ? current.filter((value) => value !== role)
        : [...current, role],
    );
  }

  function setRoleMapping(
    role: SemanticRoleId,
    kind: "paragraphStyle" | "objectStyle",
    value: string,
  ) {
    setAnalysed([]);
    setMappings((current) => ({
      ...current,
      [role]: { ...current[role], [kind]: value },
    }));
  }

  async function analyseManuscript() {
    if (!localInput || !mappingReady || analysing) return;
    setAnalysing(true);
    setError("");
    setAiLog([]);
    setAnalysed([]);
    setReviewExpanded(false);
    setProgress(0);
    try {
      const batches = manuscriptBatches(localInput.manuscript.blocks);
      const output: AnalysedBlock[] = [];
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        addLog("ai", t.batch(index + 1, batches.length));
        setProgress(Math.round((index / batches.length) * 100));
        const result = await postAi({
          mode: "classify",
          language,
          blocks: batch,
          allowedRoles: activeRoles,
        });
        if (!Array.isArray(result.blocks)) throw new Error(t.invalidResponse);
        const classifications = result.blocks as ModelClassification[];
        if (classifications.length !== batch.length)
          throw new Error(t.invalidResponse);
        for (let blockIndex = 0; blockIndex < batch.length; blockIndex += 1) {
          const source = batch[blockIndex];
          const classification = classifications[blockIndex];
          if (
            !classification ||
            classification.id !== source.id ||
            !isSemanticRoleId(classification.role) ||
            (!activeRoles.includes(classification.role) &&
              classification.role !== "unsupported") ||
            typeof classification.confidence !== "number"
          )
            throw new Error(t.invalidResponse);
          const warning =
            typeof classification.warning === "string" &&
            classification.warning.trim()
              ? classification.warning.trim()
              : null;
          const block: AnalysedBlock = {
            ...source,
            role: classification.role,
            confidence: Math.max(0, Math.min(1, classification.confidence)),
            warning,
            imagePrompt:
              classification.role === "image.request" &&
              typeof classification.imagePrompt === "string"
                ? classification.imagePrompt
                : null,
            reviewed: false,
          };
          block.reviewed = !requiresReview(block);
          output.push(block);
        }
      }
      const errors = validateAnalysedBlocks(
        localInput.manuscript.blocks,
        output,
        activeRoles,
      );
      if (errors.length) throw new Error(errors[0]);
      setAnalysed(output);
      setProgress(100);
      addLog("ai", `${output.length} manuscript blocks classified.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.failed);
    } finally {
      setAnalysing(false);
    }
  }

  function updateBlock(
    id: string,
    changes: Partial<Pick<AnalysedBlock, "role" | "imagePrompt" | "reviewed">>,
  ) {
    setAnalysed((current) =>
      current.map((block) => {
        if (block.id !== id) return block;
        const next = { ...block, ...changes };
        if (changes.role && changes.role !== "image.request")
          next.imagePrompt = null;
        return next;
      }),
    );
  }

  function buildManifest(): TypesetterManifest | null {
    if (!localInput) return null;
    const selectedMappings: Partial<Record<SemanticRoleId, RoleMapping>> = {};
    for (const role of activeRoles) {
      if (mappings[role]) selectedMappings[role] = mappings[role];
    }
    const manifest: TypesetterManifest = {
      format: TYPESETTER_FORMAT,
      version: TYPESETTER_VERSION,
      createdAt: new Date().toISOString(),
      language,
      manuscript: {
        filename: localInput.manuscript.filename,
        blockCount: localInput.manuscript.blocks.length,
      },
      template: {
        filename: localInput.template.filename,
        id: templateId.trim(),
        version: templateVersion.trim(),
        mainStoryLabel: MAIN_STORY_LABEL,
      },
      mappings: selectedMappings,
      imageRequests: {
        layer: IMAGE_LAYER,
        placement: "pasteboard-by-related-spread",
      },
      summary: manifestSummary(analysed),
      blocks: analysed,
    };
    const errors = validateManifest(manifest);
    if (errors.length) {
      setError(errors[0]);
      return null;
    }
    return manifest;
  }

  function downloadManifest() {
    const manifest = buildManifest();
    if (!manifest) return;
    downloadText(
      `${JSON.stringify(manifest, null, 2)}\n`,
      `${safeStem(localInput?.manuscript.filename || "manuscript")}_Typesetter.json`,
    );
  }

  return (
    <div className="solutions-module solutions-detail-module typesetter-module">
      <ToolHeader
        className="library-tool-header solutions-header typesetter-header"
        code={t.code}
        title={t.heading}
        mode="ai"
        language={language}
      />

      <div className="typesetter-generator-stack">
        <section className="solutions-generator">
          <input
            ref={manuscriptInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(event) => handleInput("manuscript", event)}
          />
          <input
            ref={templateInput}
            type="file"
            accept=".idml,application/octet-stream"
            hidden
            onChange={(event) => handleInput("template", event)}
          />
          <div className="solutions-file-grid typesetter-files">
            {(["manuscript", "template"] as InputKind[]).map((kind, index) => (
              <button
                key={kind}
                className={files[kind] ? "has-file" : ""}
                onClick={() => inputRefs[kind].current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(kind, event)}
              >
                <span>
                  {String(index + 1).padStart(2, "0")} / {t[kind]}
                </span>
                <strong>
                  {files[kind]?.name ||
                    (kind === "manuscript" ? t.chooseDocx : t.chooseIdml)}
                </strong>
                <b>{files[kind] ? "✓" : "+"}</b>
              </button>
            ))}
          </div>
          <button
            className={`solutions-create action-button ${localInput ? "action-button-success" : "action-button-primary"}`}
            disabled={!files.manuscript || !files.template || inspecting}
            onClick={() => void inspectFiles()}
          >
            <span>
              {inspecting
                ? t.inspecting
                : localInput
                  ? t.inspectAgain
                  : t.inspect}
            </span>
            <b>{inspecting ? "…" : "→"}</b>
          </button>
          {(inspecting || localLog.length > 0) && (
            <div
              className={`solutions-progress${localInput ? " is-complete" : ""}`}
            >
              <div className="solutions-progress-head">
                <span>{t.localLog}</span>
                <b>{progress}%</b>
              </div>
              <div className="solutions-progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="solutions-console">
                {localLog.map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </div>
            </div>
          )}
          <p className="solutions-privacy">{t.localPrivacy}</p>
        </section>

        {error && (
          <p className="extraction-error typesetter-error" role="alert">
            {error}
          </p>
        )}

        {localInput && (
          <>
            <section className="typesetter-workflow-section typesetter-inventory">
              <header className="typesetter-section-head">
                <span>02</span>
                <h2>{t.inventory}</h2>
                <i className={hasMainLabel ? "valid" : "warning"}>
                  {hasMainLabel ? t.requiredLabelFound : t.requiredLabelMissing}
                </i>
              </header>
              <dl className="solutions-detail-stats typesetter-inventory-stats">
                <div>
                  <dt>{t.manuscriptBlocks}</dt>
                  <dd>{localInput.manuscript.blocks.length}</dd>
                </div>
                <div>
                  <dt>{t.paragraphStyles}</dt>
                  <dd>{localInput.template.paragraphStyles.length}</dd>
                </div>
                <div>
                  <dt>{t.objectStyles}</dt>
                  <dd>{localInput.template.objectStyles.length}</dd>
                </div>
                <div>
                  <dt>{t.labels}</dt>
                  <dd>{localInput.template.labels.length}</dd>
                </div>
                <div>
                  <dt>{t.layers}</dt>
                  <dd>{localInput.template.layers.length}</dd>
                </div>
              </dl>
              {localInput.warnings.length > 0 && (
                <div className="typesetter-warning-list">
                  <b>{t.warnings}</b>
                  <ul>
                    {localInput.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                className="solutions-create action-button action-button-primary"
                disabled={prescanning}
                onClick={() => void runPrescan()}
              >
                <span>
                  {prescanning
                    ? t.prescanning
                    : suggestions.length
                      ? t.prescanAgain
                      : t.prescan}
                </span>
                <b>{prescanning ? "…" : "→"}</b>
              </button>
              <p className="solutions-privacy">{t.prescanPrivacy}</p>
            </section>

            {suggestions.length > 0 && (
              <section className="typesetter-workflow-section">
                <header className="typesetter-section-head">
                  <span>03</span>
                  <h2>{t.suggestions}</h2>
                </header>
                <p className="typesetter-section-intro">{t.suggestionsIntro}</p>
                <div className="typesetter-role-grid">
                  {semanticRoles
                    .filter(({ id }) => id !== "unsupported")
                    .map((role) => {
                      const suggestion = suggestions.find(
                        ({ role: id }) => id === role.id,
                      );
                      const active = activeRoles.includes(role.id);
                      return (
                        <label key={role.id} className={active ? "active" : ""}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleRole(role.id)}
                          />
                          <span>
                            <b>{role.name[language]}</b>
                            <small>{role.description[language]}</small>
                            {suggestion && (
                              <i>
                                {t.suggested} ·{" "}
                                {Math.round(suggestion.confidence * 100)}%
                              </i>
                            )}
                          </span>
                          <em>{suggestion?.examples[0] || t.noExamples}</em>
                        </label>
                      );
                    })}
                </div>
                {[...prescanNotes].length > 0 && (
                  <div className="typesetter-warning-list">
                    <ul>
                      {prescanNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {suggestions.length > 0 && activeRoles.length > 0 && (
              <section className="typesetter-workflow-section">
                <header className="typesetter-section-head">
                  <span>04</span>
                  <h2>{t.mapping}</h2>
                </header>
                <p className="typesetter-section-intro">{t.mappingIntro}</p>
                <div className="typesetter-template-fields">
                  <label>
                    <span>{t.templateId}</span>
                    <input
                      value={templateId}
                      onChange={(event) => {
                        setTemplateId(event.target.value);
                        setAnalysed([]);
                      }}
                    />
                  </label>
                  <label>
                    <span>{t.templateVersion}</span>
                    <input
                      value={templateVersion}
                      onChange={(event) => {
                        setTemplateVersion(event.target.value);
                        setAnalysed([]);
                      }}
                    />
                  </label>
                </div>
                <div className="typesetter-mapping-table">
                  <div className="typesetter-mapping-head">
                    <span>{t.semanticRole}</span>
                    <span>{t.paragraphStyle}</span>
                    <span>{t.objectStyle}</span>
                  </div>
                  {activeRoles.map((roleId) => {
                    const role = roleById.get(roleId)!;
                    return (
                      <div className="typesetter-mapping-row" key={roleId}>
                        <span>
                          <b>{role.name[language]}</b>
                          <small>{roleId}</small>
                        </span>
                        <select
                          value={mappings[roleId]?.paragraphStyle || ""}
                          onChange={(event) =>
                            setRoleMapping(
                              roleId,
                              "paragraphStyle",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">{t.chooseStyle}</option>
                          {localInput.template.paragraphStyles.map((style) => (
                            <option value={style.path} key={style.id}>
                              {style.path}
                            </option>
                          ))}
                        </select>
                        {role.supportsObjectStyle ? (
                          <select
                            value={mappings[roleId]?.objectStyle || ""}
                            onChange={(event) =>
                              setRoleMapping(
                                roleId,
                                "objectStyle",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">{t.optional}</option>
                            {localInput.template.objectStyles.map((style) => (
                              <option value={style.path} key={style.id}>
                                {style.path}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="typesetter-not-applicable">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p
                  className={`typesetter-mapping-status ${mappingReady ? "valid" : "warning"}`}
                >
                  {mappingReady ? t.mappingReady : t.mappingIncomplete}
                </p>
                <button
                  className={`solutions-create action-button ${analysed.length ? "action-button-success" : "action-button-primary"}`}
                  disabled={!mappingReady || analysing}
                  onClick={() => void analyseManuscript()}
                >
                  <span>
                    {analysing
                      ? t.analysing
                      : analysed.length
                        ? t.analyseAgain
                        : t.analyse}
                  </span>
                  <b>{analysing ? "…" : "→"}</b>
                </button>
                {(analysing || aiLog.length > 0) && (
                  <div
                    className={`solutions-progress${analysed.length ? " is-complete" : ""}`}
                  >
                    <div className="solutions-progress-head">
                      <span>{t.aiLog}</span>
                      <b>{progress}%</b>
                    </div>
                    <div className="solutions-progress-track">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                    <div className="solutions-console">
                      {aiLog.map((line) => (
                        <code key={line}>{line}</code>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {analysed.length > 0 && (
        <section
          className="solutions-detail-review typesetter-review"
          aria-label={t.reviewHeading}
        >
          <div className="solutions-detail-review-head">
            <h2 className="solutions-detail-review-heading">
              <button
                type="button"
                className="solutions-detail-review-toggle"
                onClick={() => setReviewExpanded((current) => !current)}
                aria-expanded={reviewExpanded}
                aria-controls="typesetter-report-details"
              >
                <span className="solutions-detail-review-title">
                  <span>{t.reviewKicker}</span>
                  <span className="solutions-detail-review-name">
                    {t.reviewHeading}
                  </span>
                </span>
                <b aria-hidden="true">{reviewExpanded ? "−" : "+"}</b>
              </button>
            </h2>
            <button
              type="button"
              className="solutions-detail-download action-button action-button-success"
              disabled={!exportReady}
              onClick={downloadManifest}
            >
              <span>{t.downloadJson}</span>
              <b>↓</b>
            </button>
          </div>
          <dl className="solutions-detail-stats">
            <div>
              <dt>{t.total}</dt>
              <dd>{summary.blocks}</dd>
            </div>
            <div>
              <dt>{t.unresolved}</dt>
              <dd>{summary.unresolved}</dd>
            </div>
            <div>
              <dt>{t.images}</dt>
              <dd>{summary.imageRequests}</dd>
            </div>
            <div>
              <dt>{t.unsupported}</dt>
              <dd>{summary.unsupported}</dd>
            </div>
            <div>
              <dt>{t.paragraphStyles}</dt>
              <dd>{localInput?.template.paragraphStyles.length || 0}</dd>
            </div>
            <div>
              <dt>{t.roles}</dt>
              <dd>{activeRoles.length}</dd>
            </div>
          </dl>
          {reviewExpanded && (
            <div
              id="typesetter-report-details"
              className="solutions-detail-review-body"
            >
              <div
                className="solutions-detail-filter"
                role="tablist"
                aria-label={t.filter}
              >
                {(
                  ["all", "review", "images", "unsupported"] as ReviewFilter[]
                ).map((filter) => (
                  <button
                    key={filter}
                    className={reviewFilter === filter ? "active" : ""}
                    onClick={() => setReviewFilter(filter)}
                    role="tab"
                    aria-selected={reviewFilter === filter}
                  >
                    {t.filters[filter]}
                  </button>
                ))}
              </div>
              <div className="typesetter-block-list">
                {filteredBlocks.map((block) => (
                  <article
                    key={block.id}
                    className={
                      requiresReview(block) && !block.reviewed
                        ? "needs-review"
                        : ""
                    }
                  >
                    <header>
                      <span>
                        {block.id} · {block.kind}
                      </span>
                      <b>
                        {Math.round(block.confidence * 100)}% {t.confidence}
                      </b>
                    </header>
                    <p>{block.text || block.imageDescription}</p>
                    {block.warning && <small>{block.warning}</small>}
                    <div className="typesetter-block-controls">
                      <select
                        value={block.role}
                        onChange={(event) =>
                          updateBlock(block.id, {
                            role: event.target.value as SemanticRoleId,
                            reviewed: true,
                          })
                        }
                      >
                        {[...activeRoles, "unsupported" as const].map(
                          (role) => (
                            <option value={role} key={role}>
                              {roleById.get(role)?.name[language]}
                            </option>
                          ),
                        )}
                      </select>
                      {block.role === "image.request" && (
                        <textarea
                          value={block.imagePrompt || ""}
                          aria-label={t.imagePrompt}
                          placeholder={t.imagePrompt}
                          onChange={(event) =>
                            updateBlock(block.id, {
                              imagePrompt: event.target.value,
                              reviewed: true,
                            })
                          }
                        />
                      )}
                      {requiresReview(block) && (
                        <button
                          className={`action-button ${block.reviewed ? "action-button-success" : "action-button-primary"}`}
                          onClick={() =>
                            updateBlock(block.id, { reviewed: !block.reviewed })
                          }
                        >
                          {block.reviewed ? t.confirmed : t.confirm}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!exportReady && (
                <p className="solutions-detail-review-note">
                  {t.exportBlocked}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <details className="library-guide solutions-guide typesetter-guide">
        <summary>
          <span>{t.setup}</span>
          <b aria-hidden="true">＋</b>
        </summary>
        <div className="solutions-content">
          <aside className="solutions-summary">
            <span>{t.download}</span>
            <div className="solutions-downloads">
              <a
                className="action-button"
                href="/typesetter/import_typesetter.jsx"
                download
              >
                <b>JSX</b>
                <span>
                  <strong>{t.importer}</strong>
                  <small>import_typesetter.jsx</small>
                </span>
                <i>↓</i>
              </a>
            </div>
            <p className="solutions-script-help">{t.exportIntro}</p>
            <span>{t.need}</span>
            <ul>
              {t.needs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="solutions-note">{t.imageNote}</div>
          </aside>
          <div className="solutions-steps">
            {t.setupSteps.map(([title, body], index) => (
              <section className="solution-step" key={title}>
                <span className="step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              </section>
            ))}
          </div>
        </div>
      </details>

      <div className="typesetter-guide-progress">
        <span>{t.workflowProgress}</span>
        <ol className="typesetter-progress-cards">
          {t.steps.map((step, index) => {
            const status =
              index < currentStep
                ? "complete"
                : index === currentStep
                  ? "current"
                  : "upcoming";
            return (
              <li
                className={`typesetter-progress-card ${status}`}
                aria-current={status === "current" ? "step" : undefined}
                key={step}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                <small>
                  {status === "complete"
                    ? t.stepComplete
                    : status === "current"
                      ? t.stepCurrent
                      : t.stepUpcoming}
                </small>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
