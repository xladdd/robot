import type {
  BiologicalBriefV1,
  DiagramCheck,
  DiagramReview,
  DiagramUsage,
  ReferenceSelection,
  VectorReconstructionV1,
} from "./contracts.ts";

export function createPipelineReport(input: {
  brief: BiologicalBriefV1;
  reference: ReferenceSelection;
  reconstruction: VectorReconstructionV1;
  checks: DiagramCheck[];
  model: string;
  candidateModel: string;
  referenceCount: number;
  usage: DiagramUsage[];
  review: DiagramReview | null;
}) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generator: "Taktik Robot Semantic Vector Diagram Generator",
      workflow: [
        "biological brief",
        "reviewed composition reference selection",
        "OpenRouter image candidate",
        "semantic vector reconstruction",
        "server sanitization and editability checks",
        "post-reconstruction labels and review",
      ],
      model: input.model,
      candidateModel: input.candidateModel,
      referenceCount: input.referenceCount,
      reference: input.reference,
      brief: input.brief,
      reconstruction: {
        canvas: input.reconstruction.canvas,
        objects: input.reconstruction.objects,
        uncertainties: input.reconstruction.uncertainties,
      },
      usage: input.usage,
      review: input.review,
      checks: input.checks,
      editorialWarning:
        "Automated checks are not expert biological verification. Review the artwork, labels, and source rights before publication.",
    },
    null,
    2,
  );
}
