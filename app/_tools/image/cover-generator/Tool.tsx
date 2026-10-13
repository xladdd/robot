"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import type { ToolProps } from "../../types";
import { createCoverArtboardPdf } from "./code/cover-artboard";
import { localizedCoverUi } from "./copy";
import {
  CoverGeneratorMainInterface,
  CoverLightbox,
  type CoverAudience,
  type CoverGeneration,
  type CoverModel,
  type CoverReference,
  type CoverStyleSelection,
  type CoverSubject,
  type CoverUsage,
} from "./MainInterface";
import type {
  CoverLightboxOverlay,
  CoverOverlayTone,
  CoverPlannerMetadata,
} from "./code/types";

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [coverReferences, setCoverReferences] = useState<CoverReference[]>([]);
  const [coverAudience, setCoverAudience] = useState<CoverAudience | "">("");
  const [coverStyle, setCoverStyle] =
    useState<CoverStyleSelection>("automatic");
  const [coverSubject, setCoverSubject] = useState<CoverSubject | "">("");
  const [coverCustomSubject, setCoverCustomSubject] = useState("");
  const [coverKeywords, setCoverKeywords] = useState("");
  const [coverSketches, setCoverSketches] = useState<CoverGeneration[]>([]);
  const [coverSelectedId, setCoverSelectedId] = useState<string | null>(null);
  const [coverPlanner, setCoverPlanner] = useState<CoverPlannerMetadata | null>(
    null,
  );
  const [coverModel, setCoverModel] = useState<CoverModel>(
    "black-forest-labs/flux.2-pro",
  );
  const [coverArtOnlyReferences, setCoverArtOnlyReferences] = useState(true);
  const [coverOverlayTone, setCoverOverlayTone] =
    useState<CoverOverlayTone>("black");
  const [coverOverlayChoices, setCoverOverlayChoices] = useState<
    Record<string, CoverLightboxOverlay>
  >({});
  const [coverGenerationCount, setCoverGenerationCount] = useState<1 | 2 | 4>(
    2,
  );
  const [coverError, setCoverError] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [zoomedCover, setZoomedCover] = useState<CoverGeneration | null>(null);
  const coverReferenceInputRef = useRef<HTMLInputElement>(null);
  const toolRootRef = useRef<HTMLDivElement>(null);
  const coverT = localizedCoverUi[language];

  useEffect(() => {
    onDiagnostics?.({
      appStatus: isGeneratingCover
        ? "running"
        : coverError
          ? "error"
          : coverSketches.length
            ? "completed"
            : "idle",
      progress: null,
      inputSummary: {
        hasInput: Boolean(
          coverAudience ||
          coverSubject ||
          coverKeywords ||
          coverReferences.length,
        ),
        fileType: null,
        fileSize: null,
        referenceCount: coverReferences.length,
        hasResult: coverSketches.some((item) => item.status !== "rejected"),
      },
    });
  }, [
    onDiagnostics,
    isGeneratingCover,
    coverError,
    coverSketches,
    coverAudience,
    coverSubject,
    coverKeywords,
    coverReferences.length,
  ]);

  useEffect(() => {
    if (!active || !zoomedCover) return;
    const move = (offset: number) => {
      const items = coverSketches.filter((item) => item.status !== "rejected");
      if (items.length < 2) return;
      const index = items.findIndex((item) => item.id === zoomedCover.id);
      setZoomedCover(
        items[(Math.max(0, index) + offset + items.length) % items.length],
      );
    };
    const handleCoverLightboxKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedCover(null);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    };
    window.addEventListener("keydown", handleCoverLightboxKey);
    return () => window.removeEventListener("keydown", handleCoverLightboxKey);
  }, [active, zoomedCover, coverSketches]);
  function coverFileToDataUrls(file: File) {
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!supportedTypes.includes(file.type))
      return Promise.reject(
        new Error(`${file.name}: use a PNG, JPEG, or WebP image.`),
      );
    if (file.size > 30_000_000)
      return Promise.reject(
        new Error(`${file.name}: the source image is larger than 30 MB.`),
      );
    return new Promise<{ data: string; artData: string }>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const render = (
          sourceY: number,
          sourceHeight: number,
          maxSide: number,
        ) =>
          new Promise<string>((renderResolve, renderReject) => {
            const scale = Math.min(
              1,
              maxSide / Math.max(image.naturalWidth, sourceHeight),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(sourceHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) {
              renderReject(
                new Error(
                  `${file.name}: the browser could not prepare this image.`,
                ),
              );
              return;
            }
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(
              image,
              0,
              sourceY,
              image.naturalWidth,
              sourceHeight,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  renderReject(
                    new Error(
                      `${file.name}: the browser could not compress this image.`,
                    ),
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => renderResolve(String(reader.result));
                reader.onerror = () =>
                  renderReject(
                    new Error(
                      `${file.name}: the compressed image could not be read.`,
                    ),
                  );
                reader.readAsDataURL(blob);
              },
              "image/jpeg",
              0.88,
            );
          });
        try {
          const cropY = Math.round(image.naturalHeight * 0.3);
          const cropHeight = Math.max(
            1,
            Math.round(image.naturalHeight * 0.56),
          );
          const [data, artData] = await Promise.all([
            render(0, image.naturalHeight, 1600),
            render(cropY, cropHeight, 1400),
          ]);
          resolve({ data, artData });
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`${file.name}: the image could not be decoded.`));
      };
      image.src = objectUrl;
    });
  }
  async function addCoverReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addCoverReferenceFiles(files);
  }

  async function addCoverReferenceFiles(files: File[]) {
    if (!active) return;
    try {
      const selectedFiles = files.slice(0, 3 - coverReferences.length);
      const additions = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          ...(await coverFileToDataUrls(file)),
        })),
      );
      setCoverReferences((current) => [...current, ...additions].slice(0, 3));
      setCoverError("");
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.referenceError,
      );
    }
  }
  async function generateCoverSketches(generationCount: 1 | 2 | 4) {
    if (
      !coverAudience ||
      !coverSubject ||
      (coverSubject === "other" && !coverCustomSubject.trim()) ||
      isGeneratingCover
    )
      return;
    if (
      coverSketches.filter((item) => item.status !== "rejected").length +
        generationCount >
      16
    ) {
      setCoverError(coverT.limit);
      return;
    }
    setCoverGenerationCount(generationCount);
    setIsGeneratingCover(true);
    setCoverError("");
    try {
      const preference = coverSelectedId
        ? coverSketches.find((item) => item.id === coverSelectedId)?.data
        : undefined;
      const response = await fetch("/api/covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "sketch",
          generationCount,
          audience: coverAudience,
          style: coverStyle,
          subject: coverSubject,
          customSubject: coverCustomSubject,
          keywords: coverKeywords,
          references: coverReferences.map((item) =>
            coverArtOnlyReferences ? item.artData : item.data,
          ),
          preference,
          model: coverModel,
        }),
      });
      const result = (await response.json()) as {
        images?: Array<{
          data: string;
          seed: number | null;
          model: string;
          direction?: string;
          concept: CoverGeneration["concept"];
          generationId?: string;
          usage: CoverUsage;
        }>;
        planner?: CoverPlannerMetadata;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !result.images?.length)
        throw new Error(result.error || coverT.sketchError);
      setCoverPlanner(result.planner || null);
      setCoverSketches((current) => [
        ...current,
        ...result.images!.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          status: "active" as const,
          createdAt: new Date().toISOString(),
        })),
      ]);
      if (result.warnings?.length) setCoverError(result.warnings.join(" · "));
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.generationError,
      );
    } finally {
      setIsGeneratingCover(false);
    }
  }

  function selectCoverSketch(id: string) {
    setCoverSelectedId((current) => (current === id ? null : id));
    setCoverSketches((current) => {
      const isSelected = current.some(
        (item) => item.id === id && item.status === "selected",
      );
      return current.map((item) =>
        item.id === id
          ? { ...item, status: isSelected ? "active" : "selected" }
          : item.status === "selected"
            ? { ...item, status: "active" }
            : item,
      );
    });
  }
  function rejectCoverSketch(id: string) {
    if (coverSelectedId === id) setCoverSelectedId(null);
    setCoverSketches((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "rejected" } : item,
      ),
    );
  }
  function moveZoomedCover(offset: number) {
    if (!zoomedCover) return;
    const items = coverSketches.filter((item) => item.status !== "rejected");
    if (items.length < 2) return;
    const index = items.findIndex((item) => item.id === zoomedCover.id);
    setZoomedCover(
      items[(Math.max(0, index) + offset + items.length) % items.length],
    );
  }

  function selectCoverOverlayTone(tone: CoverOverlayTone) {
    setCoverOverlayTone(tone);
    setCoverOverlayChoices({});
  }

  async function downloadCoverZip() {
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    const toBytes = async (dataUrl: string) =>
      new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const tasks = coverSketches.filter((item) => item.status !== "rejected");
    for (const [index, item] of tasks.entries())
      entries.push({
        name: `concepts/${item.status === "selected" ? "selected" : "alternatives"}/concept-${String(index + 1).padStart(2, "0")}.jpg`,
        data: await toBytes(item.data),
      });
    const plannerCost = coverPlanner?.usage.cost || 0;
    const knownTotal =
      plannerCost +
      tasks.reduce((sum, item) => sum + (item.usage.cost || 0), 0);
    const unknownCosts =
      tasks.filter((item) => item.usage.cost === null).length +
      (coverPlanner && coverPlanner.usage.cost === null ? 1 : 0);
    const report = [
      `# ${coverT.reportTitle}`,
      "",
      `- Exported: ${new Date().toISOString()}`,
      `- Audience: ${coverAudience}`,
      `- Visual treatment: ${coverStyle}`,
      `- Subject: ${coverSubject === "other" ? coverCustomSubject : coverSubject}`,
      `- Keywords: ${coverKeywords || "none"}`,
      `- Planner model: ${coverPlanner?.model || "not reported"}`,
      `- Artwork-only reference crops: ${coverArtOnlyReferences ? "yes" : "no"}`,
      `- Generation tasks: ${tasks.length}`,
      `- Total credits: ${knownTotal.toFixed(6)}${unknownCosts ? ` (${unknownCosts} task${unknownCosts === 1 ? "" : "s"} did not report a cost)` : ""}`,
      "",
      "## Generation tasks",
      "",
      `| # | Type | Model | Seed | Credits | OpenRouter generation |`,
      `|---:|---|---|---:|---:|---|`,
      `| — | planner | ${coverPlanner?.model || "not reported"} | — | ${coverPlanner?.usage.cost === null || coverPlanner?.usage.cost === undefined ? "not reported" : coverPlanner.usage.cost.toFixed(6)} | ${coverPlanner?.generationId || "not reported"} |`,
      ...tasks.map(
        (item, index) =>
          `| ${index + 1} | concept | ${item.model} | ${item.seed ?? "not supported"} | ${item.usage.cost === null ? "not reported" : item.usage.cost.toFixed(6)} | ${item.generationId || "not reported"} |`,
      ),
      "",
      "## Image prompts",
      "",
      ...tasks.flatMap((item, index) => [
        `### Concept ${index + 1}`,
        "",
        item.concept.prompt,
        "",
      ]),
      "> These images are text-free cover-art directions. Add typography and publisher elements later in InDesign.",
      "",
    ].join("\n");
    entries.push({
      name: "generation-report.md",
      data: new TextEncoder().encode(report),
    });
    entries.push({
      name: "project.json",
      data: new TextEncoder().encode(
        JSON.stringify(
          {
            project: "Taktik Robot",
            audience: coverAudience,
            style: coverStyle,
            subject: coverSubject,
            customSubject: coverCustomSubject,
            keywords: coverKeywords,
            references: coverReferences.map(({ name }) => name),
            artworkOnlyReferenceCrops: coverArtOnlyReferences,
            artboardOverlay: coverOverlayTone,
            selectedSketch: coverSelectedId,
            model: coverModel,
            planner: coverPlanner,
            sketches: coverSketches.map(
              ({
                id,
                seed,
                status,
                createdAt,
                model,
                direction,
                concept,
                generationId,
                usage,
              }) => ({
                id,
                seed,
                status,
                createdAt,
                model,
                direction,
                concept,
                generationId,
                usage,
              }),
            ),
            totalCredits: knownTotal,
            unknownCostTasks: unknownCosts,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ),
    });
    const url = URL.createObjectURL(
      new Blob([createZip(entries)], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "robot-cover-project.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCoverArtboard() {
    const active = coverSketches.filter((item) => item.status !== "rejected");
    const stage =
      toolRootRef.current?.querySelector<HTMLElement>(".cover-stage");
    if (!stage) return;
    const viewport = stage.getBoundingClientRect();
    const visibleIds = new Set(
      [...stage.querySelectorAll<HTMLElement>(".cover-card[data-cover-id]")]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.bottom > viewport.top &&
            bounds.top < viewport.bottom &&
            bounds.right > viewport.left &&
            bounds.left < viewport.right
          );
        })
        .map((element) => element.dataset.coverId),
    );
    const visible = active
      .map((item, index) => ({ item, number: index + 1 }))
      .filter(({ item }) => visibleIds.has(item.id))
      .slice(0, 12);
    if (!visible.length) {
      setCoverError(coverT.artboardError);
      return;
    }
    try {
      const pdf = await createCoverArtboardPdf(
        visible.map(({ item, number }) => ({
          number,
          data: item.data,
          overlay: coverOverlayChoices[item.id] ?? coverOverlayTone,
        })),
      );
      const url = URL.createObjectURL(
        new Blob([pdf], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "robot-cover-artboard.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.artboardError,
      );
    }
  }

  return (
    <div ref={toolRootRef}>
      <CoverGeneratorMainInterface
        language={language}
        active={active}
        inputRef={coverReferenceInputRef}
        references={coverReferences}
        audience={coverAudience}
        style={coverStyle}
        subject={coverSubject}
        customSubject={coverCustomSubject}
        keywords={coverKeywords}
        sketches={coverSketches}
        selectedId={coverSelectedId}
        model={coverModel}
        artOnlyReferences={coverArtOnlyReferences}
        overlayTone={coverOverlayTone}
        overlayChoices={coverOverlayChoices}
        generationCount={coverGenerationCount}
        error={coverError}
        isGenerating={isGeneratingCover}
        onReferenceInput={(event) => void addCoverReferences(event)}
        onAddReferenceFiles={(files) => void addCoverReferenceFiles(files)}
        onRemoveReference={(index) =>
          setCoverReferences((current) =>
            current.filter((_, itemIndex) => itemIndex !== index),
          )
        }
        onAudience={setCoverAudience}
        onStyle={setCoverStyle}
        onSubject={(value) => {
          setCoverSubject(value);
          if (value !== "other") setCoverCustomSubject("");
        }}
        onCustomSubject={setCoverCustomSubject}
        onKeywords={setCoverKeywords}
        onSelectSketch={selectCoverSketch}
        onRejectSketch={rejectCoverSketch}
        onZoom={setZoomedCover}
        onExportArtboard={() => void exportCoverArtboard()}
        onDownload={() => void downloadCoverZip()}
        onModel={setCoverModel}
        onArtOnlyReferences={setCoverArtOnlyReferences}
        onOverlayTone={selectCoverOverlayTone}
        onGenerateSketches={(count) => void generateCoverSketches(count)}
      />
      {active && zoomedCover && (
        <CoverLightbox
          language={language}
          cover={zoomedCover}
          overlay={coverOverlayChoices[zoomedCover.id] ?? coverOverlayTone}
          onOverlay={(overlay) =>
            setCoverOverlayChoices((current) => ({
              ...current,
              [zoomedCover.id]: overlay,
            }))
          }
          onMove={moveZoomedCover}
          onClose={() => setZoomedCover(null)}
        />
      )}
    </div>
  );
}

function createZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const write32 = (view: DataView, position: number, value: number) =>
    view.setUint32(position, value >>> 0, true);
  const write16 = (view: DataView, position: number, value: number) =>
    view.setUint16(position, value, true);
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    write32(view, 0, 0x04034b50);
    write16(view, 4, 20);
    write16(view, 8, 0);
    write32(view, 14, checksum);
    write32(view, 18, entry.data.length);
    write32(view, 22, entry.data.length);
    write16(view, 26, name.length);
    header.set(name, 30);
    chunks.push(header, entry.data);
    const record = new Uint8Array(46 + name.length);
    const recordView = new DataView(record.buffer);
    write32(recordView, 0, 0x02014b50);
    write16(recordView, 4, 20);
    write16(recordView, 6, 20);
    write16(recordView, 10, 0);
    write32(recordView, 16, checksum);
    write32(recordView, 20, entry.data.length);
    write32(recordView, 24, entry.data.length);
    write16(recordView, 28, name.length);
    write32(recordView, 42, offset);
    record.set(name, 46);
    central.push(record);
    offset += header.length + entry.data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  return new Blob(
    [...chunks, ...central, end].map((chunk) => chunk.slice().buffer),
  );
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
