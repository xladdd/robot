"use client";

import { useEffect, useRef } from "react";
import { copy } from "../../content/ui";

import type { Language } from "../registry";
import type {
  ManualContent,
  ManualInline,
  ManualList,
  ManualSourceBlock,
  ManualTreeNode,
} from "./parse";

type ZoomedImage = { src: string; caption: string };

function flattenTree(nodes: ManualTreeNode[]): ManualTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function ManualInlineText({ inline }: { inline: ManualInline[] }) {
  return inline.map((span, index) => {
    if (span.kind === "code")
      return (
        <code className="manual-inline-code" key={index}>
          {span.text}
        </code>
      );
    if (span.kind === "link")
      return (
        <a
          className="manual-inline-link"
          href={span.href}
          key={index}
          rel="noreferrer"
          target="_blank"
        >
          {span.text}
        </a>
      );
    if (span.kind === "strong") return <strong key={index}>{span.text}</strong>;
    return <span key={index}>{span.text}</span>;
  });
}

function ManualListView({ list }: { list: ManualList }) {
  const ListElement = list.ordered ? "ol" : "ul";
  return (
    <ListElement
      className={`manual-source-list ${list.ordered ? "ordered" : "unordered"}`}
      start={list.ordered ? list.start : undefined}
    >
      {list.items.map((item, index) => (
        <li key={`${item.text}-${index}`}>
          <ManualInlineText inline={item.inline} />
          {item.children.map((child, childIndex) => (
            <ManualListView key={childIndex} list={child} />
          ))}
        </li>
      ))}
    </ListElement>
  );
}

export function DesignManualLightbox({
  image,
  closeLabel,
  onClose,
}: {
  image: ZoomedImage;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="manual-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={image.caption}
      onClick={onClose}
    >
      <button
        className="manual-lightbox-close"
        onClick={onClose}
        aria-label={closeLabel}
      >
        ×
      </button>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={image.src} alt={image.caption} />
        <figcaption>{image.caption}</figcaption>
      </figure>
    </div>
  );
}

export function DesignManualMainInterface({
  language,
  content,
  chapterIndex,
  onChapter,
  onZoom,
}: {
  language: Language;
  content: ManualContent;
  chapterIndex: number;
  onChapter: (chapter: number | ((current: number) => number)) => void;
  onZoom: (image: ZoomedImage) => void;
}) {
  const docsRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const t = copy[language];
  const chapters =
    language === "cs"
      ? content.chapters.filter(
          (chapter) =>
            chapter.blocks.length && chapter.title !== "Historie verzí",
        )
      : content.chapters;
  const editorChapterIndex = Math.max(
    0,
    chapters.findIndex(
      (chapter) =>
        chapter.title === (language === "cs" ? "Redaktoři" : "Editors"),
    ),
  );

  useEffect(() => {
    if (articleRef.current) articleRef.current.scrollTop = 0;
    if (docsRef.current) docsRef.current.scrollTop = 0;
  }, [chapterIndex, language]);

  const chapter = chapters[Math.min(chapterIndex, chapters.length - 1)];
  const sourceSections: Array<{
    heading: string;
    level: "h2" | "h3";
    blocks: ManualSourceBlock[];
  }> = [];
  chapter.blocks.forEach((block) => {
    if (block.type === "h2" || block.type === "h3")
      sourceSections.push({
        heading: block.text || "",
        level: block.type,
        blocks: [],
      });
    else if (sourceSections.length)
      sourceSections[sourceSections.length - 1].blocks.push(block);
  });

  return (
    <div className="manual-docs" ref={docsRef}>
      <nav
        className="manual-toc"
        aria-label={language === "cs" ? "Obsah manuálu" : "Manual contents"}
      >
        <span>{language === "cs" ? "OBSAH" : "CONTENTS"}</span>
        <div className="manual-toc-groups">
          <div className="manual-toc-group">
            <strong>{language === "cs" ? "GRAFICI" : "DESIGNERS"}</strong>
            {chapters.slice(0, editorChapterIndex).map((item, index) => (
              <button
                className={chapterIndex === index ? "active" : ""}
                key={item.title}
                onClick={() => onChapter(index)}
              >
                <b>{String(index + 1).padStart(2, "0")}</b>
                {item.title}
              </button>
            ))}
          </div>
          <div className="manual-toc-group">
            <strong>{language === "cs" ? "REDAKTOŘI" : "EDITORS"}</strong>
            {chapters.slice(editorChapterIndex).map((item, offset) => {
              const index = editorChapterIndex + offset;
              return (
                <button
                  className={chapterIndex === index ? "active" : ""}
                  key={item.title}
                  onClick={() => onChapter(index)}
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
        <a
          className="manual-download action-button action-button-success"
          href={`/design-manual/downloads/design-manual.${language}.pdf`}
          download
        >
          {language === "cs" ? "STÁHNOUT ↓" : "DOWNLOAD ↓"}
        </a>
      </nav>
      <article className="manual-article" ref={articleRef}>
        <section
          className="manual-chapter"
          key={`${language}-${chapter.title}`}
        >
          <span>{String(chapterIndex + 1).padStart(2, "0")}</span>
          <h1>{chapter.title}</h1>
          {sourceSections.map((sourceSection) => {
            return (
              <div
                className={`manual-topic manual-source-topic manual-source-topic-${sourceSection.level}`}
                key={sourceSection.heading}
              >
                <h2>{sourceSection.heading}</h2>
                <div className="manual-topic-content">
                  {sourceSection.blocks.map((block, blockIndex) => {
                    if (block.type === "dropbox-tree")
                      return (
                        <div
                          className="dropbox-tree"
                          key={blockIndex}
                          aria-label={
                            language === "cs"
                              ? "Struktura složek Dropbox"
                              : "Dropbox folder structure"
                          }
                        >
                          {flattenTree(block.tree || []).map(
                            (treeNode, treeIndex) => {
                              const rawText = treeNode.text;
                              const isNote = rawText.startsWith("–");
                              const isFile =
                                rawText.startsWith("📄") ||
                                (!rawText.startsWith("📂") &&
                                  /\.(pdf|indd|idml)$/i.test(rawText));
                              return (
                                <div
                                  className={`dropbox-tree-row level-${treeNode.level} ${isNote ? "note" : ""} ${treeNode.bold ? "key-folder" : ""}`}
                                  key={treeIndex}
                                >
                                  {!isNote && (
                                    <span
                                      className={
                                        isFile ? "file-node" : "folder-node"
                                      }
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>
                                    {rawText.replace(/^[📂📄]\s*/, "")}
                                  </span>
                                </div>
                              );
                            },
                          )}
                        </div>
                      );
                    if (block.type === "list")
                      return (
                        <ManualListView key={blockIndex} list={block.list!} />
                      );
                    if (block.type === "paragraph")
                      return (
                        <p className="manual-source-paragraph" key={blockIndex}>
                          <ManualInlineText
                            inline={
                              block.inline || [
                                { text: block.text || "", kind: "text" },
                              ]
                            }
                          />
                        </p>
                      );
                    if (block.type === "caption") return null;
                    if (block.type === "table")
                      return (
                        <div
                          className="manual-source-table-wrap"
                          key={blockIndex}
                        >
                          <table>
                            <tbody>
                              {block.rows!.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex}>{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    const following = sourceSection.blocks[blockIndex + 1];
                    const captions =
                      following?.type === "caption"
                        ? (following.text || "").split("\t")
                        : block.text
                          ? [block.text]
                          : [];
                    return (
                      <div
                        className={`manual-image-grid ${block.images!.length === 1 ? "single" : ""}`}
                        key={blockIndex}
                      >
                        {block.images!.map((src, imageIndex) => {
                          const caption =
                            captions[imageIndex] ||
                            captions[0] ||
                            `${t.apps.manual} · ${imageIndex + 1}`;
                          return (
                            <figure key={src}>
                              <button
                                onClick={() => onZoom({ src, caption })}
                                aria-label={`${caption} — ${language === "cs" ? "zvětšit" : "zoom"}`}
                              >
                                <img src={src} alt={caption} />
                              </button>
                              <figcaption>{caption}</figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
        <nav
          className="manual-chapter-nav"
          aria-label={
            language === "cs" ? "Navigace kapitol" : "Chapter navigation"
          }
        >
          <button
            onClick={() => onChapter((current) => Math.max(0, current - 1))}
            disabled={chapterIndex === 0}
          >
            ← <span>{language === "cs" ? "Předchozí" : "Previous"}</span>
          </button>
          <button
            onClick={() =>
              onChapter((current) => Math.min(chapters.length - 1, current + 1))
            }
            disabled={chapterIndex >= chapters.length - 1}
          >
            <span>{language === "cs" ? "Další" : "Next"}</span> →
          </button>
        </nav>
      </article>
    </div>
  );
}
