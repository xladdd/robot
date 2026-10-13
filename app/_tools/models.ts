export type ModelLanguage = "en" | "cs";
export type ModelText = Readonly<Record<ModelLanguage, string>>;

export type ModelChoice = {
  readonly defaultModel: string;
  /** First nonempty environment value wins; this is not a failure retry list. */
  readonly environmentPrecedence: readonly string[];
  /** OCR historically trims its override; other stages preserve existing || semantics. */
  readonly trimEnvironmentValue?: boolean;
};

export type ModelStageDefinition = ModelChoice & {
  readonly stageId: string;
  readonly label: ModelText;
  readonly failureFallbackModels: readonly ModelChoice[];
  readonly data?: ModelText;
  readonly providerNotes?: ModelText;
};

export type ResolvedModelStage = ModelStageDefinition & {
  readonly configuredModel: string;
  readonly configuredFallbackModels: readonly string[];
};

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function modelId(value: string): string {
  return `\`${cell(value).replace(/`/g, "")}\``;
}

/** Pure Markdown formatter. Resolve configuration on the server before calling it. */
export function buildModelMarkdown(
  definitions: readonly (ModelStageDefinition | ResolvedModelStage)[],
  language: ModelLanguage,
): string {
  if (!definitions.length) return "";
  const cs = language === "cs";
  const rows = definitions.map((stage) => {
    const configured =
      "configuredModel" in stage ? stage.configuredModel : stage.defaultModel;
    const fallbacks =
      "configuredFallbackModels" in stage
        ? stage.configuredFallbackModels
        : stage.failureFallbackModels.map((fallback) => fallback.defaultModel);
    return `- **${cell(stage.label[language])}** — ${cs ? "nakonfigurováno" : "configured"}: ${modelId(configured)}; ${cs ? "výchozí" : "default"}: ${modelId(stage.defaultModel)}; ${cs ? "záloha při selhání" : "failure fallback"}: ${fallbacks.map(modelId).join(", ") || "—"}.`;
  });
  const notes = definitions.flatMap((stage) => {
    const values = [
      stage.data?.[language],
      stage.providerNotes?.[language],
    ].filter(Boolean);
    return values.length
      ? [`- **${cell(stage.label[language])}:** ${values.join(" ")}`]
      : [];
  });
  return [
    `### ${cs ? "Modely a zpracování" : "Models and processing"}`,
    "",
    cs
      ? "Konfigurace serveru při načtení informací; konkrétní požadavek může použít zvolený model nebo záložní model. Nejde o záznam uskutečněného volání."
      : "Server configuration when this information is loaded; an individual request may use a selected model or a fallback. This is not a record of an executed call.",
    "",

    ...rows,
    ...(notes.length ? ["", ...notes] : []),
    "",
  ].join("\n");
}
