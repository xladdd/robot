"use client";

import type { ToolProps } from "../../types";
import { ScriptBuffetMainInterface } from "./MainInterface";

export default function Tool(props: ToolProps) {
  return <ScriptBuffetMainInterface {...props} />;
}
