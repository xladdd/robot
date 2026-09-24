import assert from "node:assert/strict";
import test from "node:test";

const {
  buildTaskPayload,
  formatTaskNotes,
  validateFeedbackRequest,
} = await import("../app/_feedback/server.ts");

const diagnostics = {
  selectedTool: "graph",
  selectedToolName: "Graph Generator",
  language: "en",
  theme: "dark",
  sidebarOpen: true,
  infoOpen: false,
  pathname: "/",
  viewport: { width: 1440, height: 900 },
  userAgent: "Test browser",
  online: true,
  appStatus: "error",
  progress: null,
  inputSummary: {
    hasInput: true,
    fileType: "application/pdf",
    fileSize: 1234,
    referenceCount: 2,
    hasResult: false,
  },
  capturedAt: "2026-09-24T12:00:00.000Z",
};

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  projectGid: "project-gid",
  sectionGid: "section-gid",
  assigneeGid: "assignee-gid",
};

test("validates and preserves only the explicit feedback snapshot", () => {
  const value = validateFeedbackRequest({
    description: "The graph preview is blank.",
    diagnostics,
    username: "browser-supplied-user",
    uploadedPdf: "not allowed here",
  });

  assert.equal(value.description, "The graph preview is blank.");
  assert.deepEqual(value.diagnostics, diagnostics);
  assert.equal("username" in value, false);
  assert.equal("uploadedPdf" in value, false);
});

test("rejects a pathname containing query data", () => {
  assert.throws(
    () =>
      validateFeedbackRequest({
        description: "A report",
        diagnostics: { ...diagnostics, pathname: "/?secret=value" },
      }),
    /pathname has an invalid value/,
  );
});

test("rejects an empty or oversized description", () => {
  assert.throws(
    () => validateFeedbackRequest({ description: " ", diagnostics }),
    /description is required/,
  );
  assert.throws(
    () =>
      validateFeedbackRequest({
        description: "x".repeat(4001),
        diagnostics,
      }),
    /description is too long/,
  );
});

test("creates an Asana task payload for the configured section and assignee", () => {
  const payload = buildTaskPayload(
    "The graph preview is blank.",
    diagnostics,
    "Vlad Frolov",
    config,
    "2026-09-24T12:01:00.000Z",
  );

  assert.deepEqual(payload.data.assignee, "assignee-gid");
  assert.deepEqual(payload.data.projects, ["project-gid"]);
  assert.deepEqual(payload.data.memberships, [
    { project: "project-gid", section: "section-gid" },
  ]);
  assert.match(payload.data.name, /^\[Robot\] Graph Generator/);
  assert.match(payload.data.notes, /Robot user: Vlad Frolov/);
  assert.match(payload.data.notes, /The graph preview is blank\./);
});

test("formats diagnostics without adding secrets or uploaded content", () => {
  const notes = formatTaskNotes(
    "The graph preview is blank.",
    diagnostics,
    "Vlad Frolov",
    "2026-09-24T12:01:00.000Z",
  );

  assert.match(notes, /application\/pdf, 1234 bytes/);
  assert.match(notes, /References: 2/);
  assert.doesNotMatch(notes, /client-secret|refresh-token|uploadedPdf/);
});
