"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ToolMeta } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import { conceptIllustratorUi } from "./copy";
import {
  buildFeedbackContext,
  createDefaultStyleProfile,
  createEmptyProject,
  deleteProject,
  getProject,
  getStyleProfile,
  isMeaningfulProject,
  listProjects,
  projectTitle,
  saveProject,
  saveStyleProfile,
} from "./code/history";
import type {
  ConceptAspectRatio,
  ConceptSet,
  EditorialFeedback,
  IllustrationConcept,
  IllustrationCritique,
  IllustrationProject,
  ImageRevision,
  IllustrationUsage,
  StyleProfile,
} from "./code/types";

type BusyAction =
  | "planning"
  | "regenerating"
  | "compiling"
  | "generating"
  | "refining"
  | "critiquing";

type ImageResult = {
  data: string;
  prompt: string;
  model: string;
  seed: number;
  generationId?: string;
  usage: IllustrationUsage;
};

type ApiResult = {
  concepts?: IllustrationConcept[];
  concept?: IllustrationConcept;
  prompt?: string;
  image?: ImageResult;
  critique?: IllustrationCritique;
  error?: string;
};

const workflowKeys = [
  "stageArticle",
  "stageConcepts",
  "stageSelect",
  "stageGenerate",
  "stageRefine",
  "stageFinal",
] as const;

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function currentTimestamp() {
  return Date.now();
}

function storageErrorMessage(reason: unknown) {
  if (reason instanceof DOMException)
    return `${reason.name}: ${reason.message}`;
  if (reason instanceof Error) return reason.message;
  return "Unknown browser storage error.";
}

function normalizeConcept(
  value: Partial<IllustrationConcept> | undefined,
  fallbackId?: string,
): IllustrationConcept | null {
  if (
    !value ||
    typeof value.title !== "string" ||
    typeof value.visual !== "string" ||
    typeof value.meaning !== "string" ||
    !value.title.trim() ||
    !value.visual.trim() ||
    !value.meaning.trim()
  ) {
    return null;
  }
  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : fallbackId || uniqueId("concept"),
    title: value.title.trim(),
    visual: value.visual.trim(),
    meaning: value.meaning.trim(),
  };
}

function normalizeConceptSet(values: IllustrationConcept[] | undefined) {
  if (!values || values.length !== 3) return null;
  const concepts = values.map((value) => normalizeConcept(value));
  if (concepts.some((concept) => !concept)) return null;
  return concepts as ConceptSet;
}

function prepareReferenceImage(
  file: File,
  messages: { type: string; size: string; generic: string },
) {
  const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!supportedTypes.includes(file.type)) {
    return Promise.reject(new Error(`${file.name}: ${messages.type}`));
  }
  if (file.size > 30_000_000) {
    return Promise.reject(new Error(`${file.name}: ${messages.size}`));
  }

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
        reject(new Error(`${file.name}: ${messages.generic}`));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`${file.name}: ${messages.generic}`));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error(`${file.name}: ${messages.generic}`));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.86,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`${file.name}: ${messages.generic}`));
    };
    image.src = objectUrl;
  });
}

function imageFilename(project: IllustrationProject, revision: ImageRevision) {
  const title = projectTitle(project)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .toLocaleLowerCase("en-US");
  const extension = revision.image.startsWith("data:image/png") ? "png" : "jpg";
  return `${title || "concept-illustration"}-${revision.id.slice(-8)}.${extension}`;
}

export function ConceptIllustratorMainInterface({
  language,
  active,
}: {
  language: Language;
  active: boolean;
}) {
  const t = conceptIllustratorUi[language];
  const [project, setProject] = useState<IllustrationProject>(() =>
    createEmptyProject(),
  );
  const [storedProjects, setStoredProjects] = useState<IllustrationProject[]>(
    [],
  );
  const [styleProfile, setStyleProfile] = useState<StyleProfile>(() =>
    createDefaultStyleProfile(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [artDirection, setArtDirection] = useState("");
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const artDirectionRef = useRef<HTMLTextAreaElement>(null);
  const controllersRef = useRef(new Set<AbortController>());
  const busyRef = useRef<BusyAction | null>(null);
  const deletedProjectIdsRef = useRef(new Set<string>());

  const hasConcepts = project.concepts.every(
    (concept) =>
      concept.title.trim() && concept.visual.trim() && concept.meaning.trim(),
  );
  const activeRevision =
    project.revisions.find(
      (revision) => revision.id === project.activeRevisionId,
    ) || null;
  const activeCritique =
    project.critique?.revisionId === activeRevision?.id
      ? project.critique
      : null;
  const feedbackContext = useMemo(
    () =>
      buildFeedbackContext([
        project,
        ...storedProjects.filter((item) => item.id !== project.id),
      ]),
    [project, storedProjects],
  );
  const workflowStage = project.finalRevisionId
    ? 5
    : project.revisions.some((revision) => revision.parentId)
      ? 4
      : activeRevision
        ? 3
        : project.editedConcept
          ? 2
          : hasConcepts
            ? 1
            : 0;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listProjects(), getStyleProfile()])
      .then(([projects, profile]) => {
        if (cancelled) return;
        setStoredProjects(projects);
        setStyleProfile(profile);
        if (projects[0]) setProject(projects[0]);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setMemoryError(storageErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      busyRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!hydrated || !isMeaningfulProject(project)) return;
    const timer = window.setTimeout(() => {
      if (deletedProjectIdsRef.current.has(project.id)) return;
      void saveProject(project)
        .then(() => {
          setStoredProjects((current) =>
            [project, ...current.filter((item) => item.id !== project.id)].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          );
          setMemoryError("");
        })
        .catch((reason: unknown) =>
          setMemoryError(storageErrorMessage(reason)),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hydrated, project]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveStyleProfile(styleProfile)
        .then(() => setMemoryError(""))
        .catch((reason: unknown) =>
          setMemoryError(storageErrorMessage(reason)),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hydrated, styleProfile]);

  function updateProject(
    update: (current: IllustrationProject) => IllustrationProject,
  ) {
    setProject((current) => ({
      ...update(current),
      updatedAt: currentTimestamp(),
    }));
  }

  function markCompiledPromptStale() {
    updateProject((current) =>
      current.compiledPromptIsManual
        ? current
        : { ...current, compiledPromptStale: true },
    );
  }

  function updateStyleProfile(update: Partial<StyleProfile>) {
    setStyleProfile((current) => ({
      ...current,
      ...update,
      updatedAt: currentTimestamp(),
    }));
    markCompiledPromptStale();
  }

  async function postApi(body: Record<string, unknown>) {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    try {
      const response = await fetch("/api/concept-illustrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) throw new Error(result.error || t.invalidResponse);
      return result;
    } finally {
      controllersRef.current.delete(controller);
    }
  }

  function beginRequest(action: BusyAction) {
    if (busyRef.current) {
      setError(t.busy);
      return false;
    }
    busyRef.current = action;
    setBusy(action);
    setError("");
    return true;
  }

  function finishRequest() {
    busyRef.current = null;
    setBusy(null);
  }

  function isAbort(reason: unknown) {
    return reason instanceof DOMException && reason.name === "AbortError";
  }

  async function planConcepts() {
    if (!project.article.trim()) {
      setError(t.articleRequired);
      return;
    }
    if (!beginRequest("planning")) return;
    try {
      const result = await postApi({
        action: "plan-concepts",
        article: project.article.trim(),
        styleGuidance: styleProfile.styleGuidance,
        aspectRatio: styleProfile.aspectRatio,
        feedbackContext,
      });
      const concepts = normalizeConceptSet(result.concepts);
      if (!concepts) throw new Error(t.invalidConcepts);
      updateProject((current) => ({
        ...current,
        concepts,
        selectedConceptId: null,
        editedConcept: null,
        compiledPrompt: "",
        compiledPromptIsManual: false,
        compiledPromptStale: true,
        revisions: [],
        activeRevisionId: null,
        finalRevisionId: null,
        critique: null,
        feedback: "pending",
        note: "",
      }));
      setArtDirection("");
    } catch (reason) {
      if (!isAbort(reason))
        setError(reason instanceof Error ? reason.message : t.planningError);
    } finally {
      finishRequest();
    }
  }

  async function regenerateConcept(index: number) {
    if (!hasConcepts || !beginRequest("regenerating")) return;
    try {
      const result = await postApi({
        action: "regenerate-concept",
        article: project.article.trim(),
        styleGuidance: styleProfile.styleGuidance,
        aspectRatio: styleProfile.aspectRatio,
        feedbackContext,
        concepts: project.concepts,
        index,
      });
      const concept = normalizeConcept(
        result.concept,
        project.concepts[index].id,
      );
      if (!concept) throw new Error(t.invalidResponse);
      updateProject((current) => {
        const concepts = [...current.concepts] as ConceptSet;
        const replaced = concepts[index];
        concepts[index] = concept;
        const wasSelected = current.selectedConceptId === replaced.id;
        return {
          ...current,
          concepts,
          selectedConceptId: wasSelected
            ? concept.id
            : current.selectedConceptId,
          editedConcept: wasSelected ? concept : current.editedConcept,
          compiledPrompt: wasSelected ? "" : current.compiledPrompt,
          compiledPromptIsManual: wasSelected
            ? false
            : current.compiledPromptIsManual,
          compiledPromptStale: wasSelected ? true : current.compiledPromptStale,
        };
      });
    } catch (reason) {
      if (!isAbort(reason))
        setError(
          reason instanceof Error ? reason.message : t.regenerationError,
        );
    } finally {
      finishRequest();
    }
  }

  function selectConcept(concept: IllustrationConcept) {
    if (busy) return;
    updateProject((current) => ({
      ...current,
      selectedConceptId: concept.id,
      editedConcept: { ...concept },
      compiledPrompt: "",
      compiledPromptIsManual: false,
      compiledPromptStale: true,
    }));
  }

  function editSelectedConcept(
    field: "title" | "visual" | "meaning",
    value: string,
  ) {
    updateProject((current) =>
      current.editedConcept
        ? {
            ...current,
            editedConcept: { ...current.editedConcept, [field]: value },
            compiledPrompt: "",
            compiledPromptIsManual: false,
            compiledPromptStale: true,
          }
        : current,
    );
  }

  async function requestCompiledPrompt(concept: IllustrationConcept) {
    const result = await postApi({
      action: "compile-prompt",
      concept,
      styleGuidance: styleProfile.styleGuidance,
      aspectRatio: styleProfile.aspectRatio,
      feedbackContext,
    });
    if (!result.prompt?.trim()) throw new Error(t.invalidResponse);
    const prompt = result.prompt.trim();
    updateProject((current) => ({
      ...current,
      compiledPrompt: prompt,
      compiledPromptIsManual: false,
      compiledPromptStale: false,
    }));
    return prompt;
  }

  async function compilePrompt() {
    if (!project.editedConcept) {
      setError(t.selectionRequired);
      return;
    }
    if (!beginRequest("compiling")) return;
    try {
      await requestCompiledPrompt(project.editedConcept);
    } catch (reason) {
      if (!isAbort(reason))
        setError(reason instanceof Error ? reason.message : t.compileError);
    } finally {
      finishRequest();
    }
  }

  function revisionFromResult(
    image: ImageResult,
    parentId: string | null,
    concept: IllustrationConcept,
    createdAt: number,
    instruction?: string,
  ): ImageRevision {
    if (!image.data || !image.prompt || !image.model) {
      throw new Error(t.invalidResponse);
    }
    return {
      id: uniqueId("revision"),
      parentId,
      concept: { ...concept },
      image: image.data,
      prompt: image.prompt,
      model: image.model,
      seed: image.seed,
      generationId: image.generationId,
      usage: image.usage,
      instruction,
      createdAt,
    };
  }

  async function generateImage() {
    const concept = project.editedConcept;
    if (!concept) {
      setError(t.selectionRequired);
      return;
    }
    if (!beginRequest("generating")) return;
    try {
      let prompt = project.compiledPrompt.trim();
      if (
        !project.compiledPromptIsManual &&
        (project.compiledPromptStale || !prompt)
      ) {
        prompt = await requestCompiledPrompt(concept);
      }
      if (!prompt) throw new Error(t.compileError);
      const result = await postApi({
        action: "generate-image",
        prompt,
        references: styleProfile.references.map((reference) => reference.data),
        aspectRatio: styleProfile.aspectRatio,
      });
      if (!result.image) throw new Error(t.invalidResponse);
      const revision = revisionFromResult(
        result.image,
        null,
        concept,
        currentTimestamp(),
      );
      updateProject((current) => ({
        ...current,
        compiledPrompt: prompt,
        compiledPromptStale: false,
        revisions: [...current.revisions, revision],
        activeRevisionId: revision.id,
        critique: null,
      }));
      setArtDirection("");
    } catch (reason) {
      if (!isAbort(reason))
        setError(reason instanceof Error ? reason.message : t.generationError);
    } finally {
      finishRequest();
    }
  }

  async function refineImage() {
    const revision = activeRevision;
    const instruction = artDirection.trim();
    if (!revision) return;
    if (!instruction) {
      setError(t.instructionRequired);
      artDirectionRef.current?.focus();
      return;
    }
    if (!beginRequest("refining")) return;
    try {
      const result = await postApi({
        action: "refine-image",
        image: revision.image,
        prompt: revision.prompt,
        instruction,
        references: styleProfile.references
          .slice(0, 2)
          .map((reference) => reference.data),
        aspectRatio: styleProfile.aspectRatio,
      });
      if (!result.image) throw new Error(t.invalidResponse);
      const child = revisionFromResult(
        result.image,
        revision.id,
        revision.concept,
        currentTimestamp(),
        instruction,
      );
      updateProject((current) => ({
        ...current,
        revisions: [...current.revisions, child],
        activeRevisionId: child.id,
        critique: null,
      }));
      setArtDirection("");
    } catch (reason) {
      if (!isAbort(reason))
        setError(reason instanceof Error ? reason.message : t.refinementError);
    } finally {
      finishRequest();
    }
  }

  async function critiqueImage() {
    if (!activeRevision) return;
    if (!beginRequest("critiquing")) return;
    try {
      const result = await postApi({
        action: "critique-image",
        image: activeRevision.image,
        concept: activeRevision.concept,
        styleGuidance: styleProfile.styleGuidance,
      });
      if (
        !result.critique ||
        typeof result.critique.summary !== "string" ||
        !Array.isArray(result.critique.corrections) ||
        typeof result.critique.suggestedEdit !== "string"
      ) {
        throw new Error(t.invalidResponse);
      }
      const critique = result.critique;
      updateProject((current) => ({
        ...current,
        critique: {
          ...critique,
          revisionId: activeRevision.id,
          createdAt: currentTimestamp(),
        },
      }));
    } catch (reason) {
      if (!isAbort(reason))
        setError(reason instanceof Error ? reason.message : t.critiqueError);
    } finally {
      finishRequest();
    }
  }

  function applyQuickInstruction(instruction: string) {
    setArtDirection(instruction);
    window.requestAnimationFrame(() => artDirectionRef.current?.focus());
  }

  function applyCritiqueCorrections() {
    if (!activeCritique) return;
    setArtDirection(
      activeCritique.suggestedEdit.trim() ||
        activeCritique.corrections.join("; "),
    );
    window.requestAnimationFrame(() => artDirectionRef.current?.focus());
  }

  function downloadRevision(revision: ImageRevision) {
    const link = document.createElement("a");
    link.href = revision.image;
    link.download = imageFilename(project, revision);
    link.click();
  }

  async function saveCurrentBeforeSwitch() {
    if (
      !isMeaningfulProject(project) ||
      deletedProjectIdsRef.current.has(project.id)
    )
      return;
    await saveProject(project);
    setStoredProjects((current) =>
      [project, ...current.filter((item) => item.id !== project.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
  }

  async function newProject() {
    if (busy) return;
    try {
      await saveCurrentBeforeSwitch();
      setProject(createEmptyProject());
      setArtDirection("");
      setError("");
      setMemoryError("");
    } catch (reason) {
      setMemoryError(storageErrorMessage(reason));
    }
  }

  async function openStoredProject(projectId: string) {
    if (busy || projectId === project.id) return;
    try {
      await saveCurrentBeforeSwitch();
      const stored = await getProject(projectId);
      if (!stored) return;
      setProject(stored);
      setArtDirection("");
      setError("");
      setMemoryError("");
    } catch (reason) {
      setMemoryError(storageErrorMessage(reason));
    }
  }

  async function removeStoredProject(projectId: string) {
    if (busyRef.current || !window.confirm(t.deleteConfirm)) return;
    deletedProjectIdsRef.current.add(projectId);
    try {
      await deleteProject(projectId);
      setStoredProjects((current) =>
        current.filter((item) => item.id !== projectId),
      );
      if (project.id === projectId) {
        setProject(createEmptyProject());
        setArtDirection("");
        setError("");
      }
      setMemoryError("");
    } catch (reason) {
      deletedProjectIdsRef.current.delete(projectId);
      setMemoryError(storageErrorMessage(reason));
    }
  }

  async function addReferenceFiles(files: File[]) {
    if (busy) return;
    const available = 3 - styleProfile.references.length;
    if (available <= 0) {
      setError(t.referenceLimitError);
      return;
    }
    const selected = files.slice(0, available);
    if (!selected.length) return;
    try {
      const references = await Promise.all(
        selected.map(async (file) => ({
          id: uniqueId("reference"),
          name: file.name,
          data: await prepareReferenceImage(file, {
            type: t.referenceTypeError,
            size: t.referenceSizeError,
            generic: t.referenceError,
          }),
          createdAt: currentTimestamp(),
        })),
      );
      updateStyleProfile({
        references: [...styleProfile.references, ...references].slice(0, 3),
      });
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

  function updateFeedback(feedback: EditorialFeedback) {
    updateProject((current) => ({ ...current, feedback }));
  }

  function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  }

  if (!active) return null;

  return (
    <div className="concept-illustrator-module">
      <div className="concept-illustrator-workbench">
        <aside
          className="concept-illustrator-memory-rail"
          aria-label={t.memory}
        >
          <header className="concept-illustrator-rail-header">
            <div>
              <h2>{t.memory}</h2>
              <p>{t.localOnly}</p>
            </div>
            <button
              type="button"
              className="action-button concept-illustrator-new-project"
              onClick={() => void newProject()}
              disabled={Boolean(busy)}
            >
              + {t.newProject}
            </button>
          </header>

          {memoryError && (
            <p className="concept-illustrator-memory-error" role="alert">
              <strong>{t.memoryError}</strong> {memoryError}
            </p>
          )}

          <nav className="concept-illustrator-project-list">
            {!storedProjects.length && (
              <p className="concept-illustrator-project-empty">
                {t.noProjects}
              </p>
            )}
            {storedProjects.map((stored) => (
              <article
                className={`concept-illustrator-project-item ${stored.id === project.id ? "is-active" : ""}`}
                key={stored.id}
              >
                <button
                  type="button"
                  className="concept-illustrator-project-open"
                  onClick={() => void openStoredProject(stored.id)}
                  aria-label={`${t.openProject}: ${projectTitle(stored) || t.untitledProject}`}
                  disabled={Boolean(busy)}
                >
                  <strong>{projectTitle(stored) || t.untitledProject}</strong>
                  <small>
                    {t.updated} · {formatDate(stored.updatedAt)}
                  </small>
                  {stored.feedback !== "pending" && (
                    <span
                      className={`concept-illustrator-project-${stored.feedback}`}
                    >
                      {stored.feedback === "approved" ? t.approved : t.rejected}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="concept-illustrator-project-delete"
                  onClick={() => void removeStoredProject(stored.id)}
                  aria-label={`${t.deleteProject}: ${projectTitle(stored) || t.untitledProject}`}
                  disabled={Boolean(busy)}
                >
                  ×
                </button>
              </article>
            ))}
          </nav>
        </aside>

        <section className="concept-illustrator-workflow">
          <header className="concept-illustrator-titlebar">
            <div className="tool-header-copy">
              <ToolMeta code={t.code} mode="ai" language={language} />
              <h1>{t.heading}</h1>
            </div>
          </header>

          <section
            className="concept-illustrator-progress"
            aria-label={t.workflow}
          >
            <h2>{t.workflow}</h2>
            <ol>
              {workflowKeys.map((key, index) => (
                <li
                  className={
                    index === workflowStage
                      ? "is-active"
                      : index < workflowStage
                        ? "is-complete"
                        : ""
                  }
                  key={key}
                  aria-current={index === workflowStage ? "step" : undefined}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {t[key]}
                </li>
              ))}
            </ol>
          </section>

          {error && (
            <p className="concept-illustrator-error" role="alert">
              {error}
            </p>
          )}

          <section className="concept-illustrator-article-panel">
            <header>
              <h2>{t.article}</h2>
              <p>{t.articleHelp}</p>
            </header>
            <textarea
              value={project.article}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  article: event.target.value,
                }))
              }
              placeholder={t.articlePlaceholder}
              rows={12}
              disabled={Boolean(busy)}
            />
            <button
              type="button"
              className="action-button action-button-primary concept-illustrator-plan"
              onClick={() => void planConcepts()}
              disabled={Boolean(busy) || !project.article.trim()}
            >
              {busy === "planning" ? t.generatingConcepts : t.generateConcepts}
              <b aria-hidden="true">→</b>
            </button>
          </section>

          {hasConcepts && (
            <section className="concept-illustrator-concepts-panel">
              <h2>{t.concepts}</h2>
              <div className="concept-illustrator-concept-grid">
                {project.concepts.map((concept, index) => {
                  const selected = project.selectedConceptId === concept.id;
                  return (
                    <article
                      className={`concept-illustrator-concept-card ${selected ? "is-selected" : ""}`}
                      key={concept.id}
                    >
                      <header>
                        <span>
                          {t.concept} {String(index + 1).padStart(2, "0")}
                        </span>
                        {selected && <strong>{t.selected}</strong>}
                      </header>
                      <h3>{concept.title}</h3>
                      <dl>
                        <div>
                          <dt>{t.visual}</dt>
                          <dd>{concept.visual}</dd>
                        </div>
                        <div>
                          <dt>{t.meaning}</dt>
                          <dd>{concept.meaning}</dd>
                        </div>
                      </dl>
                      <footer>
                        <button
                          type="button"
                          className="action-button concept-illustrator-select-concept"
                          onClick={() => selectConcept(concept)}
                          disabled={Boolean(busy)}
                        >
                          {selected ? t.selected : t.selectConcept}
                        </button>
                        <button
                          type="button"
                          className="concept-illustrator-regenerate-concept"
                          onClick={() => void regenerateConcept(index)}
                          disabled={Boolean(busy)}
                        >
                          {busy === "regenerating"
                            ? t.regeneratingConcept
                            : t.regenerateConcept}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {project.editedConcept && (
            <section className="concept-illustrator-selection-panel">
              <header>
                <h2>{t.selectedDirection}</h2>
                <p>{t.editBeforeGeneration}</p>
              </header>
              <div className="concept-illustrator-selected-fields">
                <label>
                  <span>{t.title}</span>
                  <input
                    value={project.editedConcept.title}
                    onChange={(event) =>
                      editSelectedConcept("title", event.target.value)
                    }
                    disabled={Boolean(busy)}
                  />
                </label>
                <label>
                  <span>{t.visual}</span>
                  <textarea
                    value={project.editedConcept.visual}
                    onChange={(event) =>
                      editSelectedConcept("visual", event.target.value)
                    }
                    rows={4}
                    disabled={Boolean(busy)}
                  />
                </label>
                <label>
                  <span>{t.meaning}</span>
                  <textarea
                    value={project.editedConcept.meaning}
                    onChange={(event) =>
                      editSelectedConcept("meaning", event.target.value)
                    }
                    rows={3}
                    disabled={Boolean(busy)}
                  />
                </label>
              </div>

              <details className="concept-illustrator-advanced-prompt">
                <summary>{t.advancedPrompt}</summary>
                <p>{t.advancedPromptHelp}</p>
                <textarea
                  value={project.compiledPrompt}
                  onChange={(event) => {
                    const compiledPrompt = event.target.value;
                    updateProject((current) => ({
                      ...current,
                      compiledPrompt,
                      compiledPromptIsManual: Boolean(compiledPrompt.trim()),
                      compiledPromptStale: !compiledPrompt.trim(),
                    }));
                  }}
                  placeholder={t.promptPlaceholder}
                  rows={8}
                  disabled={Boolean(busy)}
                />
                <div className="concept-illustrator-prompt-actions">
                  <small>
                    {project.compiledPromptIsManual
                      ? t.promptManual
                      : t.promptAutomatic}
                  </small>
                  <button
                    type="button"
                    className="action-button concept-illustrator-compile-prompt"
                    onClick={() => void compilePrompt()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "compiling" ? t.compilingPrompt : t.compilePrompt}
                  </button>
                </div>
              </details>

              <button
                type="button"
                className="action-button action-button-primary concept-illustrator-generate-image"
                onClick={() => void generateImage()}
                disabled={
                  Boolean(busy) ||
                  !project.editedConcept.title.trim() ||
                  !project.editedConcept.visual.trim() ||
                  !project.editedConcept.meaning.trim()
                }
              >
                {busy === "generating" ? t.generatingImage : t.generateImage}
                <b aria-hidden="true">→</b>
              </button>
            </section>
          )}

          <section className="concept-illustrator-image-panel">
            <header>
              <h2>{t.activeRevision}</h2>
              {activeRevision && (
                <span>
                  {t.revision} {project.revisions.indexOf(activeRevision) + 1}
                </span>
              )}
            </header>
            {activeRevision ? (
              <figure className="concept-illustrator-active-image">
                <img
                  src={activeRevision.image}
                  alt={activeRevision.concept.title || t.activeRevision}
                />
                <figcaption>
                  <strong>{activeRevision.concept.title}</strong>
                  <span>
                    {activeRevision.model} · seed {activeRevision.seed}
                  </span>
                  <button
                    type="button"
                    className="action-button concept-illustrator-download"
                    onClick={() => downloadRevision(activeRevision)}
                  >
                    ↓ {t.download}
                  </button>
                </figcaption>
              </figure>
            ) : (
              <p className="concept-illustrator-image-empty">{t.noImage}</p>
            )}

            {project.revisions.length > 0 && (
              <div className="concept-illustrator-revision-history">
                <h3>{t.revisionHistory}</h3>
                <div className="concept-illustrator-revision-strip">
                  {project.revisions.map((revision, index) => (
                    <button
                      type="button"
                      className={`concept-illustrator-revision ${revision.id === activeRevision?.id ? "is-active" : ""} ${revision.id === project.finalRevisionId ? "is-final" : ""}`}
                      key={revision.id}
                      onClick={() =>
                        updateProject((current) => ({
                          ...current,
                          activeRevisionId: revision.id,
                        }))
                      }
                      disabled={Boolean(busy)}
                    >
                      <img src={revision.image} alt="" />
                      <span>
                        {String(index + 1).padStart(2, "0")} ·{" "}
                        {revision.parentId ? t.childRevision : t.rootRevision}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {activeRevision && (
            <section className="concept-illustrator-refinement-panel">
              <header>
                <h2>{t.artDirection}</h2>
                <p>{t.artDirectionHelp}</p>
              </header>
              <div className="concept-illustrator-quick-actions">
                {[
                  [t.regenerate, t.regenerateInstruction],
                  [t.anotherComposition, t.compositionInstruction],
                  [t.simplify, t.simplifyInstruction],
                  [t.customEdit, t.customInstruction],
                ].map(([label, instruction]) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => applyQuickInstruction(instruction)}
                    disabled={Boolean(busy)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                ref={artDirectionRef}
                value={artDirection}
                onChange={(event) => setArtDirection(event.target.value)}
                placeholder={t.artDirectionPlaceholder}
                rows={5}
                disabled={Boolean(busy)}
              />
              <button
                type="button"
                className="action-button action-button-primary concept-illustrator-create-revision"
                onClick={() => void refineImage()}
                disabled={Boolean(busy) || !artDirection.trim()}
              >
                {busy === "refining" ? t.refiningImage : t.createRevision}
                <b aria-hidden="true">→</b>
              </button>
            </section>
          )}

          {activeRevision && (
            <section className="concept-illustrator-critique-panel">
              <header>
                <div>
                  <h2>{t.critique}</h2>
                  <p>{t.critiqueHelp}</p>
                </div>
                <button
                  type="button"
                  className="action-button concept-illustrator-run-critique"
                  onClick={() => void critiqueImage()}
                  disabled={Boolean(busy)}
                >
                  {busy === "critiquing" ? t.critiquing : t.runCritique}
                </button>
              </header>
              {activeCritique && (
                <div className="concept-illustrator-critique-result">
                  <div>
                    <h3>{t.critiqueSummary}</h3>
                    <p>{activeCritique.summary}</p>
                  </div>
                  <div>
                    <h3>{t.corrections}</h3>
                    <ul>
                      {activeCritique.corrections.map((correction, index) => (
                        <li key={`${correction}-${index}`}>{correction}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="action-button concept-illustrator-apply-critique"
                    onClick={applyCritiqueCorrections}
                    disabled={Boolean(busy)}
                  >
                    {t.applyCorrections}
                  </button>
                  <small>{t.applyCorrectionsHelp}</small>
                </div>
              )}
            </section>
          )}

          {activeRevision && (
            <section className="concept-illustrator-approval-panel">
              <h2>{t.approval}</h2>
              <div className="concept-illustrator-decision-options">
                {(
                  ["pending", "approved", "rejected"] as EditorialFeedback[]
                ).map((feedback) => (
                  <label key={feedback}>
                    <input
                      type="radio"
                      name={`concept-illustrator-feedback-${project.id}`}
                      value={feedback}
                      checked={project.feedback === feedback}
                      onChange={() => updateFeedback(feedback)}
                      disabled={Boolean(busy)}
                    />
                    <span>{t[feedback]}</span>
                  </label>
                ))}
              </div>
              <label className="concept-illustrator-note-field">
                <span>{t.note}</span>
                <textarea
                  value={project.note}
                  onChange={(event) =>
                    updateProject((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder={t.notePlaceholder}
                  rows={3}
                  disabled={Boolean(busy)}
                />
              </label>
              <button
                type="button"
                className="action-button action-button-success concept-illustrator-save-final"
                onClick={() =>
                  updateProject((current) => ({
                    ...current,
                    finalRevisionId: activeRevision.id,
                  }))
                }
                disabled={Boolean(busy)}
              >
                {project.finalRevisionId === activeRevision.id
                  ? `✓ ${t.savedFinal}`
                  : t.saveFinal}
              </button>
            </section>
          )}
        </section>

        <aside
          className="concept-illustrator-style-rail"
          aria-label={t.houseStyle}
        >
          <header className="concept-illustrator-rail-header">
            <div>
              <h2>{t.houseStyle}</h2>
              <p>{t.persistentProfile}</p>
            </div>
          </header>

          <label className="concept-illustrator-style-guidance">
            <span>{t.styleGuidance}</span>
            <textarea
              value={styleProfile.styleGuidance}
              onChange={(event) =>
                updateStyleProfile({ styleGuidance: event.target.value })
              }
              placeholder={t.stylePlaceholder}
              rows={10}
              disabled={Boolean(busy)}
            />
          </label>

          <label className="concept-illustrator-aspect-ratio">
            <span>{t.aspectRatio}</span>
            <select
              value={styleProfile.aspectRatio}
              onChange={(event) =>
                updateStyleProfile({
                  aspectRatio: event.target.value as ConceptAspectRatio,
                })
              }
              disabled={Boolean(busy)}
            >
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:2">3:2</option>
              <option value="16:9">16:9</option>
            </select>
          </label>

          <section className="concept-illustrator-style-references">
            <header>
              <h3>{t.references}</h3>
              <span>{styleProfile.references.length}/3</span>
            </header>
            <p>{t.referencesHelp}</p>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleReferenceInput}
              hidden
            />
            <div className="concept-illustrator-reference-grid">
              {styleProfile.references.map((reference) => (
                <figure key={reference.id}>
                  <img src={reference.data} alt={reference.name} />
                  <figcaption>{reference.name}</figcaption>
                  <button
                    type="button"
                    onClick={() =>
                      updateStyleProfile({
                        references: styleProfile.references.filter(
                          (item) => item.id !== reference.id,
                        ),
                      })
                    }
                    disabled={Boolean(busy)}
                    aria-label={`${t.removeReference}: ${reference.name}`}
                  >
                    ×
                  </button>
                </figure>
              ))}
              {styleProfile.references.length < 3 && (
                <button
                  type="button"
                  className="concept-illustrator-add-reference"
                  onClick={() => referenceInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <b>+</b>
                  <span>{t.addReference}</span>
                </button>
              )}
            </div>
          </section>

          <p className="concept-illustrator-local-note">{t.localStorageNote}</p>
        </aside>
      </div>
    </div>
  );
}
