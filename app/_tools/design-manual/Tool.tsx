"use client";

import { useState } from "react";
import { DesignManualLightbox, DesignManualMainInterface } from "./MainInterface";
import { copy } from "../../content/ui";
import type { ToolProps } from "../types";

export default function Tool({ language, active, manuals }: ToolProps) {
  const [chapter, setChapter] = useState(0);
  const [zoomed, setZoomed] = useState<{ src: string; caption: string } | null>(null);
  if (!manuals) return null;
  return <>
    <DesignManualMainInterface language={language} content={manuals[language]} chapterIndex={chapter} onChapter={setChapter} onZoom={setZoomed} />
    {active && zoomed && <DesignManualLightbox image={zoomed} closeLabel={copy[language].close} onClose={() => setZoomed(null)} />}
  </>;
}
