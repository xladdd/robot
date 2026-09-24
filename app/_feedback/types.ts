export type FeedbackLanguage = "en" | "cs";
export type FeedbackTheme = "light" | "dark";
export type FeedbackAppStatus = "idle" | "running" | "completed" | "error";

export type FeedbackDiagnostics = {
  selectedTool: string | null;
  selectedToolName: string;
  language: FeedbackLanguage;
  theme: FeedbackTheme;
  sidebarOpen: boolean;
  infoOpen: boolean;
  pathname: string;
  viewport: {
    width: number;
    height: number;
  };
  userAgent: string;
  online: boolean;
  appStatus: FeedbackAppStatus;
  progress: number | null;
  inputSummary: {
    hasInput: boolean;
    fileType: string | null;
    fileSize: number | null;
    referenceCount: number;
    hasResult: boolean;
  };
  capturedAt: string;
};

export type FeedbackRequest = {
  description: string;
  diagnostics: FeedbackDiagnostics;
};

export type FeedbackResponse = {
  ok: true;
  taskUrl: string | null;
};
