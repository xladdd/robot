"use client";

import { useEffect, useState } from "react";

export function LoadingText({ items }: { items: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const phraseTimer = window.setInterval(
      () => setIndex((value) => (value + 1) % items.length),
      3000,
    );
    return () => window.clearInterval(phraseTimer);
  }, [items.length]);

  return (
    <div className="loading-copy" role="status">
      <span>{items[index]}</span>
    </div>
  );
}
