"use client";

import type { ToolProps } from "../../types";
import { CoverSplitterMainInterface } from "./MainInterface";

export default function Tool(props: ToolProps) {
  return <CoverSplitterMainInterface {...props} />;
}
