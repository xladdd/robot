import type { AseSwatch } from "./code/ase";
type FigureCheck = { level: "pass" | "warning"; message: string };

export function verificationMarkdown(report: string) {
    const data = JSON.parse(report) as {
      generatedAt?: string;
      generator?: string;
      model?: string;
      referenceCount?: number;
      palette?: AseSwatch[];
      spec?: {
        title?: string;
        date?: string;
        place?: string;
        sources?: Array<{ id: string; title: string; url: string }>;
        notes?: string[];
      };
      brief?: {
        title?: string;
        subtitle?: string;
        uncertainties?: string[];
      };
      reconstruction?: {
        uncertainties?: string[];
      };
      review?: {
        summary?: string;
        findings?: Array<{ message?: string }>;
      };
      usage?: Array<{
        generationId?: string | null;
        model?: string;
        cost?: number | null;
        promptTokens?: number | null;
        completionTokens?: number | null;
        totalTokens?: number | null;
      }>;
      checks?: FigureCheck[];
    };
    const lines = [
      `# ${data.spec?.title || data.brief?.title || "Verification report"}`,
      "",
      `- Generated: ${data.generatedAt || ""}`,
      `- Generator: ${data.generator || ""}`,
      `- Model: ${data.model || ""}`,
    ];
    if (data.spec?.place) lines.push(`- Place: ${data.spec.place}`);
    if (data.spec?.date) lines.push(`- Date or period: ${data.spec.date}`);
    if (typeof data.referenceCount === "number")
      lines.push(`- Reference images: ${data.referenceCount}`);
    if (data.usage?.length) {
      const totalCost = data.usage.reduce(
        (sum, item) => sum + (typeof item.cost === "number" ? item.cost : 0),
        0,
      );
      lines.push(`- OpenRouter calls: ${data.usage.length}`);
      if (totalCost > 0)
        lines.push(`- Reported OpenRouter cost: $${totalCost.toFixed(4)}`);
    }
    lines.push(
      "",
      "## Checks",
      "",
      ...(data.checks || []).map(
        ({ level, message }) =>
          `- ${level === "pass" ? "PASS" : "WARNING"}: ${message}`,
      ),
    );
    if (data.spec?.sources?.length)
      lines.push(
        "",
        "## Sources",
        "",
        ...data.spec.sources.map(
          ({ id, title, url }) => `- ${id}: [${title}](${url})`,
        ),
      );
    if (data.palette?.length)
      lines.push(
        "",
        "## Adobe palette",
        "",
        ...data.palette.map(
          ({ name, hex, model, values, group }) =>
            `- ${name}: ${hex} — ${model}${values?.length ? ` (${values.join(", ")})` : ""}${group ? ` — ${group}` : ""}`,
        ),
      );
    const uncertainties = [
      ...(data.spec?.notes || []),
      ...(data.brief?.uncertainties || []),
      ...(data.reconstruction?.uncertainties || []),
    ];
    if (uncertainties.length)
      lines.push(
        "",
        "## Notes and uncertainties",
        "",
        ...uncertainties.map((note) => `- ${note}`),
      );
    if (data.usage?.length)
      lines.push(
        "",
        "## OpenRouter provenance",
        "",
        ...data.usage.map(
          (item) =>
            `- ${item.model || "unknown model"}${item.generationId ? ` — ${item.generationId}` : ""}${typeof item.cost === "number" ? ` — $${item.cost.toFixed(4)}` : ""}`,
        ),
      );
    if (data.review?.summary || data.review?.findings?.length)
      lines.push(
        "",
        "## Automated review",
        "",
        ...(data.review.summary ? [data.review.summary] : []),
        ...(data.review.findings || [])
          .map((finding) => finding.message)
          .filter((message): message is string => Boolean(message))
          .map((message) => `- ${message}`),
      );
    return `${lines.join("\n")}\n`;
  }

