"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type RefObject,
  useRef,
  useState,
} from "react";
import { LoadingText } from "../../../_components/LoadingText";
import {
  CrosshairInstruction,
  ToolHeader,
} from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
import { tableFileToMarkdown } from "./code/data-import";
import { graphProcessing, graphUi } from "./copy";

export type GraphOutput = {
  svg: string;
  spec: {
    title: string;
    sources?: Array<{ id: string; title: string; url: string }>;
  };
};

export function GraphMainInterface({
  language,
  section,
  label,
  prompt,
  data,
  palette,
  paletteName,
  showValueLabels,
  output,
  error,
  isGenerating,

  paletteInputRef,
  onPaletteInput,
  onClearPalette,
  onShowValueLabels,
  onPrompt,
  onData,
  onGenerate,
  onDownload,
}: {
  language: Language;
  section: string | null;
  label: string | null;
  prompt: string;
  data: string;
  palette: AseSwatch[];
  paletteName: string;
  showValueLabels: boolean;
  output: GraphOutput | null;
  error: string;
  isGenerating: boolean;

  paletteInputRef: RefObject<HTMLInputElement | null>;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearPalette: () => void;
  onShowValueLabels: (show: boolean) => void;
  onPrompt: (prompt: string) => void;
  onData: (data: string) => void;
  onGenerate: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
}) {
  const t = graphUi[language];
  const dataInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [isDraggingData, setIsDraggingData] = useState(false);
  const example = {
    prompt:
      "Create a climograph showing monthly temperature and precipitation for a fictional Mediterranean city.\n\nUse exactly the data in the Data field.\n\nPlace January through December on the x-axis.\nShow precipitation as vertical bars using the left y-axis, ranging from 0 to 100 mm.\nShow temperature as a line with circular data markers using the right y-axis, ranging from 0 to 35 °C.\nInclude labels for both y-axes, horizontal gridlines, and a legend distinguishing precipitation from temperature.",
    data: [
      "| Month | Temperature °C | Precipitation mm |",
      "| --- | --- | --- |",
      "| January | 9 | 82 |",
      "| February | 10 | 68 |",
      "| March | 13 | 57 |",
      "| April | 16 | 48 |",
      "| May | 21 | 32 |",
      "| June | 26 | 15 |",
      "| July | 29 | 5 |",
      "| August | 29 | 8 |",
      "| September | 25 | 28 |",
      "| October | 19 | 61 |",
      "| November | 14 | 79 |",
      "| December | 10 | 91 |",
    ].join("\n"),
  };

  async function importDataFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10_000_000) {
      setFileError(t.dataFileSizeError);
      return;
    }
    try {
      onData(await tableFileToMarkdown(file));
      setFileError("");
    } catch {
      setFileError(t.dataFileError);
    }
  }

  function handleDataDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDraggingData(false);
    void importDataFile(event.dataTransfer.files[0]);
  }

  function downloadSvg() {
    if (!output) return;
    const filename = `${
      output.spec.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "figure"
    }.svg`;
    onDownload(output.svg, filename, "image/svg+xml");
  }

  return (
    <div className="cover-module visual-single-module graph-module">
      <section className="cover-stage visual-single-stage graph-stage">
        <ToolHeader
          className="cover-stage-head graph-stage-head"
          code={`${section} / CHART`}
          title={label || "Graph Generator"}
          mode="ai"
          language={language}
        />
        <section className="figure-result graph-result">
          <div className="pane-label">
            <span>{t.preview}</span>
            <span>1000 × 700 / SVG 1.1</span>
          </div>
          <div className="figure-paper">
            {isGenerating ? (
              <LoadingText items={graphProcessing[language]} />
            ) : output ? (
              <div dangerouslySetInnerHTML={{ __html: output.svg }} />
            ) : (
              <CrosshairInstruction>{t.empty}</CrosshairInstruction>
            )}
          </div>
        </section>
      </section>
      <aside className="cover-toolbar editor-sidebar visual-single-toolbar graph-toolbar">
        <section className="cover-control">
          <div className="figure-label-row">
            <label htmlFor="graph-prompt">{t.promptLabel}</label>
            <button
              type="button"
              onClick={() => {
                onPrompt(example.prompt);
                onData(example.data);
                setFileError("");
              }}
            >
              {t.example}
            </button>
          </div>
          <textarea
            className="graph-prompt"
            id="graph-prompt"
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            placeholder={t.promptPlaceholder}
            rows={6}
            disabled={isGenerating}
          />
        </section>
        <section className="cover-control">
          <div className="figure-label-row graph-data-label">
            <label htmlFor="graph-data">{t.dataLabel}</label>
            <button
              type="button"
              onClick={() => dataInputRef.current?.click()}
              disabled={isGenerating}
            >
              {t.importData}
            </button>
          </div>
          <input
            ref={dataInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              void importDataFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            hidden
          />
          <textarea
            className={`graph-data${isDraggingData ? " is-dragging" : ""}`}
            id="graph-data"
            value={data}
            onChange={(event) => {
              onData(event.target.value);
              setFileError("");
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingData(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDraggingData(false)}
            onDrop={handleDataDrop}
            placeholder={t.dataPlaceholder}
            wrap="off"
            rows={8}
            disabled={isGenerating}
          />
          <small className="graph-data-help">{t.dataHelp}</small>
        </section>
        <section className="cover-control">
          <div className="figure-palette">
            <span>{t.palette}</span>
            <input
              ref={paletteInputRef}
              type="file"
              accept=".ase,application/octet-stream"
              onChange={onPaletteInput}
              hidden
            />
            {palette.length ? (
              <>
                <div className="figure-palette-head">
                  <b>{paletteName}</b>
                  <button type="button" onClick={onClearPalette}>
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
                onClick={() => paletteInputRef.current?.click()}
              >
                <b>＋</b>
                {t.addPalette}
              </button>
            )}
          </div>
        </section>
        <section className="cover-control">
          <label className="graph-value-labels">
            <input
              type="checkbox"
              checked={showValueLabels}
              onChange={(event) => onShowValueLabels(event.target.checked)}
              disabled={isGenerating}
            />
            <span>
              <b>{t.valueLabels}</b>
              <small>{t.valueLabelsHelp}</small>
            </span>
          </label>
        </section>
        {(fileError || error) && (
          <p className="extraction-error" role="alert">
            {fileError || error}
          </p>
        )}
        <button
          className="cover-generate graph-generate action-button action-button-primary"
          onClick={onGenerate}
          disabled={!prompt.trim() || !data.trim() || isGenerating}
        >
          <span>{isGenerating ? t.generating : t.generate}</span>
          <b>{isGenerating ? "…" : "→"}</b>
        </button>
        {output && (
          <div className="cover-export-actions cover-toolbar-exports">
            <button
              className="cover-export action-button action-button-success"
              type="button"
              onClick={downloadSvg}
            >
              {t.downloadSvg}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
