"use client";

import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { copy } from "../content/ui";
import type { FeedbackDiagnostics, FeedbackLanguage } from "../_feedback/types";

const MAX_DESCRIPTION_LENGTH = 4_000;

type BugFeedbackDialogProps = {
  open: boolean;
  language: FeedbackLanguage;
  username: string;
  diagnostics: FeedbackDiagnostics | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onCloseAction: () => void;
};

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; taskUrl: string | null }
  | { status: "error"; message: string };

function formatFileSize(size: number | null) {
  if (size === null) return "—";
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} kB`;
  return `${(size / 1_000_000).toFixed(1)} MB`;
}

export function BugFeedbackDialog({
  open,
  language,
  username,
  diagnostics,
  triggerRef,
  onCloseAction,
}: BugFeedbackDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [description, setDescription] = useState("");
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
  });
  const t = copy[language].bugFeedback;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => descriptionRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) {
      setDescription("");
      setSubmission({ status: "idle" });
    }
  }, [open]);

  function closeDialog() {
    if (submission.status === "submitting") return;
    onCloseAction();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!diagnostics || submission.status === "submitting") return;
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setSubmission({ status: "error", message: t.descriptionRequired });
      descriptionRef.current?.focus();
      return;
    }

    setSubmission({ status: "submitting" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmedDescription,
          diagnostics,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        taskUrl?: string | null;
      } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(t.submitError);
      }
      setSubmission({ status: "success", taskUrl: result.taskUrl || null });
    } catch (error) {
      setSubmission({
        status: "error",
        message: error instanceof Error ? error.message : t.submitError,
      });
    }
  }

  const isSubmitting = submission.status === "submitting";
  const submitted = submission.status === "success";

  return (
    <dialog
      ref={dialogRef}
      className="bug-feedback-dialog"
      aria-labelledby="bug-feedback-title"
      aria-describedby="bug-feedback-description"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="bug-feedback-panel" role="document">
        <div className="bug-feedback-header">
          <div>
            <p className="eyebrow">TAKTIK ROBOT / {t.eyebrow}</p>
            <h2 id="bug-feedback-title">{t.heading}</h2>
          </div>
          <button
            type="button"
            className="bug-feedback-close"
            onClick={closeDialog}
            aria-label={t.close}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <p id="bug-feedback-description" className="bug-feedback-intro">
          {t.intro}
        </p>

        {diagnostics && (
          <section
            className="bug-feedback-diagnostics"
            aria-labelledby="bug-feedback-data-title"
          >
            <h3 id="bug-feedback-data-title">{t.dataTitle}</h3>
            <dl>
              <div>
                <dt>{t.user}</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>{t.tool}</dt>
                <dd>{diagnostics.selectedToolName || t.home}</dd>
              </div>
              <div>
                <dt>{t.status}</dt>
                <dd>{t.statuses[diagnostics.appStatus]}</dd>
              </div>
              <div>
                <dt>{t.input}</dt>
                <dd>
                  {diagnostics.inputSummary.hasInput
                    ? `${diagnostics.inputSummary.fileType || t.inputPresent}, ${formatFileSize(diagnostics.inputSummary.fileSize)}`
                    : t.none}
                </dd>
              </div>
              <div>
                <dt>{t.path}</dt>
                <dd>{diagnostics.pathname}</dd>
              </div>
              <div>
                <dt>{t.captured}</dt>
                <dd>{diagnostics.capturedAt}</dd>
              </div>
            </dl>
            <p>{t.privacy}</p>
          </section>
        )}

        {!submitted ? (
          <form onSubmit={submit}>
            <label htmlFor="bug-feedback-description-input">
              {t.descriptionLabel}
            </label>
            <textarea
              ref={descriptionRef}
              id="bug-feedback-description-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder={t.descriptionPlaceholder}
              rows={6}
              disabled={isSubmitting}
              required
            />
            <div className="bug-feedback-form-footer">
              <span>
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </span>
              <div className="bug-feedback-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeDialog}
                  disabled={isSubmitting}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t.submitting : t.submit}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div
            className="bug-feedback-success"
            role="status"
            aria-live="polite"
          >
            <strong>{t.success}</strong>
            {submission.taskUrl ? (
              <a href={submission.taskUrl} target="_blank" rel="noreferrer">
                {t.openTask}
              </a>
            ) : (
              <span>{t.taskCreated}</span>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={closeDialog}
            >
              {t.close}
            </button>
          </div>
        )}

        {submission.status === "error" && (
          <p className="bug-feedback-error" role="alert">
            {submission.message}
          </p>
        )}
      </div>
    </dialog>
  );
}
