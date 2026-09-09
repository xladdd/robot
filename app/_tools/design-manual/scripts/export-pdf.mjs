import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toString } from "mdast-util-to-string";
import PDFDocument from "pdfkit";
import remarkParse from "remark-parse";
import { unified } from "unified";

const manualDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(manualDirectory, "public");
const logoPath = join(
  manualDirectory,
  "..",
  "..",
  "..",
  "public",
  "robot-logo.svg",
);
const requestedLanguages = process.argv.slice(2);
const languages = requestedLanguages.length ? requestedLanguages : ["en", "cs"];
const pageInset = 58;
const headerLineY = 47;
const contentStartY = 70;
const footerLineOffset = 47;
const contentBottomOffset = 64;
const sectionHeadingKeepWithListHeight = 92;
const pageHeader = "TAKTIK / GRAFICKÝ MANUÁL";

for (const language of languages) {
  if (language !== "en" && language !== "cs") {
    throw new Error(`Unknown language "${language}". Use en or cs.`);
  }
}

await mkdir(outputDirectory, { recursive: true });
for (const language of languages) await exportManual(language);

async function exportManual(language) {
  const [manual, changelog, logoSvg] = await Promise.all([
    readFile(join(manualDirectory, `manual.${language}.md`), "utf8"),
    readFile(join(manualDirectory, "changelog.md"), "utf8"),
    readFile(logoPath, "utf8"),
  ]);
  const output = join(outputDirectory, `design-manual.${language}.pdf`);
  const document = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Title: language === "cs" ? "Grafický manuál" : "Design Manual",
      Author: "Taktik",
      Subject: "Design and publishing instructions",
    },
    margins: {
      top: contentStartY,
      right: pageInset,
      bottom: contentBottomOffset,
      left: pageInset,
    },
    size: "A4",
  });
  document.registerFont(
    "Body",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
  );
  document.registerFont(
    "Bold",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
  );
  document.registerFont(
    "Mono",
    join(manualDirectory, "..", "..", "fonts", "IBMPlexMono-Regular.ttf"),
  );
  document.registerFont(
    "Emoji",
    join(manualDirectory, "..", "..", "fonts", "NotoEmoji-Regular.ttf"),
  );

  const finished = new Promise((resolveFinished, rejectFinished) => {
    const stream = createWriteStream(output);
    stream.on("finish", resolveFinished);
    stream.on("error", rejectFinished);
    document.pipe(stream);
  });

  const version = latestVersion(changelog);
  const logo = parseLogo(logoSvg);
  addCover(document, language, version, logo);
  renderMarkdown(document, manual, language, false);
  renderMarkdown(document, changelog, language, true);
  addPageFurniture(document, version);
  document.end();
  await finished;
  console.log(`Wrote ${output}`);
}

function contentBottom(document) {
  return document.page.height - contentBottomOffset;
}

function addPage(document) {
  document.addPage();
  document.fillColor("#1a1a1a");
  document
    .font("Body")
    .fontSize(7)
    .fillColor("#00a5a0")
    .text(pageHeader, pageInset, 30, {
      characterSpacing: 1.2,
    });
  document
    .moveTo(pageInset, headerLineY)
    .lineTo(document.page.width - pageInset, headerLineY)
    .lineWidth(0.6)
    .stroke("#999999");
  document.x = pageInset;
  document.y = contentStartY;
}

function latestVersion(changelog) {
  const versions = [
    ...changelog.matchAll(
      /^###\s+(v\d+(?:\.\d+)*\s+\d{4}-\d{1,2}-\d{1,2})\s*$/gm,
    ),
  ];
  return versions.at(-1)?.[1] || "";
}

function parseLogo(svg) {
  const viewBox = svg
    .match(/viewBox="([^"]+)"/)?.[1]
    .split(/\s+/)
    .map(Number);
  const fill = svg.match(/\.st1\s*\{[^}]*fill:\s*([^;]+);/s)?.[1].trim();
  const rectangles = [
    ...svg.matchAll(/<rect\b[^>]*\bclass="st1"[^>]*\/>/g),
  ].map((element) => {
    const attributes = Object.fromEntries(
      [...element[0].matchAll(/(\w+)="([^"]+)"/g)].map(([, name, value]) => [
        name,
        value,
      ]),
    );
    return {
      x: Number(attributes.x || 0),
      y: Number(attributes.y || 0),
      width: Number(attributes.width),
      height: Number(attributes.height),
    };
  });
  if (!viewBox || viewBox.length !== 4 || !fill || !rectangles.length)
    throw new Error(`Could not parse logo at ${logoPath}.`);
  return { width: viewBox[2], height: viewBox[3], fill, rectangles };
}

function drawLogo(document, logo, x, y, width) {
  const scale = width / logo.width;
  document.save().fillColor(logo.fill);
  for (const rectangle of logo.rectangles)
    document
      .rect(
        x + rectangle.x * scale,
        y + rectangle.y * scale,
        rectangle.width * scale,
        rectangle.height * scale,
      )
      .fill();
  document.restore();
}

function addCover(document, language, version, logo) {
  document.addPage();
  drawLogo(document, logo, pageInset, 72, 48);
  document
    .font("Body")
    .fontSize(8)
    .fillColor("#00a5a0")
    .text("TAKTIK / REFERENCE", pageInset, 186, { characterSpacing: 1.4 });
  document
    .font("Body")
    .fontSize(42)
    .fillColor("#1a1a1a")
    .text(
      language === "cs" ? "Grafický\nmanuál" : "Design\nManual",
      pageInset,
      212,
      { lineGap: 2 },
    );
  document
    .font("Body")
    .fontSize(10)
    .fillColor("#666666")
    .text(
      language === "cs"
        ? "Pravidla pro grafiky a redaktory"
        : "Working guidance for designers and editors",
      pageInset,
      340,
    );
  document
    .rect(
      pageInset,
      document.page.height - 90,
      document.page.width - pageInset * 2,
      18,
    )
    .fill("#ff661a");
  if (version) {
    const bottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document
      .font("Bold")
      .fontSize(9)
      .fillColor("#ff661a")
      .text(version, pageInset, document.page.height - 57, {
        characterSpacing: 0.3,
      });
    document.page.margins.bottom = bottomMargin;
  }
}

function renderMarkdown(document, markdown, language, appendix) {
  const tree = unified().use(remarkParse).parse(markdown);
  let hasContentPage = false;
  let imageGroup = null;
  let dropboxTree = false;

  const flushImageGroup = () => {
    if (!imageGroup?.images.length) return;
    renderImageGroup(document, imageGroup.images, imageGroup.captions);
    imageGroup = null;
  };

  for (const [nodeIndex, node] of tree.children.entries()) {
    if (node.type === "html") {
      if (node.value.trim() === "<!-- image-group -->")
        imageGroup = { images: [], captions: [] };
      else if (node.value.trim() === "<!-- /image-group -->") flushImageGroup();
      else if (node.value.trim() === "<!-- dropbox-tree -->")
        dropboxTree = true;
      else if (node.value.trim() === "<!-- /dropbox-tree -->")
        dropboxTree = false;
      continue;
    }
    if (imageGroup) {
      if (node.type === "paragraph") {
        for (const child of node.children)
          if (child.type === "image") imageGroup.images.push(child.url);
      } else if (node.type === "blockquote") {
        imageGroup.captions.push(toString(node).trim());
      }
      continue;
    }
    if (dropboxTree) {
      if (node.type === "list")
        renderDropboxTree(document, flattenTree(parseTreeItems(node)));
      continue;
    }
    if (node.type === "heading" && node.depth === 1) {
      const title = appendix
        ? language === "cs"
          ? "Historie verzí"
          : "Version history"
        : toString(node).trim();
      if (!title) continue;
      if (!appendix) {
        addPage(document);
        hasContentPage = true;
      } else if (!hasContentPage) {
        addPage(document);
        hasContentPage = true;
      }
      renderChapterHeading(document, title);
      continue;
    }
    if (!hasContentPage) continue;

    if (node.type === "heading")
      renderSectionHeading(
        document,
        node,
        tree.children[nodeIndex + 1]?.type === "list" &&
          listLineCount(tree.children[nodeIndex + 1]) > 2,
      );
    else if (node.type === "list") renderList(document, node);
    else if (node.type === "paragraph") {
      if (!toString(node).trim()) continue;
      ensureSpace(document, 46);
      document.fontSize(8.6).fillColor("#1a1a1a");
      renderInlineText(document, node.children, pageInset, document.y, {
        width: document.page.width - pageInset * 2,
        lineGap: 2.1,
      });
      document.moveDown(0.7);
    } else if (node.type === "blockquote") {
      const text = toString(node).trim();
      if (!text) continue;
      ensureSpace(document, 38);
      document
        .font("Body")
        .fontSize(7)
        .fillColor("#666666")
        .text(text, pageInset + 18, document.y, {
          width: document.page.width - pageInset * 2 - 36,
          align: "center",
          lineGap: 2,
        });
      document.moveDown(0.8);
    }
  }
  flushImageGroup();
}

function renderChapterHeading(document, title) {
  ensureSpace(document, 70);
  document
    .font("Body")
    .fontSize(31)
    .fillColor("#1a1a1a")
    .text(title, { lineGap: 3 });
  document.moveDown(0.55);
}

function renderSectionHeading(document, node, followedByList) {
  ensureSpace(document, followedByList ? sectionHeadingKeepWithListHeight : 60);
  const isH2 = node.depth === 2;
  document.moveDown(isH2 ? 0.45 : 0.15);
  const headingX = pageInset;
  document
    .font(isH2 ? "Body" : "Bold")
    .fontSize(isH2 ? 17 : 11)
    .fillColor(isH2 ? "#ff661a" : "#00a5a0")
    .text(toString(node), headingX, document.y, {
      width: document.page.width - pageInset - headingX,
      lineGap: 2,
    });
  document.moveDown(0.28);
}

function listLineCount(list, level = 0) {
  const charactersPerLine = Math.max(50, 100 - level * 15);
  return list.children.reduce((count, item) => {
    const lines = Math.max(
      1,
      Math.ceil(listItemText(item).length / charactersPerLine),
    );
    const nestedLines = item.children
      .filter((child) => child.type === "list")
      .reduce((total, child) => total + listLineCount(child, level + 1), 0);
    return count + lines + nestedLines;
  }, 0);
}

function listItemOwnChildren(item) {
  return item.children.filter((child) => child.type !== "list");
}

function listItemText(item) {
  return listItemOwnChildren(item)
    .map((child) => toString(child))
    .join(" ")
    .replace(/\n+/g, " ")
    .trim();
}

function parseTreeItems(list, level = 0) {
  return list.children.map((item) => {
    const nestedList = item.children.find((child) => child.type === "list");
    const content = listItemOwnChildren(item);
    return {
      text: listItemText(item),
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

function flattenTree(nodes) {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function renderList(document, node, level = 0) {
  const indent = level * 18;
  const start = node.start ?? 1;
  node.children.forEach((item, index) => {
    const children = listItemOwnChildren(item);
    if (!listItemText(item)) return;
    ensureSpace(document, 38);
    const textX = pageInset + indent + 18;
    const textWidth = document.page.width - pageInset * 2 - indent - 18;
    const y = document.y;
    if (node.ordered) {
      document
        .font("Bold")
        .fontSize(8)
        .fillColor("#ff661a")
        .text(`${start + index}`, pageInset + indent, y, {
          width: 8,
          align: "right",
          lineBreak: false,
        });
    } else {
      document.rect(pageInset + indent + 3, y + 5, 4, 4).fill("#ff661a");
    }
    document.fontSize(8.6).fillColor("#1a1a1a");
    renderInlineText(document, children, textX, y, {
      width: textWidth,
      lineGap: 2.1,
    });
    document.moveDown(0.5);
    item.children
      .filter((child) => child.type === "list")
      .forEach((child) => renderList(document, child, level + 1));
  });
}

function renderDropboxTree(document, items) {
  const height = 34 + items.length * 12;
  ensureSpace(document, height + 16);
  const x = pageInset + 8;
  const y = document.y;
  const width = document.page.width - pageInset * 2 - 16;
  document.rect(x, y, width, height).fillAndStroke("#fafafa", "#cccccc");
  let rowY = y + 14;
  items.forEach((item) => {
    const note = item.text.startsWith("–");
    const file =
      item.text.startsWith("📄") ||
      (!item.text.startsWith("📂") && /\.(pdf|indd|idml)$/i.test(item.text));
    const textX = x + 12 + item.level * 10;
    if (!note) drawTreeNode(document, textX, rowY + 1, file);
    document
      .font(item.bold ? "Bold" : "Body")
      .fontSize(6.5)
      .fillColor(note ? "#ff661a" : "#1a1a1a")
      .text(
        item.text.replace(/^[📂📄]\s*/, ""),
        textX + (note ? 0 : 11),
        rowY,
        {
          lineBreak: false,
        },
      );
    rowY += 12;
  });
  document.y = y + height + 16;
}

function inlineRuns(nodes, bold = false, link = null) {
  return nodes.flatMap((node) => {
    if (node.type === "text")
      return [{ text: node.value, bold, code: false, link }];
    if (node.type === "inlineCode")
      return [{ text: node.value, bold: false, code: true, link: null }];
    if (node.type === "break") return [{ text: "\n", bold, code: false, link }];
    if ("children" in node)
      return inlineRuns(
        node.children,
        bold || node.type === "strong",
        node.type === "link" ? node.url : link,
      );
    return [];
  });
}

function splitEmojiText(text) {
  return text.split(/(\p{Extended_Pictographic}\uFE0F?)/gu).filter(Boolean);
}

function renderInlineText(document, nodes, x, y, options) {
  const runs = inlineRuns(nodes).filter((run) => run.text);
  const maxX = x + options.width;
  document.font("Body");
  const lineHeight = document.currentLineHeight() + (options.lineGap || 0);
  let cursorX = x;
  let cursorY = y;

  const nextLine = () => {
    cursorX = x;
    cursorY += lineHeight;
  };

  for (const run of runs) {
    const textFragments = run.code
      ? [run.text]
      : run.text.split(/(\s+)/).filter(Boolean);
    const fragments = textFragments.flatMap(splitEmojiText);
    for (const fragment of fragments) {
      if (fragment === "\n") {
        nextLine();
        continue;
      }
      const emoji = /^\p{Extended_Pictographic}\uFE0F?$/u.test(fragment);
      document.font(
        emoji ? "Emoji" : run.code ? "Mono" : run.bold ? "Bold" : "Body",
      );
      const width = document.widthOfString(fragment);
      const whitespace = /^\s+$/.test(fragment);
      if (!whitespace && cursorX > x && cursorX + width > maxX) nextLine();
      if (whitespace && cursorX === x) continue;
      if (run.code) {
        document.save();
        document
          .rect(cursorX - 2, cursorY + 1, width + 4, lineHeight - 2)
          .fill("#eeeeee");
        document.restore();
      }
      document
        .fillColor(run.link ? "#00a5a0" : "#1a1a1a")
        .text(fragment, cursorX, cursorY, {
          lineBreak: false,
          underline: Boolean(run.link),
          link: run.link || undefined,
        });
      cursorX += width;
    }
  }
  document.x = x;
  document.y = cursorY + lineHeight;
}

function drawTreeNode(document, x, y, file) {
  document.lineWidth(0.5).strokeColor("#1a1a1a");
  if (file) {
    document.rect(x, y, 7, 9).stroke();
    document
      .moveTo(x + 4, y)
      .lineTo(x + 7, y + 3)
      .stroke();
  } else {
    document.rect(x, y + 2, 9, 6).stroke();
    document.rect(x, y, 4, 2).stroke();
  }
}

function renderImageGroup(document, images, captions) {
  for (let index = 0; index < images.length; index += 2) {
    const sources = images.slice(index, index + 2);
    const pairCaptions = captions.slice(index, index + 2);
    if (sources.length === 2) renderImagePair(document, sources, pairCaptions);
    else
      renderImage(document, sources[0], pairCaptions[0] || captions[0] || "");
  }
}

function imageDetails(document, source, caption, maxWidth, maxHeight) {
  const filename = source.split("/").pop();
  if (!filename) return null;
  const path = join(manualDirectory, "images", filename);
  const image = document.openImage(path);
  const captionHeight = caption
    ? document
        .font("Body")
        .fontSize(7)
        .heightOfString(caption, { width: maxWidth, lineGap: 2 }) + 8
    : 0;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return {
    path,
    caption,
    captionHeight,
    width: image.width * scale,
    height: image.height * scale,
  };
}

function renderImagePair(document, images, captions) {
  const contentWidth = document.page.width - pageInset * 2;
  const gap = 14;
  const imageWidth = (contentWidth - gap) / 2;
  const details = images
    .map((source, index) =>
      imageDetails(
        document,
        source,
        captions[index] || captions[0] || "",
        imageWidth,
        280,
      ),
    )
    .filter(Boolean);
  if (details.length !== 2) return;
  const rowHeight = Math.max(
    ...details.map((item) => item.height + 5 + item.captionHeight),
  );
  ensureSpace(document, rowHeight + 12);
  const y = document.y;
  details.forEach((item, index) => {
    const columnX = pageInset + index * (imageWidth + gap);
    document.image(item.path, columnX + (imageWidth - item.width) / 2, y, {
      width: item.width,
      height: item.height,
    });
    if (item.caption) {
      document
        .font("Body")
        .fontSize(7)
        .fillColor("#666666")
        .text(item.caption, columnX, y + item.height + 5, {
          width: imageWidth,
          align: "center",
          lineGap: 2,
        });
    }
  });
  document.y = y + rowHeight + 7;
}

function renderImage(document, source, caption) {
  const maxWidth = (document.page.width - pageInset * 2) / 2;
  let details = imageDetails(document, source, caption, maxWidth, 330);
  if (!details) return;
  ensureSpace(document, details.height + details.captionHeight + 12);
  details = imageDetails(
    document,
    source,
    caption,
    maxWidth,
    Math.min(
      330,
      contentBottom(document) - document.y - details.captionHeight - 12,
    ),
  );
  if (!details) return;
  const x = (document.page.width - details.width) / 2;
  document.image(details.path, x, document.y, {
    width: details.width,
    height: details.height,
  });
  document.y += details.height + 5;
  if (details.caption) {
    document
      .font("Body")
      .fontSize(7)
      .fillColor("#666666")
      .text(
        details.caption,
        pageInset + (document.page.width - pageInset * 2 - maxWidth) / 2,
        document.y,
        {
          width: maxWidth,
          align: "center",
          lineGap: 2,
        },
      );
    document.moveDown(0.7);
  }
}

function ensureSpace(document, height) {
  if (document.y + height > contentBottom(document)) addPage(document);
}

function addPageFurniture(document, version) {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    if (index === 0) continue;
    document.switchToPage(index);
    const lineY = document.page.height - footerLineOffset;
    document
      .moveTo(pageInset, lineY)
      .lineTo(document.page.width - pageInset, lineY)
      .lineWidth(0.6)
      .stroke("#999999");
    const bottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document.font("Body").fontSize(6.5).fillColor("#666666");
    document.text(version, pageInset, document.page.height - 35, {
      lineBreak: false,
    });
    document.text(
      String(index + 1).padStart(2, "0"),
      document.page.width - 80,
      document.page.height - 35,
      { width: 22, align: "right", lineBreak: false },
    );
    document.page.margins.bottom = bottomMargin;
  }
}
