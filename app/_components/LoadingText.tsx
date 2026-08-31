"use client";

import { useEffect, useState } from "react";

export function LoadingText({ items, compact = false }: { items: readonly string[]; compact?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const phraseTimer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 3000);
    return () => window.clearInterval(phraseTimer);
  }, [items.length]);

  return <div className={`loading-copy ${compact ? "compact" : ""}`} role="status"><span>{items[index]}</span></div>;
}
