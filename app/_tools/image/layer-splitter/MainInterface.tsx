import Image from "next/image";
import {
  type ChangeEvent,
  type DragEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";
import {
  CrosshairInstruction,
  ToolMeta,
} from "../../../_components/ToolChrome";
import { layerSplitterUi } from "./copy";
import type { Language } from "../../registry";
import type { LayerSplitterQuality, LayerSplitterResult } from "./types";

const ESTIMATED_SECONDS: Record<LayerSplitterQuality, number> = {
  fast: 90,
  fidelity: 240,
};

function formatCountdown(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

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
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  useEffect(() => {
    if (!isSplitting) return;
    const interval = window.setInterval(
      () => setRemainingSeconds((seconds) => seconds - 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [isSplitting]);
  const handleSplit = () => {
    setRemainingSeconds(ESTIMATED_SECONDS[quality]);
    onSplit();
  };
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

  return (
    <div className="compact-utility-module layer-splitter-module">
      <div className="compact-utility-content">
        <ToolMeta mode="ai" language={language} />
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
          onClick={handleSplit}
          disabled={!imageData || isSplitting}
        >
          <span>{isSplitting ? t.splitting : t.split}</span>
          <b
            className={isSplitting ? "layer-splitter-countdown" : undefined}
            aria-hidden="true"
          >
            {isSplitting ? formatCountdown(remainingSeconds) : "→"}
          </b>
        </button>
        {isSplitting && (
          <p className="layer-splitter-active-note">{t.keepOnscreen}</p>
        )}

        {Boolean(result?.validation.warnings.length) && (
          <section
            aria-label={
              language === "cs" ? "Upozornění kontroly" : "Validation warnings"
            }
          >
            <h2>
              {language === "cs"
                ? "Upozornění kontroly"
                : "Validation warnings"}
            </h2>
            <ul>
              {result!.validation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
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
