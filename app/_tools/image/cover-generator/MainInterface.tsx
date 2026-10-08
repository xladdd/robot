"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { localizedCoverUi } from "./copy";
import type { Language } from "../../registry";
import { EmptyViewportState, ToolMeta } from "../../../_components/ToolChrome";
import {
  coverTreatments,
  type CoverAudience,
  type CoverLightboxOverlay,
  type CoverOverlayTone,
  type CoverStyleSelection,
  type CoverSubject,
  type CoverTreatment,
  type PlannedCoverConcept,
} from "./code/types";
import {
  coverStylePreviewImages,
  coverStylePrompts,
} from "./code/style-catalog";

export type CoverModel =
  "black-forest-labs/flux.2-pro" | "google/gemini-3.1-flash-lite-image";
export type {
  CoverAudience,
  CoverStyleSelection,
  CoverSubject,
  PlannedCoverConcept,
};
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
  overlay,
  onOverlay,
  onMove,
  onClose,
}: {
  language: Language;
  cover: CoverGeneration;
  overlay: CoverLightboxOverlay;
  onOverlay: (overlay: CoverLightboxOverlay) => void;
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
        <div className="cover-lightbox-preview">
          <img src={cover.data} alt={cover.direction || t.heading} />
          {overlay !== "none" && (
            <span
              className="cover-lightbox-text-overlay"
              style={{
                backgroundImage: `url(/cover-generator/cover-overlay-${overlay}.png)`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
        <figcaption>
          <div className="cover-lightbox-caption-copy">
            <span>{cover.direction || t.sketch}</span>
            <small>{`${cover.model} · ${seed} · ${credits}`}</small>
          </div>
          <div
            className="cover-lightbox-overlay-switch"
            role="group"
            aria-label={t.previewOverlay}
          >
            <button
              type="button"
              className={overlay === "white" ? "active" : ""}
              aria-label={t.overlayWhite}
              aria-pressed={overlay === "white"}
              onClick={() => onOverlay("white")}
            >
              W
            </button>
            <button
              type="button"
              className={overlay === "black" ? "active" : ""}
              aria-label={t.overlayBlack}
              aria-pressed={overlay === "black"}
              onClick={() => onOverlay("black")}
            >
              B
            </button>
            <button
              type="button"
              className={overlay === "none" ? "active" : ""}
              aria-label={t.overlayNone}
              aria-pressed={overlay === "none"}
              onClick={() => onOverlay("none")}
            >
              None
            </button>
          </div>
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
  style: CoverStyleSelection;
  subject: CoverSubject | "";
  customSubject: string;
  keywords: string;
  sketches: CoverGeneration[];
  selectedId: string | null;
  model: CoverModel;
  artOnlyReferences: boolean;
  overlayTone: CoverOverlayTone;
  overlayChoices: Record<string, CoverLightboxOverlay>;
  generationCount: 1 | 2 | 4;
  error: string;
  isGenerating: boolean;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddReferenceFiles: (files: File[]) => void;
  onRemoveReference: (index: number) => void;
  onAudience: (audience: CoverAudience) => void;
  onStyle: (style: CoverStyleSelection) => void;
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
  onOverlayTone: (tone: CoverOverlayTone) => void;
  onGenerateSketches: (count: 1 | 2 | 4) => void;
};

export function CoverGeneratorMainInterface({
  language,
  inputRef,
  references,
  audience,
  style,
  subject,
  customSubject,
  keywords,
  sketches,
  selectedId,
  model,
  artOnlyReferences,
  overlayTone,
  overlayChoices,
  generationCount,
  error,
  isGenerating,
  onReferenceInput,
  onAddReferenceFiles,
  onRemoveReference,
  onAudience,
  onStyle,
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
  onOverlayTone,
  onGenerateSketches,
}: CoverProps) {
  const t = localizedCoverUi[language];
  const activeSketches = sketches.filter((item) => item.status !== "rejected");
  const [requestedCount, setRequestedCount] = useState<1 | 2 | 4>(2);
  const [helpOpen, setHelpOpen] = useState(false);
  const [styleHelpOpen, setStyleHelpOpen] = useState(false);
  const [selectedStylePreview, setSelectedStylePreview] =
    useState<CoverTreatment>(coverTreatments[0]);
  const [stylePromptCopied, setStylePromptCopied] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const styleHelpButtonRef = useRef<HTMLButtonElement>(null);
  const workspacePortalRoot =
    (helpOpen || styleHelpOpen) && typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(".workspace")
      : null;
  const styleLabels: Record<CoverTreatment, string> = {
    "atmospheric environmental photomontage": t.styleAtmosphericPhotomontage,
    "tactile editorial object montage": t.styleObjectMontage,
    "scientific macro or material study": t.styleScientificStudy,
    "detailed stylized illustration montage": t.styleIllustrationMontage,
    "coloured wood engraving": t.styleWoodEngraving,
    "modern risograph": t.styleRisograph,
    "ink-lined watercolour": t.styleInkWatercolour,
    "20th century-style propaganda watercolour": t.stylePropagandaWatercolour,
  };
  const stylePreviews = coverTreatments.map((treatment) => ({
    treatment,
    label: styleLabels[treatment],
    image: coverStylePreviewImages[treatment],
  }));
  const selectedStyle = stylePreviews.find(
    ({ treatment }) => treatment === selectedStylePreview,
  )!;
  const generateLabel = selectedId
    ? {
        1: t.generateSelectedOne,
        2: t.generateSelectedTwo,
        4: t.generateSelectedFour,
      }[requestedCount]
    : {
        1: t.generateOne,
        2: t.generateTwo,
        4: t.generateFour,
      }[requestedCount];

  useEffect(() => {
    if (!helpOpen && !styleHelpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (styleHelpOpen) {
        setStyleHelpOpen(false);
        styleHelpButtonRef.current?.focus();
        return;
      }
      setHelpOpen(false);
      helpButtonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen, styleHelpOpen]);

  async function copySelectedStylePrompt() {
    try {
      await navigator.clipboard.writeText(
        coverStylePrompts[selectedStylePreview],
      );
      setStylePromptCopied(true);
    } catch {
      setStylePromptCopied(false);
    }
  }

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
            const cardOverlay = overlayChoices[item.id] ?? overlayTone;
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
                  {cardOverlay !== "none" && (
                    <span
                      className="cover-text-overlay"
                      style={{
                        backgroundImage: `url(/cover-generator/cover-overlay-${cardOverlay}.png)`,
                      }}
                      aria-hidden="true"
                    />
                  )}
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
          <div className="cover-style-label">
            <label htmlFor="cover-style">{t.style}</label>
            <button
              ref={styleHelpButtonRef}
              type="button"
              className="cover-prompt-help"
              onClick={() => {
                setSelectedStylePreview(
                  style === "automatic" ? coverTreatments[0] : style,
                );
                setStylePromptCopied(false);
                setStyleHelpOpen(true);
              }}
              aria-label={t.styleHelpLabel}
              aria-expanded={styleHelpOpen}
              aria-controls="cover-style-help"
            >
              ?
            </button>
          </div>
          <select
            id="cover-style"
            value={style}
            onChange={(event) =>
              onStyle(event.target.value as CoverStyleSelection)
            }
          >
            <option value="automatic">{t.styleAutomatic}</option>
            <option value="atmospheric environmental photomontage">
              {t.styleAtmosphericPhotomontage}
            </option>
            <option value="tactile editorial object montage">
              {t.styleObjectMontage}
            </option>
            <option value="scientific macro or material study">
              {t.styleScientificStudy}
            </option>
            <option value="detailed stylized illustration montage">
              {t.styleIllustrationMontage}
            </option>
            <option value="coloured wood engraving">
              {t.styleWoodEngraving}
            </option>
            <option value="modern risograph">{t.styleRisograph}</option>
            <option value="ink-lined watercolour">
              {t.styleInkWatercolour}
            </option>
            <option value="20th century-style propaganda watercolour">
              {t.stylePropagandaWatercolour}
            </option>
          </select>
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
          </select>
          <small>
            {model === "google/gemini-3.1-flash-lite-image"
              ? t.modelGeminiNote
              : t.modelFluxProNote}
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
                setRequestedCount(Number(event.target.value) as 1 | 2 | 4)
              }
            >
              <option value={1}>1</option>
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
                : generateLabel}
            </span>
            <b>→</b>
          </button>
        </div>
        <p className="cover-note cover-planner-note">{t.note}</p>
        <section className="cover-control cover-overlay-control">
          <label>{t.previewOverlay}</label>
          <div
            className="cover-overlay-options"
            role="group"
            aria-label={t.previewOverlay}
          >
            <button
              type="button"
              className={overlayTone === "black" ? "active" : ""}
              aria-pressed={overlayTone === "black"}
              onClick={() => onOverlayTone("black")}
            >
              {t.overlayBlack}
            </button>
            <button
              type="button"
              className={overlayTone === "white" ? "active" : ""}
              aria-pressed={overlayTone === "white"}
              onClick={() => onOverlayTone("white")}
            >
              {t.overlayWhite}
            </button>
          </div>
          <small>{t.overlayPreviewOnly}</small>
        </section>
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
      {helpOpen &&
        workspacePortalRoot &&
        createPortal(
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
          </>,
          workspacePortalRoot,
        )}
      {styleHelpOpen &&
        workspacePortalRoot &&
        createPortal(
          <>
            <button
              type="button"
              className="cover-prompt-help-scrim"
              onClick={() => {
                setStyleHelpOpen(false);
                styleHelpButtonRef.current?.focus();
              }}
              aria-label={t.close}
            />
            <div
              className="cover-style-help-popover"
              id="cover-style-help"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cover-style-help-title"
            >
              <button
                type="button"
                className="cover-prompt-help-close"
                onClick={() => {
                  setStyleHelpOpen(false);
                  styleHelpButtonRef.current?.focus();
                }}
                aria-label={t.close}
              >
                ×
              </button>
              <header>
                <h2 id="cover-style-help-title">{t.styleHelpTitle}</h2>
              </header>
              <div className="cover-style-browser">
                <div
                  className="cover-style-list"
                  role="listbox"
                  aria-label={t.styleHelpTitle}
                >
                  {stylePreviews.map((preview) => (
                    <button
                      type="button"
                      className={`cover-style-option ${
                        preview.treatment === selectedStylePreview
                          ? "selected"
                          : ""
                      }`}
                      key={preview.treatment}
                      role="option"
                      aria-selected={preview.treatment === selectedStylePreview}
                      onClick={() => {
                        setSelectedStylePreview(preview.treatment);
                        setStylePromptCopied(false);
                      }}
                    >
                      <Image
                        src={preview.image}
                        alt=""
                        width={768}
                        height={1024}
                        sizes="(max-width: 900px) 20vw, 120px"
                        unoptimized
                        aria-hidden="true"
                      />
                      <span>{preview.label}</span>
                    </button>
                  ))}
                </div>
                <section className="cover-style-detail">
                  <Image
                    src={selectedStyle.image}
                    alt={selectedStyle.label}
                    width={768}
                    height={1024}
                    sizes="(max-width: 900px) 320px, 300px"
                    unoptimized
                  />
                  <h3>{selectedStyle.label}</h3>
                  <label>{t.stylePromptLabel}</label>
                  <p>{coverStylePrompts[selectedStylePreview]}</p>
                  <button
                    type="button"
                    className="cover-style-copy action-button action-button-primary"
                    onClick={() => void copySelectedStylePrompt()}
                  >
                    {stylePromptCopied
                      ? t.stylePromptCopied
                      : t.copyStylePrompt}
                  </button>
                </section>
              </div>
            </div>
          </>,
          workspacePortalRoot,
        )}
    </div>
  );
}
