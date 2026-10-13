"use client";

import type { ToolProps } from "../../types";
import { SolutionsImporterMainInterface } from "./MainInterface";

export default function Tool(props: ToolProps) {
  return <SolutionsImporterMainInterface {...props} />;
}
