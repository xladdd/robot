export const MAX_IMAGE_QUEUE = 15;
export const MAX_ADVANCED_SUBJECTS = 5;

export type AdvancedImageSubject = {
  description: string;
  position: string;
  action: string;
};

export type AdvancedImageFields = {
  scene: string;
  subjects: AdvancedImageSubject[];
  style: string;
  prompt: string;
  lighting: string;
  mood: string;
  background: string;
  composition: string;
  colorPalette: string;
  cameraAngle: string;
  cameraLens: string;
  cameraDepthOfField: string;
};

export function emptyAdvancedImageFields(): AdvancedImageFields {
  return {
    scene: "",
    subjects: [{ description: "", position: "", action: "" }],
    style: "",
    prompt: "",
    lighting: "",
    mood: "",
    background: "",
    composition: "",
    colorPalette: "",
    cameraAngle: "",
    cameraLens: "",
    cameraDepthOfField: "",
  };
}

function trimmed(value: string) {
  return value.trim();
}

export function buildAdvancedImagePrompt(fields: AdvancedImageFields) {
  const subjects = fields.subjects
    .map((subject) => {
      const entry: {
        description?: string;
        position?: string;
        action?: string;
      } = {};
      if (trimmed(subject.description))
        entry.description = trimmed(subject.description);
      if (trimmed(subject.position)) entry.position = trimmed(subject.position);
      if (trimmed(subject.action)) entry.action = trimmed(subject.action);
      return entry;
    })
    .filter((entry) => Object.keys(entry).length > 0);

  const camera: {
    angle?: string;
    lens?: string;
    depth_of_field?: string;
  } = {};
  if (trimmed(fields.cameraAngle)) camera.angle = trimmed(fields.cameraAngle);
  if (trimmed(fields.cameraLens)) camera.lens = trimmed(fields.cameraLens);
  if (trimmed(fields.cameraDepthOfField))
    camera.depth_of_field = trimmed(fields.cameraDepthOfField);

  const colorPalette = fields.colorPalette
    .split(",")
    .map(trimmed)
    .filter(Boolean);

  const structured: Record<string, unknown> = {};
  if (trimmed(fields.scene)) structured.scene = trimmed(fields.scene);
  if (subjects.length) structured.subjects = subjects;
  if (trimmed(fields.style)) structured.style = trimmed(fields.style);
  if (colorPalette.length) structured.color_palette = colorPalette;
  if (trimmed(fields.lighting)) structured.lighting = trimmed(fields.lighting);
  if (trimmed(fields.mood)) structured.mood = trimmed(fields.mood);
  if (trimmed(fields.background))
    structured.background = trimmed(fields.background);
  if (trimmed(fields.composition))
    structured.composition = trimmed(fields.composition);
  if (Object.keys(camera).length) structured.camera = camera;
  if (trimmed(fields.prompt)) structured.prompt = trimmed(fields.prompt);

  return JSON.stringify(structured, null, 2);
}

export function splitImagePrompts(value: string, limit = MAX_IMAGE_QUEUE) {
  return value
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[\t ]*\n+/)
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function findEndOfCentralDirectory(view: DataView) {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (
    let offset = view.byteLength - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readDocxEntry(buffer: ArrayBuffer, wantedName: string) {
  const view = new DataView(buffer);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0)
    throw new Error("This Word file is not a valid DOCX document.");

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(
      new Uint8Array(buffer, offset + 46, fileNameLength),
    );

    if (fileName === wantedName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50)
        throw new Error("This Word file has an invalid DOCX entry.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      if (compression === 0) return compressed;
      if (compression === 8) return inflateRaw(compressed);
      throw new Error(
        "This Word file uses an unsupported DOCX compression method.",
      );
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error("The Word file does not contain an editable document body.");
}

async function readDocx(file: File) {
  const xmlBytes = await readDocxEntry(
    await file.arrayBuffer(),
    "word/document.xml",
  );
  const documentXml = new DOMParser().parseFromString(
    new TextDecoder().decode(xmlBytes),
    "application/xml",
  );
  if (documentXml.querySelector("parsererror"))
    throw new Error("The Word document text could not be read.");

  const namespace =
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(
    documentXml.getElementsByTagNameNS(namespace, "p"),
  );
  return paragraphs
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS(namespace, "t"))
        .map((node) => node.textContent || "")
        .join(""),
    )
    .join("\n")
    .trim();
}

export async function readImagePromptFile(file: File) {
  const extension = file.name.toLocaleLowerCase("en-US").split(".").pop();
  if (extension === "docx") return readDocx(file);
  if (extension === "md" || extension === "markdown" || extension === "txt")
    return (await file.text()).replace(/^\uFEFF/, "").trim();
  if (extension === "doc")
    throw new Error(
      "Legacy .doc files are not supported. Save the file as .docx first.",
    );
  throw new Error("Use a Word (.docx), Markdown (.md), or text (.txt) file.");
}
