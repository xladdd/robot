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

// Developer origin, not the inference provider's hosting location.
const modelOrigins: Readonly<Record<string, string>> = {
  anthropic: "🇺🇸",
  "black-forest-labs": "🇩🇪",
  "bytedance-seed": "🇨🇳",
  google: "🇺🇸",
  inclusionai: "🇨🇳",
  mistralai: "🇫🇷",
  "mistral-ocr": "🇫🇷",
  openai: "🇺🇸",
  qwen: "🇨🇳",
  // Tesseract.js wraps the engine originally developed in Bristol and Greeley.
  // https://github.com/tesseract-ocr/tesseract#brief-history
  "tesseract.js": "🇬🇧 🇺🇸",
};

function modelId(value: string): string {
  const developer = value.split("/")[0].trim().toLowerCase();
  const origin = Object.hasOwn(modelOrigins, developer)
    ? modelOrigins[developer]
    : undefined;
  // Leave unknown model origins unlabelled rather than guessing a country.
  return `\`${cell(value).replace(/`/g, "")}${origin ? ` ${origin}` : ""}\``;
}

/** Pure Markdown formatter. Resolve configuration on the server before calling it. */
export function buildModelMarkdown(
  definitions: readonly (ModelStageDefinition | ResolvedModelStage)[],
  language: ModelLanguage,
): string {
  if (!definitions.length) return "";
  const cs = language === "cs";
  const paragraphs = definitions.map((stage) => {
    const configured =
      "configuredModel" in stage ? stage.configuredModel : stage.defaultModel;
    const fallbacks =
      "configuredFallbackModels" in stage
        ? stage.configuredFallbackModels
        : stage.failureFallbackModels.map((fallback) => fallback.defaultModel);
    const defaultNote =
      configured !== stage.defaultModel
        ? ` (${cs ? "výchozí" : "default"}: ${modelId(stage.defaultModel)})`
        : "";
    return [
      `${cell(stage.label[language])}: ${modelId(configured)}${defaultNote}.`,
      ...(fallbacks.length
        ? [
            `${cs ? "Záloha při selhání" : "Failure fallback"}: ${fallbacks.map(modelId).join(", ")}.`,
          ]
        : []),
      stage.data?.[language],
      stage.providerNotes?.[language],
    ]
      .filter(Boolean)
      .join(" ");
  });
  return (
    [
      cs
        ? "Modely odpovídají konfiguraci serveru při načtení těchto informací. Konkrétní požadavek může použít zvolený nebo záložní model; nejde o záznam uskutečněného volání. Vlajky označují původ vývojáře modelu, nikoli místo zpracování dat."
        : "Models reflect the server configuration when this information is loaded. An individual request may use a selected model or a fallback; this is not a record of an executed call. Flags indicate the model developer’s origin, not where data is processed.",
      ...paragraphs,
    ].join("\n\n") + "\n"
  );
}
