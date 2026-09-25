"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { localizedCoverUi } from "./copy";
import type { Language } from "../../registry";
import { EmptyViewportState, ToolMeta } from "../../../_components/ToolChrome";
import type {
  CoverAudience,
  CoverSubject,
  PlannedCoverConcept,
} from "./code/types";

export type CoverModel =
  | "black-forest-labs/flux.2-pro"
  | "google/gemini-3.1-flash-lite-image"
  | "black-forest-labs/flux.2-klein-4b";
export type { CoverAudience, CoverSubject, PlannedCoverConcept };
export type CoverReference = { name: string; data: string; artData: string };
export type CoverUsage = {
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
export type CoverGeneration = {
  id: string;
  data: string;
  seed: number | null;
  status: "active" | "selected" | "rejected";
  createdAt: string;
  model: string;
  direction?: string;
  concept: PlannedCoverConcept;
  generationId?: string;
  usage: CoverUsage;
};
export function CoverLightbox({
  language,
  cover,
  onMove,
  onClose,
}: {
  language: Language;
  cover: CoverGeneration;
  onMove: (direction: number) => void;
  onClose: () => void;
}) {
  const t = localizedCoverUi[language];
  const seed = cover.seed === null ? t.seedUnavailable : `seed ${cover.seed}`;
  const credits =
    cover.usage.cost === null
      ? "credits unavailable"
      : `${cover.usage.cost.toFixed(4)} cr`;
  return (
    <div
      className="manual-lightbox cover-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t.zoom}
      onClick={onClose}
    >
      <button
        className="manual-lightbox-close"
        onClick={onClose}
        aria-label={t.close}
      >
        ×
      </button>
      <button
        className="cover-lightbox-arrow previous"
        onClick={(event) => {
          event.stopPropagation();
          onMove(-1);
        }}
        aria-label={language === "cs" ? "Předchozí obrázek" : "Previous image"}
      >
        ←
      </button>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={cover.data} alt={cover.direction || t.heading} />
        <figcaption>
          <span>{cover.direction || t.sketch}</span>
          <small>{`${cover.model} · ${seed} · ${credits}`}</small>
        </figcaption>
      </figure>
      <button
        className="cover-lightbox-arrow next"
        onClick={(event) => {
          event.stopPropagation();
          onMove(1);
        }}
        aria-label={language === "cs" ? "Další obrázek" : "Next image"}
      >
        →
      </button>
    </div>
  );
}

type CoverProps = {
  language: Language;
  inputRef: RefObject<HTMLInputElement | null>;
  references: CoverReference[];
  audience: CoverAudience | "";
  subject: CoverSubject | "";
  customSubject: string;
  keywords: string;
  sketches: CoverGeneration[];
  selectedId: string | null;
  model: CoverModel;
  artOnlyReferences: boolean;
  generationCount: 2 | 4;
  error: string;
  isGenerating: boolean;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddReferenceFiles: (files: File[]) => void;
  onRemoveReference: (index: number) => void;
  onAudience: (audience: CoverAudience) => void;
  onSubject: (subject: CoverSubject) => void;
  onCustomSubject: (subject: string) => void;
  onKeywords: (keywords: string) => void;
  onSelectSketch: (id: string) => void;
  onRejectSketch: (id: string) => void;
  onZoom: (cover: CoverGeneration) => void;
  onExportArtboard: () => void;
  onDownload: () => void;
  onModel: (model: CoverModel) => void;
  onArtOnlyReferences: (enabled: boolean) => void;
  onGenerateSketches: (count: 2 | 4) => void;
};

export function CoverGeneratorMainInterface({
  language,
  inputRef,
  references,
  audience,
  subject,
  customSubject,
  keywords,
  sketches,
  selectedId,
  model,
  artOnlyReferences,
  generationCount,
  error,
  isGenerating,
  onReferenceInput,
  onAddReferenceFiles,
  onRemoveReference,
  onAudience,
  onSubject,
  onCustomSubject,
  onKeywords,
  onSelectSketch,
  onRejectSketch,
  onZoom,
  onExportArtboard,
  onDownload,
  onModel,
  onArtOnlyReferences,
  onGenerateSketches,
}: CoverProps) {
  const t = localizedCoverUi[language];
  const activeSketches = sketches.filter((item) => item.status !== "rejected");
  const [requestedCount, setRequestedCount] = useState<2 | 4>(2);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelpOpen(false);
        helpButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen]);

  return (
    <div className="cover-module">
      <section
        className={`cover-stage ${!sketches.length && !isGenerating ? "initial" : ""}`}
      >
        <header className="cover-stage-head">
          <div className="tool-header-copy">
            <ToolMeta code={t.code} mode="ai" language={language} />
            <div className="cover-title-row">
              <h1>{t.heading}</h1>
              <span className="cover-active-count" tabIndex={0}>
                {activeSketches.length} / 16
                <span role="tooltip">
                  {language === "cs"
                    ? "Počet aktivních návrhů z maximálních 16"
                    : "Number of active sketches out of maximum 16"}
                </span>
              </span>
            </div>
          </div>
        </header>
        <div
          className={`cover-grid visual-multiple-grid ${sketches.length || isGenerating ? "has-results" : ""}`}
          aria-live="polite"
        >
          {activeSketches.map((item, index) => {
            return (
              <article
                className={`cover-card visual-multiple-card ${item.status === "selected" ? "selected" : ""}`}
                data-cover-id={item.id}
                key={item.id}
              >
                <button
                  className="cover-image"
                  onClick={() => onZoom(item)}
                  aria-label={`${t.zoom} ${index + 1}`}
                >
                  <img src={item.data} alt={`${t.sketch} ${index + 1}`} />
                </button>
                <footer className="cover-card-actions">
                  <button
                    className="cover-upvote"
                    onClick={() => onSelectSketch(item.id)}
                    aria-pressed={item.status === "selected"}
                  >
                    {item.status === "selected" ? t.choose : t.upvote}
                  </button>
                  <button
                    className="cover-reject"
                    onClick={() => onRejectSketch(item.id)}
                    aria-label={t.reject}
                  >
                    ×
                  </button>
                </footer>
              </article>
            );
          })}
          {!activeSketches.length && !isGenerating && (
            <EmptyViewportState className="cover-empty">
              {t.empty}
            </EmptyViewportState>
          )}
          {isGenerating &&
            Array.from({ length: generationCount }, (_, index) => (
              <div
                className="cover-card visual-multiple-card cover-loading"
                key={`loading-${index}`}
              >
                <span>
                  {t.generating}
                  <br />
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
        </div>
      </section>
      <aside className="cover-toolbar editor-sidebar">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={onReferenceInput}
          hidden
        />
        <section className="cover-control cover-reference-control">
          <label>
            {t.references}{" "}
            <b>
              {references.length}/3 · {t.optional}
            </b>
          </label>
          <div className="cover-references">
            {Array.from({ length: 3 }, (_, index) => {
              const reference = references[index];
              return reference ? (
                <figure key={`${reference.name}-${index}`}>
                  <img src={reference.data} alt={reference.name} />
                  <button
                    onClick={() => onRemoveReference(index)}
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
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    onAddReferenceFiles(Array.from(event.dataTransfer.files));
                  }}
                  aria-label={`${t.addCover.replace("\n", " ")} ${index + 1}`}
                >
                  <b>+</b>
                  <span>
                    {t.addCover.split("\n").map((line, lineIndex) => (
                      <span key={line}>
                        {line}
                        {lineIndex === 0 && <br />}
                      </span>
                    ))}
                  </span>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                </button>
              );
            })}
          </div>
          <label className="cover-checkbox cover-ignore-text">
            <input
              type="checkbox"
              checked={artOnlyReferences}
              onChange={(event) => onArtOnlyReferences(event.target.checked)}
            />
            <span>
              <b>{t.artOnly}</b>
              <small>{t.artOnlyHelp}</small>
            </span>
          </label>
        </section>
        <section className="cover-control cover-input-control">
          <label htmlFor="cover-audience">{t.audience}</label>
          <select
            id="cover-audience"
            value={audience}
            onChange={(event) =>
              onAudience(event.target.value as CoverAudience)
            }
          >
            <option value="">{t.audiencePlaceholder}</option>
            <option value="preschool">{t.audiencePreschool}</option>
            <option value="primary">{t.audiencePrimary}</option>
            <option value="lower-secondary">{t.audienceLowerSecondary}</option>
            <option value="upper-secondary">{t.audienceUpperSecondary}</option>
          </select>
          <label htmlFor="cover-subject">{t.subject}</label>
          <select
            id="cover-subject"
            value={subject}
            onChange={(event) => onSubject(event.target.value as CoverSubject)}
          >
            <option value="">{t.subjectPlaceholder}</option>
            <option value="preschool-general">{t.preschoolGeneral}</option>
            <option value="primary-general">{t.primaryGeneral}</option>
            <option value="czech-language">{t.czechLanguage}</option>
            <option value="literature">{t.literature}</option>
            <option value="foreign-language">{t.foreignLanguage}</option>
            <option value="mathematics">{t.mathematics}</option>
            <option value="physics">{t.physics}</option>
            <option value="chemistry">{t.chemistry}</option>
            <option value="biology-natural-science">{t.biology}</option>
            <option value="geography">{t.geography}</option>
            <option value="history">{t.history}</option>
            <option value="civics-social-science">{t.civics}</option>
            <option value="computing-technology">{t.computing}</option>
            <option value="vocational-subject">{t.vocational}</option>
            <option value="exam-preparation">{t.examPreparation}</option>
            <option value="other">{t.other}</option>
          </select>
          {subject === "other" && (
            <input
              className="cover-custom-subject"
              value={customSubject}
              onChange={(event) => onCustomSubject(event.target.value)}
              placeholder={t.customSubjectPlaceholder}
              aria-label={t.customSubject}
            />
          )}
          <div className="cover-keywords-label">
            <label htmlFor="cover-keywords">{t.keywords}</label>
            <button
              ref={helpButtonRef}
              type="button"
              className="cover-prompt-help"
              onClick={() => setHelpOpen(true)}
              aria-label={t.promptHelpLabel}
              aria-expanded={helpOpen}
              aria-controls="cover-prompt-help"
            >
              ?
            </button>
          </div>
          <textarea
            id="cover-keywords"
            value={keywords}
            onChange={(event) => onKeywords(event.target.value)}
            placeholder={t.keywordsPlaceholder}
            rows={3}
          />
        </section>
        <section className="cover-control cover-render-controls">
          <label htmlFor="cover-model">{t.model}</label>
          <select
            id="cover-model"
            value={model}
            onChange={(event) => onModel(event.target.value as CoverModel)}
          >
            <option value="black-forest-labs/flux.2-pro">
              {t.modelFluxPro}
            </option>
            <option value="google/gemini-3.1-flash-lite-image">
              {t.modelGemini}
            </option>
            <option value="black-forest-labs/flux.2-klein-4b">
              {t.modelFlux}
            </option>
          </select>
          <small>
            {model === "google/gemini-3.1-flash-lite-image"
              ? t.modelGeminiNote
              : model === "black-forest-labs/flux.2-pro"
                ? t.modelFluxProNote
                : t.modelFluxNote}
          </small>
        </section>
        {error && (
          <p className="extraction-error" role="alert">
            {error}
          </p>
        )}
        <div className="cover-generate-group">
          <label>
            <span>
              {language === "cs" ? "POČET NÁVRHŮ" : "NUMBER OF CONCEPTS"}
            </span>
            <select
              value={requestedCount}
              onChange={(event) =>
                setRequestedCount(Number(event.target.value) as 2 | 4)
              }
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
          <button
            className="cover-generate action-button action-button-primary"
            onClick={() => onGenerateSketches(requestedCount)}
            disabled={
              !audience ||
              !subject ||
              (subject === "other" && !customSubject.trim()) ||
              isGenerating ||
              activeSketches.length + requestedCount > 16
            }
          >
            <span>
              {isGenerating
                ? `${t.generatingCount} ${generationCount}…`
                : selectedId
                  ? requestedCount === 2
                    ? t.generateSelectedTwo
                    : t.generateSelectedFour
                  : requestedCount === 2
                    ? t.generateTwo
                    : t.generateFour}
            </span>
            <b>→</b>
          </button>
        </div>
        <p className="cover-note">{t.note}</p>
        <div className="cover-export-actions cover-toolbar-exports">
          <button
            className="cover-export cover-artboard-export action-button action-button-success"
            onClick={onExportArtboard}
            disabled={!activeSketches.length}
          >
            {t.exportArtboard}
          </button>
          <button
            className="cover-export action-button action-button-success"
            onClick={onDownload}
            disabled={!sketches.length}
          >
            {t.download}
          </button>
        </div>
      </aside>
      {helpOpen && (
        <>
          <button
            type="button"
            className="cover-prompt-help-scrim"
            onClick={() => {
              setHelpOpen(false);
              helpButtonRef.current?.focus();
            }}
            aria-label={t.close}
          />
          <div
            className="cover-prompt-help-popover"
            id="cover-prompt-help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-prompt-help-title"
          >
            <button
              type="button"
              className="cover-prompt-help-close"
              onClick={() => {
                setHelpOpen(false);
                helpButtonRef.current?.focus();
              }}
              aria-label={t.close}
            >
              ×
            </button>
            <h2 id="cover-prompt-help-title">{t.promptHelpTitle}</h2>
            <p>{t.promptHelpIntro}</p>
            <h3>{t.promptHelpIncludeTitle}</h3>
            <ul>
              {t.promptHelpInclude.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              <strong>{t.promptHelpFocusTitle}</strong> {t.promptHelpFocus}
            </p>
            <div className="cover-prompt-example">
              <strong>{t.promptHelpExampleTitle}</strong>
              <p>{t.promptHelpExample}</p>
            </div>
            <p className="cover-prompt-avoid">
              <strong>{t.promptHelpAvoidTitle}</strong> {t.promptHelpAvoid}
            </p>
            <p>{t.promptHelpEnd}</p>
          </div>
        </>
      )}
    </div>
  );
}
