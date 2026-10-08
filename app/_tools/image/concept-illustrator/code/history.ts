import type {
  ConceptSet,
  IllustrationProject,
  StyleProfile,
} from "./types";

const DATABASE_NAME = "robot-concept-illustrator";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const SETTINGS_STORE = "settings";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function emptyConcepts(): ConceptSet {
  return [0, 1, 2].map((index) => ({
    id: id(`concept-${index + 1}`),
    title: "",
    visual: "",
    meaning: "",
  })) as ConceptSet;
}

export function createEmptyProject(now = Date.now()): IllustrationProject {
  return {
    id: id("project"),
    article: "",
    concepts: emptyConcepts(),
    selectedConceptId: null,
    editedConcept: null,
    compiledPrompt: "",
    compiledPromptIsManual: false,
    compiledPromptStale: true,
    revisions: [],
    activeRevisionId: null,
    finalRevisionId: null,
    critique: null,
    feedback: "pending",
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultStyleProfile(now = Date.now()): StyleProfile {
  return {
    id: "house-style",
    styleGuidance: "",
    aspectRatio: "4:3",
    references: [],
    updatedAt: now,
  };
}

export function isMeaningfulProject(project: IllustrationProject) {
  return Boolean(
    project.article.trim() ||
      project.concepts.some(
        (concept) =>
          concept.title.trim() || concept.visual.trim() || concept.meaning.trim(),
      ) ||
      project.revisions.length ||
      project.note.trim() ||
      project.critique,
  );
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        const projects = database.createObjectStore(PROJECT_STORE, {
          keyPath: "id",
        });
        projects.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Could not open local memory."));
    request.onblocked = () =>
      reject(new Error("Local memory is blocked by another open tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Local memory request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Local memory transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Local memory transaction stopped."));
  });
}

export async function listProjects() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const projects = await requestResult(
      transaction.objectStore(PROJECT_STORE).getAll() as IDBRequest<
        IllustrationProject[]
      >,
    );
    await transactionDone(transaction);
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    database.close();
  }
}

export async function getProject(projectId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const project = await requestResult(
      transaction.objectStore(PROJECT_STORE).get(projectId) as IDBRequest<
        IllustrationProject | undefined
      >,
    );
    await transactionDone(transaction);
    return project || null;
  } finally {
    database.close();
  }
}

export async function saveProject(project: IllustrationProject) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(project);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteProject(projectId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(projectId);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getStyleProfile() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const profile = await requestResult(
      transaction.objectStore(SETTINGS_STORE).get("house-style") as IDBRequest<
        StyleProfile | undefined
      >,
    );
    await transactionDone(transaction);
    return profile || createDefaultStyleProfile();
  } finally {
    database.close();
  }
}

export async function saveStyleProfile(profile: StyleProfile) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put(profile);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export function projectTitle(project: IllustrationProject) {
  const firstLine = project.article
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  return firstLine.length > 54 ? `${firstLine.slice(0, 51)}…` : firstLine;
}

export function buildFeedbackContext(projects: IllustrationProject[]) {
  return projects
    .filter(
      (project) => project.feedback !== "pending" && project.note.trim(),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((project) => {
      const note = project.note.trim().replace(/\s+/g, " ").slice(0, 240);
      return `${project.feedback === "approved" ? "Approved" : "Rejected"}: ${note}`;
    })
    .join("\n")
    .slice(0, 1200);
}
