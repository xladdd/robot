import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toString } from "mdast-util-to-string";
import PDFDocument from "pdfkit";
import remarkParse from "remark-parse";
import { unified } from "unified";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manualDirectory = join(repository, "app", "_tools", "design-manual");
const outputDirectory = join(manualDirectory, "public");
const requestedLanguages = process.argv.slice(2);
const languages = requestedLanguages.length ? requestedLanguages : ["en", "cs"];

for (const language of languages) {
  if (language !== "en" && language !== "cs") {
    throw new Error(`Unknown language "${language}". Use en or cs.`);
  }
}

await mkdir(outputDirectory, { recursive: true });
for (const language of languages) await exportManual(language);

async function exportManual(language) {
  const [manual, changelog] = await Promise.all([
    readFile(join(manualDirectory, `manual.${language}.md`), "utf8"),
    readFile(join(manualDirectory, "changelog.md"), "utf8"),
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
    margins: { top: 60, right: 58, bottom: 60, left: 58 },
    size: "A4",
  });
  document.registerFont("Body", "/System/Library/Fonts/Supplemental/Verdana.ttf");
  document.registerFont("Bold", "/System/Library/Fonts/Supplemental/Verdana Bold.ttf");

  const finished = new Promise((resolveFinished, rejectFinished) => {
    const stream = createWriteStream(output);
    stream.on("finish", resolveFinished);
    stream.on("error", rejectFinished);
    document.pipe(stream);
  });

  addCover(document, language);
  renderMarkdown(document, manual, language, false);
  renderMarkdown(document, changelog, language, true);
  addPageFurniture(document, language);
  document.end();
  await finished;
  console.log(`Wrote ${output}`);
}

function addPage(document, section = "DESIGN MANUAL") {
  document.addPage();
  document.rect(0, 0, document.page.width, document.page.height).fill("#e6e6e6");
  document.fillColor("#1a1a1a");
  document.font("Body").fontSize(7).fillColor("#00a5a0").text(section, 58, 30, {
    characterSpacing: 1.2,
  });
  document.moveTo(58, 47).lineTo(document.page.width - 58, 47).lineWidth(0.6).stroke("#999999");
  document.x = 58;
  document.y = 70;
}

function addCover(document, language) {
  document.addPage();
  document.rect(0, 0, document.page.width, document.page.height).fill("#cccccc");
  document.rect(58, 72, 48, 48).fill("#1a1a1a");
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      document.rect(70 + column * 12, 84 + row * 12, 5, 5).fill("#ff661a");
    }
  }
  document.font("Body").fontSize(8).fillColor("#00a5a0").text("TAKTIK / REFERENCE", 58, 186, {
    characterSpacing: 1.4,
  });
  document.font("Body").fontSize(42).fillColor("#1a1a1a").text(
    language === "cs" ? "Grafický\nmanuál" : "Design\nManual",
    58,
    212,
    { lineGap: 2 },
  );
  document.font("Body").fontSize(10).fillColor("#666666").text(
    language === "cs" ? "Pravidla pro grafiky a redaktory" : "Working guidance for designers and editors",
    58,
    340,
  );
  document.rect(58, document.page.height - 90, document.page.width - 116, 18).fill("#ff661a");
}

function renderMarkdown(document, markdown, language, appendix) {
  const tree = unified().use(remarkParse).parse(markdown);
  let chapter = 0;
  let hasContentPage = false;

  if (appendix) {
    addPage(document, language === "cs" ? "PŘÍLOHA / HISTORIE ZMĚN" : "APPENDIX / CHANGELOG");
    hasContentPage = true;
  }

  for (const node of tree.children) {
    if (node.type === "html") continue;
    if (node.type === "heading" && node.depth === 1) {
      const title = toString(node).trim();
      if (!title) continue;
      if (!appendix) {
        chapter++;
        addPage(document, `${String(chapter).padStart(2, "0")} / ${language === "cs" ? "GRAFICKÝ MANUÁL" : "DESIGN MANUAL"}`);
        hasContentPage = true;
      }
      ensureSpace(document, 90);
      document.font("Body").fontSize(31).fillColor("#1a1a1a").text(title, { lineGap: 4 });
      document.moveDown(1.1);
      continue;
    }
    if (!hasContentPage) continue;

    if (node.type === "heading") {
      ensureSpace(document, 70);
      document.moveDown(0.7);
      document.font(node.depth === 2 ? "Body" : "Bold")
        .fontSize(node.depth === 2 ? 17 : 11)
        .fillColor(node.depth === 2 ? "#ff661a" : "#00a5a0")
        .text(toString(node), { lineGap: 3 });
      document.moveDown(0.55);
    } else if (node.type === "list") {
      for (const item of node.children) {
        const text = toString(item).replace(/\n+/g, " ").trim();
        if (!text) continue;
        ensureSpace(document, 38);
        const y = document.y + 5;
        document.rect(61, y, 4, 4).fill("#ff661a");
        document.font("Body").fontSize(8.6).fillColor("#1a1a1a").text(text, 76, document.y, {
          width: document.page.width - 134,
          lineGap: 4.2,
        });
        document.moveDown(0.5);
      }
    } else if (node.type === "paragraph") {
      const images = node.children.filter((child) => child.type === "image");
      if (images.length) {
        for (const image of images) renderImage(document, image.url, image.alt || "");
      } else {
        const text = toString(node).trim();
        if (!text) continue;
        ensureSpace(document, 46);
        document.font("Body").fontSize(8.6).fillColor("#1a1a1a").text(text, {
          width: document.page.width - 116,
          lineGap: 4.4,
        });
        document.moveDown(0.7);
      }
    } else if (node.type === "blockquote") {
      const text = toString(node).trim();
      if (!text) continue;
      ensureSpace(document, 38);
      document.font("Body").fontSize(7).fillColor("#666666").text(text, 76, document.y, {
        width: document.page.width - 152,
        align: "center",
        lineGap: 3,
      });
      document.moveDown(0.8);
    }
  }
}

function renderImage(document, source, alt) {
  const filename = source.split("/").pop();
  if (!filename) return;
  const path = join(manualDirectory, "images", filename);
  ensureSpace(document, 250);
  const image = document.openImage(path);
  const maxWidth = document.page.width - 136;
  const maxHeight = Math.min(330, document.page.height - document.y - 90);
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (document.page.width - width) / 2;
  document.image(path, x, document.y, { width, height });
  document.y += height + 7;
  if (alt) {
    document.font("Body").fontSize(6.8).fillColor("#666666").text(alt, 76, document.y, {
      width: document.page.width - 152,
      align: "center",
    });
    document.moveDown(0.7);
  }
}

function ensureSpace(document, height) {
  if (document.y + height > document.page.height - 64) addPage(document);
}

function addPageFurniture(document, language) {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    if (index === 0) continue;
    document.switchToPage(index);
    document.moveTo(58, document.page.height - 94)
      .lineTo(document.page.width - 58, document.page.height - 94)
      .lineWidth(0.6)
      .stroke("#999999");
    document.font("Body").fontSize(6.5).fillColor("#666666");
    document.text(language === "cs" ? "TAKTIK / GRAFICKÝ MANUÁL" : "TAKTIK / DESIGN MANUAL", 58, document.page.height - 82, { lineBreak: false });
    document.text(String(index + 1).padStart(2, "0"), document.page.width - 80, document.page.height - 82, { width: 22, align: "right", lineBreak: false });
  }
}
