"use client";

import type { ToolProps } from "../../types";
import { ImageGeneratorMainInterface } from "./MainInterface";

export default function Tool(props: ToolProps) {
  return <ImageGeneratorMainInterface {...props} />;
}
