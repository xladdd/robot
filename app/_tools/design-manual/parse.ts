import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { List, ListItem, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type ManualInline = {
  text: string;
  kind: "text" | "strong" | "code" | "link";
  href?: string;
};

export type ManualList = {
  ordered: boolean;
  start: number;
  items: ManualListItem[];
};

export type ManualListItem = {
  text: string;
  inline: ManualInline[];
  children: ManualList[];
};

export type ManualTreeNode = {
  text: string;
  level: number;
  bold: boolean;
  children: ManualTreeNode[];
};

export type ManualSourceBlock = {
  type: string;
  text?: string;
  images?: string[];
  style?: string;
  rows?: string[][];
  tree?: ManualTreeNode[];
  list?: ManualList;
  inline?: ManualInline[];
};

export type ManualChapter = { title: string; blocks: ManualSourceBlock[] };
export type ManualContent = { chapters: ManualChapter[] };

function imageUrl(url: string) {
  const filename = url.split("/").pop();
  if (!filename) throw new Error(`Invalid Design Manual image path: ${url}`);
  return `/design-manual/media/${filename}`;
}

function listItemOwnText(item: ListItem) {
  return item.children
    .filter((child) => child.type !== "list")
    .map((child) => toString(child))
    .join("\n")
    .trim();
}

type InlineNode = {
  type: string;
  value?: string;
  url?: string;
  children?: InlineNode[];
};

function parseInline(
  nodes: InlineNode[],
  strong = false,
  href?: string,
): ManualInline[] {
  return nodes.flatMap((node) => {
    if (node.type === "text")
      return [
        {
          text: node.value || "",
          kind: href ? "link" : strong ? "strong" : "text",
          href,
        },
      ];
    if (node.type === "inlineCode")
      return [{ text: node.value || "", kind: "code" }];
    if (node.type === "break")
      return [
        { text: "\n", kind: href ? "link" : strong ? "strong" : "text", href },
      ];
    return node.children
      ? parseInline(
          node.children,
          strong || node.type === "strong",
          node.type === "link" ? node.url : href,
        )
      : [];
  });
}

function listItemInline(item: ListItem): ManualInline[] {
  return item.children
    .filter((child) => child.type === "paragraph")
    .flatMap((child) => parseInline(child.children as unknown as InlineNode[]));
}

function parseList(list: List): ManualList {
  return {
    ordered: Boolean(list.ordered),
    start: list.start ?? 1,
    items: list.children.map((item) => ({
      text: listItemOwnText(item),
      inline: listItemInline(item),
      children: item.children
        .filter((child): child is List => child.type === "list")
        .map(parseList),
    })),
  };
}

function parseTreeItems(list: List, level = 0): ManualTreeNode[] {
  return list.children.map((item) => {
    const nestedList = item.children.find(
      (child): child is List => child.type === "list",
    );
    const content = item.children.filter((child) => child.type !== "list");
    return {
      text: listItemOwnText(item),
      level,
      bold: content.some(
        (child) =>
          child.type === "paragraph" &&
          child.children.some((inline) => inline.type === "strong"),
      ),
      children: nestedList ? parseTreeItems(nestedList, level + 1) : [],
    };
  });
}

export function parseDesignManual(markdown: string): ManualContent {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const chapters: ManualChapter[] = [];
  let chapter: ManualChapter | null = null;
  let imageGroup: { images: string[]; captions: string[] } | null = null;
  let dropboxTree = false;

  const finishImageGroup = () => {
    if (!chapter || !imageGroup) return;
    chapter.blocks.push({
      type: "images",
      images: imageGroup.images,
      text: "",
      style: "Normal",
    });
    chapter.blocks.push({
      type: "caption",
      text: imageGroup.captions.join("\t"),
    });
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
    if (node.type === "html" && node.value.trim() === "<!-- dropbox-tree -->") {
      dropboxTree = true;
      continue;
    }
    if (
      node.type === "html" &&
      node.value.trim() === "<!-- /dropbox-tree -->"
    ) {
      dropboxTree = false;
      continue;
    }
    if (node.type === "heading" && node.depth === 1) {
      finishImageGroup();
      chapter = { title: toString(node), blocks: [] };
      chapters.push(chapter);
      continue;
    }
    if (!chapter)
      throw new Error(
        "Design Manual Markdown must begin with a level-one chapter heading.",
      );

    if (imageGroup) {
      if (node.type === "paragraph") {
        for (const child of node.children) {
          if (child.type === "image")
            imageGroup.images.push(imageUrl(child.url));
        }
      } else if (node.type === "blockquote") {
        imageGroup.captions.push(toString(node).replace(/\n+/g, "\n").trim());
      }
      continue;
    }
    if (dropboxTree) {
      if (node.type === "list")
        chapter.blocks.push({
          type: "dropbox-tree",
          tree: parseTreeItems(node),
        });
      continue;
    }

    if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
      chapter.blocks.push({
        type: node.depth === 2 ? "h2" : "h3",
        text: toString(node),
      });
    } else if (node.type === "list") {
      chapter.blocks.push({ type: "list", list: parseList(node) });
    } else if (node.type === "paragraph") {
      chapter.blocks.push({
        type: "paragraph",
        text: toString(node),
        inline: parseInline(node.children as unknown as InlineNode[]),
      });
    }
  }
  finishImageGroup();

  return { chapters };
}

export async function loadDesignManual(language: "en" | "cs") {
  const path = join(
    process.cwd(),
    "app",
    "_tools",
    "design-manual",
    `manual.${language}.md`,
  );
  return parseDesignManual(await readFile(path, "utf8"));
}
