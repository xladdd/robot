// Formats the Style Trainer's final review as an Asana task. The task asks a
// developer to add the reviewed style to the Image Generator presets; the
// notes therefore contain exactly the ready-to-paste preset entry and never
// reference images, generated images, credentials, or request bodies.

import type { AsanaConfig } from "../../../../_feedback/asana.ts";
import type { StyleSubmissionRequest } from "./validation.ts";

const PRESET_FILE = "app/_tools/image/image-generator/code/style-presets.ts";

export function styleTaskTitle(request: StyleSubmissionRequest) {
  const prefix = "[Robot] Style request — ";
  return `${prefix}${request.styleName.slice(0, Math.max(1, 100 - prefix.length))}`;
}

export function formatStyleTaskNotes(
  request: StyleSubmissionRequest,
  username: string,
  receivedAt: string,
) {
  const lines = [
    "Add this reviewed style to the Image Generator (Default and Advanced modes).",
    "",
    `Style name: ${request.styleName}`,
    `Style ID: ${request.styleId}`,
    `Pinned seed: ${request.seed}`,
    `Test prompt: ${request.testPrompt}`,
    `Refinement rounds: ${request.roundCount}`,
  ];
  if (request.notes) lines.push(`Notes: ${request.notes}`);
  lines.push(
    "",
    `Ready-to-paste preset (${PRESET_FILE}):`,
    "",
    "```",
    "  {",
    `    id: "${request.styleId}",`,
    `    prompt: ${JSON.stringify(request.stylePrompt)},`,
    `    seed: ${request.seed},`,
    "  },",
    "```",
    "",
    "The same string serves Default mode as a full medium instruction and",
    "Advanced mode as the style field, and the seed pins generation the same",
    "way the storybook presets do.",
    "",
    `Requested by: ${username} (Robot user)`,
    `Requested at: ${receivedAt}`,
  );
  return lines.join("\n");
}

export function buildStyleTaskPayload(
  request: StyleSubmissionRequest,
  username: string,
  config: AsanaConfig,
  receivedAt: string,
) {
  return {
    data: {
      name: styleTaskTitle(request),
      notes: formatStyleTaskNotes(request, username, receivedAt),
      assignee: config.assigneeGid,
      projects: [config.projectGid],
      memberships: [
        {
          project: config.projectGid,
          section: config.sectionGid,
        },
      ],
    },
  };
}
