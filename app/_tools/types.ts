import type { ManualContent } from "./design-manual/parse";
import type { FeedbackDiagnostics } from "../_feedback/types";

export type Language = "en" | "cs";
export type ToolDiagnostics = Pick<
  FeedbackDiagnostics,
  "appStatus" | "progress" | "inputSummary"
>;
export type ToolProps = {
  language: Language;
  active: boolean;
  section: string | null;
  label: string;
  onDiagnostics?: (summary: ToolDiagnostics) => void;
  manuals?: Record<Language, ManualContent>;
};

export type ToolManifest = {
  label: Record<Language, string>;
  status?: "tested" | "to-test" | "alpha";
  featureFlags?: Record<string, boolean>;
  openRouter?: { envName: string };
  routes?: Array<{
    path: string;
    handler: string;
    methods: Array<"GET" | "POST">;
    dynamic?: "force-dynamic" | "force-static" | "auto";
    runtime?: "nodejs" | "edge";
    revalidate?: number | false;
    maxDuration?: number;
  }>;
  assets?: Array<{ source: string; publicPath: string }>;
};
