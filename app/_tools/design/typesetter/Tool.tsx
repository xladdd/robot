"use client";

import type { ToolProps } from "../../types";
import { TypesetterMainInterface } from "./MainInterface";

export default function Tool(props: ToolProps) {
  return <TypesetterMainInterface {...props} />;
}
