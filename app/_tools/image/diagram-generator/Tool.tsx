"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { ToolProps } from "../../types";
import { DiagramMainInterface, type DiagramOutput, type DiagramReference } from "./MainInterface";
import { parseAse, type AseSwatch } from "./code/ase";
import { verificationMarkdown } from "./verification-markdown";

export default function Tool({ language, active, section, label, onDiagnostics }: ToolProps) {
  const [request, setRequest] = useState("");
  const [references, setReferences] = useState<DiagramReference[]>([]);
  const [palette, setPalette] = useState<AseSwatch[]>([]);
  const [paletteName, setPaletteName] = useState("");
  const [output, setOutput] = useState<DiagramOutput | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);

  async function addReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 3 - references.length);
    event.target.value = "";
    const valid = files.filter(file => ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 5_000_000);
    try {
      const added = await Promise.all(valid.map(async file => ({
        name: file.name,
        data: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
      })));
      setReferences(current => [...current, ...added].slice(0, 3));
    } catch (error) {
      setError(error instanceof Error ? error.message : language === "cs" ? "Obrázek se nepodařilo načíst." : "Could not read the image.");
    }
  }

  async function addPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.name.toLowerCase().endsWith(".ase") || file.size > 2_000_000) {
      setError(language === "cs" ? "Vyberte soubor Adobe Swatch Exchange (.ase) o velikosti nejvýše 2 MB." : "Choose an Adobe Swatch Exchange (.ase) file up to 2 MB.");
      return;
    }
    try {
      setPalette(parseAse(await file.arrayBuffer()));
      setPaletteName(file.name);
      setError("");
      setOutput(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : language === "cs" ? "Paletu ASE se nepodařilo načíst." : "Could not read the ASE palette.");
    }
  }

  async function generateLegacy() {
    if (pending.current || !request.trim()) return;
    pending.current = true;
    setIsGenerating(true);
    setError("");
    setOutput(null);
    try {
      const response = await fetch("/api/figures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, mode: "diagram", language, references: references.map(({ data }) => data), palette }),
      });
      const result = await response.json() as DiagramOutput & { error?: string };
      if (!response.ok) throw new Error(result.error || "Figure generation failed.");
      setOutput(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Figure generation failed.");
    } finally {
      pending.current = false;
      setIsGenerating(false);
    }
  }

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <DiagramMainInterface language={language} active={active} section={section} label={label}
    request={request} references={references} palette={palette} paletteName={paletteName}
    output={output} error={error} isGenerating={isGenerating}
    referenceInputRef={referenceInputRef} paletteInputRef={paletteInputRef}
    onPaletteInput={addPalette} onClearPalette={() => { setPalette([]); setPaletteName(""); }}
    onReferenceInput={addReferences} onRemoveReference={index => setReferences(current => current.filter((_, i) => i !== index))}
    onRequest={setRequest} onGenerate={generateLegacy} onDownload={download}
    onVerificationMarkdown={verificationMarkdown} onDiagnostics={onDiagnostics} />;
}
