"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { copy } from "../content/ui";
import { toolComponents } from "../_tools/generated/registry.client";
import { toolDefinitions } from "../_tools/generated/registry.data";
import type { AppId } from "../_tools/registry";
import type { ToolDiagnostics, ToolProps } from "../_tools/types";

type HostProps = Pick<ToolProps, "language"> & {
  selected: AppId | null;
  onDiagnostics: (id: AppId, summary: ToolDiagnostics) => void;
};

type SlotProps = Omit<HostProps, "selected"> & {
  id: AppId;
  active: boolean;
};

function ToolSlot({ id, active, language, onDiagnostics }: SlotProps) {
  const definition = toolDefinitions.find((tool) => tool.id === id)!;
  const Component = toolComponents[id];
  const report = useCallback(
    (summary: ToolDiagnostics) => onDiagnostics(id, summary),
    [id, onDiagnostics],
  );

  return (
    <div
      className="tool-slot"
      data-tool-id={id}
      data-tool-active={active}
      hidden={!active}
      inert={!active}
    >
      <Suspense
        fallback={
          <p className="tool-loading" role="status">
            {language === "cs" ? "Načítání nástroje…" : "Loading tool…"}
          </p>
        }
      >
        <Component
          language={language}
          active={active}
          section={copy[language][definition.category].toUpperCase()}
          label={definition.label[language]}
          onDiagnostics={report}
        />
      </Suspense>
    </div>
  );
}

/** Sidebar selection changes visibility, never the lifetime or key of a visited tool. */
export default function ToolHost({
  selected,
  language,
  onDiagnostics,
}: HostProps) {
  const [visited, setVisited] = useState<AppId[]>(selected ? [selected] : []);
  useEffect(() => {
    if (selected) {
      setVisited((current) =>
        current.includes(selected) ? current : [...current, selected],
      );
    }
  }, [selected]);
  const mounted =
    selected && !visited.includes(selected) ? [...visited, selected] : visited;

  return mounted.map((id) => (
    <ToolSlot
      key={id}
      id={id}
      active={id === selected}
      language={language}
      onDiagnostics={onDiagnostics}
    />
  ));
}
