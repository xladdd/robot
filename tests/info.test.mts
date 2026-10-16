import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { toolDefinitions } from "../app/_tools/generated/registry.data.ts";

const parser = unified().use(remarkParse);
const root = new URL("../app/_tools/", import.meta.url);
const headings = {
  en: ["What is this?", "How does it work?"],
  cs: ["Co to je?", "Jak to funguje?"],
};

for (const language of ["en", "cs"] as const) {
  test(`all ${language} drawer sources use exactly two sections and consistent prose formatting`, async () => {
    for (const folder of ["", ...toolDefinitions.map((tool) => tool.folder)]) {
      const path = `${folder ? `${folder}/` : ""}info.${language}.md`;
      const markdown = await readFile(new URL(path, root), "utf8");
      const tree = parser.parse(markdown);
      const sections = tree.children.filter((node) => node.type === "heading");
      assert.deepEqual(sections.map(toString), headings[language], path);
      assert.ok(
        sections.every((node) => node.depth === 3),
        path,
      );
      assert.equal(tree.children[0], sections[0], path);
      assert.ok(
        markdown
          .split(/^### .+$/m)
          .slice(1)
          .every((body) => body.trim()),
        path,
      );
      for (const node of tree.children) {
        assert.ok(
          node.type === "heading" || node.type === "paragraph",
          `${path}: unexpected ${node.type}`,
        );
        if (node.type === "paragraph") {
          assert.ok(
            node.children.every(
              (inline) =>
                inline.type === "text" || inline.type === "inlineCode",
            ),
            `${path}: body copy must use plain prose and inline code`,
          );
        }
      }
    }
  });
}
