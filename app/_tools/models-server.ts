import "server-only";
import type {
  ModelChoice,
  ModelStageDefinition,
  ResolvedModelStage,
} from "./models.ts";

export type ModelEnvironmentGetter = (name: string) => string | undefined;

/** Only this server module reads environment values. Tests can inject a getter. */
export function resolveModel(
  definition: ModelChoice,
  getEnvironment: ModelEnvironmentGetter = (name) => process.env[name],
): string {
  for (const name of definition.environmentPrecedence) {
    const configured = getEnvironment(name);
    const value = definition.trimEnvironmentValue
      ? configured?.trim()
      : configured;
    if (value) return value;
  }
  return definition.defaultModel;
}

export function resolveFailureFallbackModels(
  definition: ModelStageDefinition,
  getEnvironment: ModelEnvironmentGetter = (name) => process.env[name],
): string[] {
  const primary = resolveModel(definition, getEnvironment);
  return [
    ...new Set(
      definition.failureFallbackModels.map((fallback) =>
        resolveModel(fallback, getEnvironment),
      ),
    ),
  ].filter((model) => model !== primary);
}

export function resolveModelDefinitions(
  definitions: readonly ModelStageDefinition[],
  getEnvironment: ModelEnvironmentGetter = (name) => process.env[name],
): ResolvedModelStage[] {
  return definitions.map((stage) => ({
    ...stage,
    configuredModel: resolveModel(stage, getEnvironment),
    configuredFallbackModels: resolveFailureFallbackModels(
      stage,
      getEnvironment,
    ),
  }));
}
