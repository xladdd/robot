import Image from "next/image";
import { type ChangeEvent, type DragEvent, type RefObject } from "react";
import {
  CrosshairInstruction,
  ToolMeta,
} from "../../../_components/ToolChrome";
import { layerSplitterUi } from "./copy";
import type { Language } from "../../registry";
import type { LayerSplitterQuality, LayerSplitterResult } from "./types";

export function LayerSplitterMainInterface({
  language,
  inputRef,
  imageData,
  imageName,
  quality,
  result,
  error,
  isSplitting,
  onFile,
  onRemove,
  onQuality,
  onSplit,
  onDownload,
}: {
  language: Language;
  inputRef: RefObject<HTMLInputElement | null>;
  imageData: string | null;
  imageName: string;
  quality: LayerSplitterQuality;
  result: LayerSplitterResult | null;
  error: string;
  isSplitting: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  onQuality: (quality: LayerSplitterQuality) => void;
  onSplit: () => void;
  onDownload: () => void;
}) {
  const t = layerSplitterUi[language];
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (isSplitting) return;
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file) onFile(file);
  };
  const consoleVisible =
    isSplitting || Boolean(result) || Boolean(imageData && error);
  const consoleState = error
    ? t.consoleFailed
    : result
      ? t.consoleReady
      : t.consoleRunning;

  return (
    <div className="compact-utility-module layer-splitter-module">
      <div className="compact-utility-content">
        <ToolMeta code={t.code} mode="ai" language={language} />
        <h1>{t.heading}</h1>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleInput}
          hidden
        />

        {imageData ? (
          <div
            className="layer-splitter-upload has-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <Image
              src={imageData}
              alt=""
              width={114}
              height={114}
              unoptimized
            />
            <div className="layer-splitter-file-copy">
              <span>{t.fileSelected}</span>
              <strong title={imageName}>{imageName}</strong>
            </div>
            <div className="layer-splitter-file-actions">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isSplitting}
              >
                {t.change}
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={isSplitting}
                aria-label={`${t.remove} ${imageName}`}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="layer-splitter-upload"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <CrosshairInstruction>{t.dropFile}</CrosshairInstruction>
          </button>
        )}

        <label className="layer-splitter-selector">
          <span>{t.quality}</span>
          <select
            value={quality}
            onChange={(event) =>
              onQuality(event.target.value as LayerSplitterQuality)
            }
            disabled={isSplitting}
          >
            <option value="fidelity">{t.qualityFidelity}</option>
            <option value="fast">{t.qualityFast}</option>
          </select>
        </label>

        {error && (
          <p className="extraction-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="layer-splitter-start action-button action-button-primary"
          onClick={onSplit}
          disabled={!imageData || isSplitting}
        >
          <span>{isSplitting ? t.splitting : t.split}</span>
          <b aria-hidden="true">{isSplitting ? "…" : "→"}</b>
        </button>

        {consoleVisible && (
          <section
            className={`layer-splitter-console ${result ? "is-ready" : ""} ${error ? "has-error" : ""}`}
            aria-label={t.console}
          >
            <header>
              <span>{t.console}</span>
              <b>{consoleState}</b>
            </header>
            <div aria-live="polite">
              {imageData && (
                <p>
                  <i aria-hidden="true">›</i>
                  {t.consoleAccepted.replace("{name}", imageName)}
                </p>
              )}
              {isSplitting && (
                <p>
                  <i aria-hidden="true">›</i>
                  {t.consoleWorking}
                </p>
              )}
              {result && (
                <>
                  <p>
                    <i aria-hidden="true">›</i>
                    {t.consoleComplete.replace(
                      "{count}",
                      String(result.layerNames.length),
                    )}
                  </p>
                  <p>
                    <i aria-hidden="true">›</i>
                    {t.consoleValidated
                      .replace(
                        "{valid}",
                        String(result.validation.validObjectLayers),
                      )
                      .replace(
                        "{requested}",
                        String(result.validation.requestedObjectLayers),
                      )}
                  </p>
                  {result.validation.warnings.map((warning) => (
                    <p className="is-warning" key={warning}>
                      <i aria-hidden="true">!</i>
                      {warning}
                    </p>
                  ))}
                </>
              )}
              {imageData && error && (
                <p className="is-error">
                  <i aria-hidden="true">!</i>
                  {t.consoleStopped}
                </p>
              )}
            </div>
          </section>
        )}

        {result && (
          <button
            type="button"
            className="layer-splitter-download action-button action-button-success"
            onClick={onDownload}
          >
            <span>{t.download}</span>
            <b aria-hidden="true">↓</b>
          </button>
        )}
      </div>
    </div>
  );
}
