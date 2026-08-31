import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type ManualSourceBlock = {
  type: string;
  text?: string;
  images?: string[];
  style?: string;
  rows?: string[][];
};

export type ManualChapter = { title: string; blocks: ManualSourceBlock[] };
export type ManualContent = { chapters: ManualChapter[] };

function imageUrl(url: string) {
  const filename = url.split("/").pop();
  if (!filename) throw new Error(`Invalid Design Manual image path: ${url}`);
  return `/design-manual/media/${filename}`;
}

function listItemText(node: RootContent) {
  return toString(node).replace(/\n+/g, "\n").trim();
}

export function parseDesignManual(markdown: string): ManualContent {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const chapters: ManualChapter[] = [];
  let chapter: ManualChapter | null = null;
  let imageGroup: { images: string[]; captions: string[] } | null = null;

  const finishImageGroup = () => {
    if (!chapter || !imageGroup) return;
    chapter.blocks.push({ type: "images", images: imageGroup.images, text: "", style: "Normal" });
    chapter.blocks.push({ type: "caption", text: imageGroup.captions.join("\t") });
    imageGroup = null;
  };

  for (const node of tree.children) {
    if (node.type === "html" && node.value.trim() === "<!-- image-group -->") {
      imageGroup = { images: [], captions: [] };
      continue;
    }
    if (node.type === "html" && node.value.trim() === "<!-- /image-group -->") {
      finishImageGroup();
      continue;
    }
    if (node.type === "heading" && node.depth === 1) {
      finishImageGroup();
      chapter = { title: toString(node), blocks: [] };
      chapters.push(chapter);
      continue;
    }
    if (!chapter) throw new Error("Design Manual Markdown must begin with a level-one chapter heading.");

    if (imageGroup) {
      if (node.type === "paragraph") {
        for (const child of node.children) {
          if (child.type === "image") imageGroup.images.push(imageUrl(child.url));
        }
      } else if (node.type === "blockquote") {
        imageGroup.captions.push(toString(node).replace(/\n+/g, "\n").trim());
      }
      continue;
    }

    if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
      chapter.blocks.push({ type: node.depth === 2 ? "h2" : "h3", text: toString(node) });
    } else if (node.type === "list") {
      for (const item of node.children) chapter.blocks.push({ type: "bullet", text: listItemText(item) });
    } else if (node.type === "paragraph") {
      chapter.blocks.push({ type: "paragraph", text: toString(node) });
    }
  }
  finishImageGroup();

  return { chapters };
}

export async function loadDesignManual(language: "en" | "cs") {
  const path = join(process.cwd(), "app", "_tools", "design-manual", `manual.${language}.md`);
  return parseDesignManual(await readFile(path, "utf8"));
}
