"""Extract DOCX manuscript blocks and an IDML template inventory."""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def safe_xml(data: bytes) -> ET.Element:
    return ET.fromstring(data)


def paragraph_text(paragraph: ET.Element) -> str:
    pieces: list[str] = []
    for node in paragraph.iter():
        name = local_name(node.tag)
        if name in {"t", "delText", "instrText"} and node.text:
            pieces.append(node.text)
        elif name == "tab":
            pieces.append("\t")
        elif name in {"br", "cr"}:
            pieces.append("\n")
    return "".join(pieces)


def image_descriptions(node: ET.Element) -> list[str]:
    descriptions: list[str] = []
    for item in node.iter():
        if local_name(item.tag) != "docPr":
            continue
        value = (
            item.attrib.get("descr")
            or item.attrib.get("title")
            or item.attrib.get("name")
        )
        if value and value not in descriptions:
            descriptions.append(value)
    return descriptions


def paragraph_metadata(paragraph: ET.Element) -> tuple[str | None, int | None, bool]:
    properties = paragraph.find(f"{W}pPr")
    if properties is None:
        return None, None, False
    style = properties.find(f"{W}pStyle")
    style_name = style.attrib.get(f"{W}val") if style is not None else None
    numbering = properties.find(f"{W}numPr")
    if numbering is None:
        return style_name, None, False
    level = numbering.find(f"{W}ilvl")
    try:
        list_level = int(level.attrib.get(f"{W}val", "0")) if level is not None else 0
    except ValueError:
        list_level = 0
    return style_name, list_level, True


def extract_docx(path: Path) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    blocks: list[dict] = []
    with zipfile.ZipFile(path) as archive:
        try:
            document = safe_xml(archive.read("word/document.xml"))
        except KeyError as error:
            raise ValueError("The DOCX has no word/document.xml file.") from error

    body = document.find(f"{W}body")
    if body is None:
        raise ValueError("The DOCX document body is missing.")

    def add_block(
        text: str,
        kind: str,
        source_style: str | None = None,
        list_level: int | None = None,
        table_id: str | None = None,
        image_description: str | None = None,
    ) -> None:
        if not text and not image_description:
            return
        blocks.append(
            {
                "id": f"block-{len(blocks) + 1:05d}",
                "order": len(blocks),
                "text": text,
                "kind": kind,
                "sourceStyle": source_style,
                "listLevel": list_level,
                "tableId": table_id,
                "imageDescription": image_description,
            }
        )

    table_number = 0
    for child in list(body):
        name = local_name(child.tag)
        if name == "p":
            text = paragraph_text(child)
            style, level, is_list = paragraph_metadata(child)
            descriptions = image_descriptions(child)
            add_block(
                text,
                "list-item" if is_list else "paragraph",
                style,
                level,
                image_description="; ".join(descriptions) if descriptions else None,
            )
            if descriptions and not text:
                blocks[-1]["kind"] = "image"
        elif name == "tbl":
            table_number += 1
            table_id = f"table-{table_number:03d}"
            for row in child.findall(f"{W}tr"):
                cells: list[str] = []
                for cell in row.findall(f"{W}tc"):
                    paragraphs = [paragraph_text(p) for p in cell.findall(f".//{W}p")]
                    cells.append("\n".join(value for value in paragraphs if value))
                add_block(" | ".join(cells), "table-row", table_id=table_id)
            warnings.append(
                f"{table_id} was extracted as review-only rows; V1 does not compose tables."
            )

    if not blocks:
        raise ValueError(
            "No manuscript text or image descriptions were found in the DOCX."
        )
    return blocks, warnings


def style_inventory(styles_xml: bytes) -> tuple[list[dict], list[dict], list[dict]]:
    root = safe_xml(styles_xml)
    results: dict[str, list[dict]] = {
        "ParagraphStyle": [],
        "CharacterStyle": [],
        "ObjectStyle": [],
    }
    group_types = {
        "ParagraphStyleGroup": "ParagraphStyle",
        "CharacterStyleGroup": "CharacterStyle",
        "ObjectStyleGroup": "ObjectStyle",
    }

    def walk(node: ET.Element, paths: dict[str, list[str]]) -> None:
        name = local_name(node.tag)
        next_paths = {key: list(value) for key, value in paths.items()}
        if name in group_types:
            kind = group_types[name]
            group_name = node.attrib.get("Name", "").strip()
            if group_name:
                next_paths[kind].append(group_name)
        if name in results:
            style_name = node.attrib.get("Name", "").strip()
            style_id = node.attrib.get("Self", style_name)
            if style_name:
                path = "/".join([*next_paths[name], style_name])
                results[name].append({"id": style_id, "name": style_name, "path": path})
        for child in list(node):
            walk(child, next_paths)

    walk(root, {key: [] for key in results})
    for values in results.values():
        values.sort(key=lambda item: item["path"].casefold())
    return results["ParagraphStyle"], results["CharacterStyle"], results["ObjectStyle"]


def extract_idml(path: Path) -> dict:
    labels: set[str] = set()
    layers: set[str] = set()
    page_width: float | None = None
    page_height: float | None = None
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        styles_name = next(
            (name for name in names if name.endswith("Resources/Styles.xml")), None
        )
        if not styles_name:
            raise ValueError("The IDML package has no Resources/Styles.xml file.")
        paragraph_styles, character_styles, object_styles = style_inventory(
            archive.read(styles_name)
        )

        for name in names:
            if not name.lower().endswith(".xml"):
                continue
            try:
                root = safe_xml(archive.read(name))
            except ET.ParseError:
                continue
            for node in root.iter():
                node_name = local_name(node.tag)
                if node_name == "Layer":
                    value = node.attrib.get("Name", "").strip()
                    if value:
                        layers.add(value)
                if node_name == "KeyValuePair":
                    key = node.attrib.get("Key", "").casefold()
                    value = node.attrib.get("Value", "").strip()
                    if key in {"label", "scriptlabel"} and value:
                        labels.add(value)
                for attribute in ("Label", "ScriptLabel"):
                    value = node.attrib.get(attribute, "").strip()
                    if value:
                        labels.add(value)
                if node_name in {"DocumentPreference", "DocumentPreferences"}:
                    width = node.attrib.get("PageWidth")
                    height = node.attrib.get("PageHeight")
                    try:
                        if width is not None:
                            page_width = float(width)
                        if height is not None:
                            page_height = float(height)
                    except ValueError:
                        pass

    return {
        "filename": path.name,
        "paragraphStyles": paragraph_styles,
        "characterStyles": character_styles,
        "objectStyles": object_styles,
        "labels": sorted(labels, key=str.casefold),
        "layers": sorted(layers, key=str.casefold),
        "page": {"width": page_width, "height": page_height},
    }


def extract(manuscript_path: Path, idml_path: Path) -> dict:
    blocks, warnings = extract_docx(manuscript_path)
    inventory = extract_idml(idml_path)
    if "typesetter:story:main" not in inventory["labels"]:
        warnings.append(
            "The IDML inventory does not contain the required typesetter:story:main label. Add it to the first main-story text frame before importing."
        )
    return {
        "manuscript": {"filename": manuscript_path.name, "blocks": blocks},
        "template": inventory,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manuscript", type=Path)
    parser.add_argument("idml", type=Path)
    args = parser.parse_args()
    print(json.dumps(extract(args.manuscript, args.idml), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
