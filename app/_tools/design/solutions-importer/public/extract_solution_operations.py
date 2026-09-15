#!/usr/bin/env python3
"""Build a semantic InDesign solutions manifest from two PDFs and an IDML file."""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

import pdfplumber
from pdfminer.converter import PDFPageAggregator
from pdfminer.layout import LAParams, LTChar, LTContainer
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdftypes import resolve1

POSITION_TOLERANCE = 0.9
LINE_TOLERANCE = 4.0
PLACEHOLDERS = {
    "type text here",
    "add text",
    "click to add text",
}


def close(a: float, b: float, tolerance: float = POSITION_TOLERANCE) -> bool:
    return abs(a - b) <= tolerance


LIGATURE_REPLACEMENTS = str.maketrans(
    {
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬀ": "ff",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
    }
)


def comparison_text(value: object) -> str:
    return str(value or "").translate(LIGATURE_REPLACEMENTS)


def same_character(a: dict, b: dict) -> bool:
    return comparison_text(a.get("text")) == comparison_text(
        b.get("text")
    ) and same_bounds(a, b)


def same_bounds(a: dict, b: dict) -> bool:
    return (
        close(float(a["x0"]), float(b["x0"]))
        and close(float(a["top"]), float(b["top"]))
        and close(float(a["x1"]), float(b["x1"]))
        and close(float(a["bottom"]), float(b["bottom"]))
    )


def union_character_bounds(characters: list[dict]) -> dict:
    return {
        "x0": min(float(character["x0"]) for character in characters),
        "top": min(float(character["top"]) for character in characters),
        "x1": max(float(character["x1"]) for character in characters),
        "bottom": max(float(character["bottom"]) for character in characters),
    }


def grouped_match(
    blank_chars: list[dict], manuscript: dict, used: set[int]
) -> list[int] | None:
    """Match one grouped PDF.js item to adjacent clean text items.

    PDF.js may return a clean title as separate items (``U``, ``1``) but
    return the identical manuscript title as one item (``U1``). Treating the
    item strings as glyphs would incorrectly report unchanged text as an
    addition. Only accept a grouped match when both text and the union bounds
    agree, so a genuinely added phrase cannot consume nearby source text.
    """
    target = comparison_text(manuscript.get("text", ""))
    if len(target) < 2:
        return None

    for start, candidate in enumerate(blank_chars):
        candidate_text = comparison_text(candidate.get("text", ""))
        if start in used or not target.startswith(candidate_text):
            continue
        matched = [start]
        text = candidate_text
        if not text or len(text) >= len(target):
            continue
        for index in range(start + 1, len(blank_chars)):
            if index in used:
                continue
            next_character = blank_chars[index]
            next_text = comparison_text(next_character.get("text", ""))
            if not next_text:
                continue
            previous = blank_chars[matched[-1]]
            if float(next_character["x0"]) < float(previous["x0"]):
                break
            top_distance = abs(float(next_character["top"]) - float(previous["top"]))
            line_tolerance = max(
                LINE_TOLERANCE,
                min(
                    float(next_character.get("size", 0)), float(previous.get("size", 0))
                )
                * 0.5,
            )
            if top_distance > line_tolerance:
                break
            text += next_text
            matched.append(index)
            if text == target:
                union = union_character_bounds([blank_chars[item] for item in matched])
                if same_bounds(union, manuscript):
                    return matched
                break
            if not target.startswith(text):
                break
    return None


def _pdf_box(attrs: dict, name: str) -> list[float] | None:
    value = attrs.get(name)
    if value is None:
        return None
    values = [float(item) for item in resolve1(value)]
    if len(values) != 4:
        raise ValueError(f"PDF {name} must contain four coordinates")
    return [
        min(values[0], values[2]),
        min(values[1], values[3]),
        max(values[0], values[2]),
        max(values[1], values[3]),
    ]


def _page_rotation(page) -> int:
    value = getattr(page, "rotation", None)
    if value is None:
        value = page.page_obj.attrs.get("Rotate", 0)
    rotation = int(float(resolve1(value or 0))) % 360
    if rotation not in (0, 90, 180, 270):
        raise ValueError(f"Unsupported PDF page rotation: {rotation} degrees")
    return rotation


def _displayed_box_offset(
    box: list[float], media: list[float], rotation: int
) -> tuple[float, float]:
    if rotation == 0:
        return box[0] - media[0], media[3] - box[3]
    if rotation == 90:
        return box[1] - media[1], box[0] - media[0]
    if rotation == 180:
        return media[2] - box[2], box[1] - media[1]
    return media[3] - box[3], media[2] - box[2]


def page_geometry(page, use_trim_box: bool) -> dict:
    attrs = page.page_obj.attrs
    media = _pdf_box(attrs, "MediaBox")
    if media is None:
        raise ValueError("PDF page has no MediaBox")
    crop = _pdf_box(attrs, "CropBox")
    if crop is None:
        view = list(media)
    else:
        view = [
            max(media[0], crop[0]),
            max(media[1], crop[1]),
            min(media[2], crop[2]),
            min(media[3], crop[3]),
        ]
        if view[2] <= view[0] or view[3] <= view[1]:
            raise ValueError("PDF CropBox does not intersect its MediaBox")

    trim = _pdf_box(attrs, "TrimBox") if use_trim_box else None
    box = trim or list(media)
    rotation = _page_rotation(page)
    offset_x, offset_top = _displayed_box_offset(box, media, rotation)
    view_offset_x, view_offset_top = _displayed_box_offset(view, media, rotation)
    swaps_dimensions = rotation in (90, 270)
    raw_width = box[2] - box[0]
    raw_height = box[3] - box[1]
    return {
        # pdfminer coordinates are MediaBox-local in displayed orientation.
        "offset_x": offset_x,
        "offset_top": offset_top,
        # PDF.js coordinates are view-local in displayed orientation.
        "view_offset_x": view_offset_x,
        "view_offset_top": view_offset_top,
        "media_width": media[1] - media[0] if swaps_dimensions else media[2] - media[0],
        "media_height": media[2] - media[0]
        if swaps_dimensions
        else media[3] - media[1],
        "width": raw_height if swaps_dimensions else raw_width,
        "height": raw_width if swaps_dimensions else raw_height,
        "box": box,
        "rotation": rotation,
        "trimmed": use_trim_box
        and any(not close(box[index], media[index], 0.05) for index in range(4)),
    }


def matching_page_geometries(
    clean_page, manuscript_page, use_trim_boxes: bool
) -> tuple[dict, dict]:
    clean_geometry = page_geometry(clean_page, use_trim_boxes)
    manuscript_geometry = page_geometry(manuscript_page, use_trim_boxes)
    if close(clean_geometry["width"], manuscript_geometry["width"], 0.1) and close(
        clean_geometry["height"], manuscript_geometry["height"], 0.1
    ):
        return clean_geometry, manuscript_geometry

    # Preserve the original convenience for a single marked export even when
    # the checkbox is missed. The explicit option is still needed when both
    # PDFs have equally sized printer-mark media boxes.
    clean_trim = page_geometry(clean_page, True)
    manuscript_media = page_geometry(manuscript_page, False)
    if close(clean_trim["width"], manuscript_media["width"], 0.1) and close(
        clean_trim["height"], manuscript_media["height"], 0.1
    ):
        return clean_trim, manuscript_media

    clean_media = page_geometry(clean_page, False)
    manuscript_trim = page_geometry(manuscript_page, True)
    if close(clean_media["width"], manuscript_trim["width"], 0.1) and close(
        clean_media["height"], manuscript_trim["height"], 0.1
    ):
        return clean_media, manuscript_trim

    raise ValueError(
        "Page-size mismatch. Enable printer-mark normalization when either PDF includes marks or bleed."
    )


class TextOnlyPageAggregator(PDFPageAggregator):
    """Keep positioned text while avoiding expensive page-artwork construction."""

    def paint_path(self, gstate, stroke, fill, evenodd, path):
        return

    def render_image(self, name, stream):
        return


def collect_layout_characters(item, characters: list) -> None:
    if isinstance(item, LTChar):
        characters.append(item)
    elif isinstance(item, LTContainer):
        for child in item:
            collect_layout_characters(child, characters)


def text_only_characters(page, geometry: dict) -> list[dict]:
    """Extract glyphs without constructing vectors or images from the PDF page."""
    resource_manager = PDFResourceManager()
    device = TextOnlyPageAggregator(resource_manager, laparams=LAParams())
    interpreter = PDFPageInterpreter(resource_manager, device)
    interpreter.process_page(page.page_obj)

    layout_characters: list = []
    collect_layout_characters(device.get_result(), layout_characters)
    page_height = float(geometry["media_height"])
    return [
        {
            "text": character.get_text(),
            "x0": float(character.x0),
            "x1": float(character.x1),
            "top": page_height - float(character.y1),
            "bottom": page_height - float(character.y0),
            "size": float(character.size),
        }
        for character in layout_characters
    ]


def normalized_characters(page, geometry: dict) -> list[dict]:
    result = []
    for source in text_only_characters(page, geometry):
        char = dict(source)
        char["x0"] = float(char["x0"]) - geometry["offset_x"]
        char["x1"] = float(char["x1"]) - geometry["offset_x"]
        char["top"] = float(char["top"]) - geometry["offset_top"]
        char["bottom"] = float(char["bottom"]) - geometry["offset_top"]
        if (
            char["x1"] >= -1
            and char["x0"] <= geometry["width"] + 1
            and char["bottom"] >= -1
            and char["top"] <= geometry["height"] + 1
        ):
            result.append(char)
    return result


def normalized_preprocessed_characters(
    characters: list[dict], geometry: dict
) -> list[dict]:
    """Shift PDF.js view-local text into the selected page box."""
    preprocessed_offset_x = geometry["offset_x"] - geometry["view_offset_x"]
    preprocessed_offset_top = geometry["offset_top"] - geometry["view_offset_top"]
    result = []
    for source in characters:
        char = dict(source)
        char["x0"] = float(char["x0"]) - preprocessed_offset_x
        char["x1"] = float(char["x1"]) - preprocessed_offset_x
        char["top"] = float(char["top"]) - preprocessed_offset_top
        char["bottom"] = float(char["bottom"]) - preprocessed_offset_top
        if (
            char["x1"] >= -1
            and char["x0"] <= geometry["width"] + 1
            and char["bottom"] >= -1
            and char["top"] <= geometry["height"] + 1
        ):
            result.append(char)
    return result


def subtract_characters(
    blank_chars: list[dict], manuscript_chars: list[dict]
) -> list[dict]:
    """Subtract matching text items, including safely grouped PDF.js items."""
    buckets: dict[str, dict[tuple[int, int], list[tuple[int, dict]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for index, char in enumerate(blank_chars):
        cell = (
            int(math.floor(float(char["x0"]) / POSITION_TOLERANCE)),
            int(math.floor(float(char["top"]) / POSITION_TOLERANCE)),
        )
        buckets[comparison_text(char.get("text", ""))][cell].append((index, char))

    used: set[int] = set()
    additions: list[dict] = []
    for char in manuscript_chars:
        x_cell = int(math.floor(float(char["x0"]) / POSITION_TOLERANCE))
        y_cell = int(math.floor(float(char["top"]) / POSITION_TOLERANCE))
        match_index = None
        match_distance = math.inf
        glyph_buckets = buckets.get(comparison_text(char.get("text", "")), {})
        for x_offset in (-1, 0, 1):
            for y_offset in (-1, 0, 1):
                for index, candidate in glyph_buckets.get(
                    (x_cell + x_offset, y_cell + y_offset), []
                ):
                    if index in used or not same_character(candidate, char):
                        continue
                    distance = abs(candidate["x0"] - char["x0"]) + abs(
                        candidate["top"] - char["top"]
                    )
                    if distance < match_distance:
                        match_index = index
                        match_distance = distance
        if match_index is not None:
            used.add(match_index)
            continue

        grouped = grouped_match(blank_chars, char, used)
        if grouped is not None:
            used.update(grouped)
            continue

        additions.append(char)
    return additions


def group_into_lines(chars: list[dict]) -> list[dict]:
    chars = sorted(
        chars, key=lambda char: (round(float(char["top"]), 1), float(char["x0"]))
    )
    lines: list[list[dict]] = []
    for char in chars:
        for line in lines:
            if close(float(char["top"]), float(line[0]["top"]), LINE_TOLERANCE):
                line.append(char)
                break
        else:
            lines.append([char])

    runs: list[dict] = []
    for line in lines:
        line.sort(key=lambda char: float(char["x0"]))
        current: list[dict] = []
        previous_visible: dict | None = None
        for char in line:
            visible = bool(str(char.get("text", "")).strip())
            if not current:
                current = [char]
                if visible:
                    previous_visible = char
                continue
            typical_size = max(
                float((previous_visible or char).get("size", 10)),
                float(char.get("size", 10)),
            )
            visible_gap = (
                float(char["x0"]) - float(previous_visible["x1"])
                if visible and previous_visible is not None
                else 0
            )
            if (
                visible
                and previous_visible is not None
                and visible_gap > max(typical_size * 0.5, 6.0)
            ):
                run = make_run(current)
                if run:
                    runs.append(run)
                current = [char]
            else:
                current.append(char)
            if visible:
                previous_visible = char
        run = make_run(current)
        if run:
            runs.append(run)
    return sorted(runs, key=lambda run: (run["bounds"][0], run["bounds"][1]))


def make_run(chars: list[dict]) -> dict | None:
    visible = [char for char in chars if str(char.get("text", "")).strip()]
    if not visible:
        return None
    text = "".join(str(char.get("text", "")) for char in chars).strip()
    if re.sub(r"\s+", " ", text).lower() in PLACEHOLDERS:
        return None
    top = min(float(char["top"]) for char in visible)
    left = min(float(char["x0"]) for char in visible)
    bottom = max(float(char["bottom"]) for char in visible)
    right = max(float(char["x1"]) for char in visible)
    return {
        "text": text,
        "bounds": rounded_bounds(top, left, bottom, right),
        "source_size": round(max(float(char.get("size", 0)) for char in visible), 3),
        "glyphs": [
            {
                "text": str(char.get("text", "")),
                "bounds": rounded_bounds(
                    float(char["top"]),
                    float(char["x0"]),
                    float(char["bottom"]),
                    float(char["x1"]),
                ),
            }
            for char in visible
        ],
    }


def overlaps_removed_source(run: dict, removed_chars: list[dict]) -> bool:
    """Detect manuscript edits that replace existing clean-document text."""
    top, left, bottom, right = run["bounds"]
    for char in removed_chars:
        char_top = float(char["top"])
        char_bottom = float(char["bottom"])
        if min(bottom, char_bottom) - max(top, char_top) <= 1:
            continue
        char_left = float(char["x0"])
        char_right = float(char["x1"])
        horizontal_gap = max(char_left - right, left - char_right, 0)
        if horizontal_gap <= 1.5:
            return True
    return False


def rounded_bounds(top: float, left: float, bottom: float, right: float) -> list[float]:
    return [round(top, 3), round(left, 3), round(bottom, 3), round(right, 3)]


def local_name(tag: str) -> str:
    return tag.split("}")[-1]


def parse_idml(path: Path) -> dict:
    try:
        archive = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as error:
        raise ValueError(f"Could not read IDML: {error}") from error

    with archive:
        try:
            design_map = ET.fromstring(archive.read("designmap.xml"))
        except (KeyError, ET.ParseError) as error:
            raise ValueError(
                "The selected file is not a readable IDML document"
            ) from error

        layers = []
        spread_sources = []
        for element in design_map.iter():
            name = local_name(element.tag)
            if name == "Layer":
                layers.append(
                    {
                        "name": element.attrib.get("Name", ""),
                        "visible": element.attrib.get("Visible", "true") == "true",
                        "locked": element.attrib.get("Locked", "false") == "true",
                    }
                )
            elif name == "Spread" and element.attrib.get("src"):
                spread_sources.append(element.attrib["src"])

        page_names = []
        linked_artwork = set()
        for source in spread_sources:
            try:
                root = ET.fromstring(archive.read(source))
            except (KeyError, ET.ParseError):
                continue
            for element in root.iter():
                name = local_name(element.tag)
                if name == "Page":
                    page_names.append(
                        element.attrib.get("Name", str(len(page_names) + 1))
                    )
                elif name == "Link":
                    uri = element.attrib.get("LinkResourceURI", "")
                    if uri:
                        linked_artwork.add(uri.rsplit("/", 1)[-1])

        paragraph_styles = []
        try:
            styles = ET.fromstring(archive.read("Resources/Styles.xml"))
            paragraph_styles = [
                element.attrib.get("Name", "")
                for element in styles.iter()
                if local_name(element.tag) == "ParagraphStyle"
            ]
        except (KeyError, ET.ParseError):
            pass

        swatches = []
        try:
            graphic = ET.fromstring(archive.read("Resources/Graphic.xml"))
            for element in graphic.iter():
                if local_name(element.tag) != "Color":
                    continue
                name = element.attrib.get("Name", "")
                values = element.attrib.get("ColorValue", "").split()
                try:
                    numeric_values = [round(float(value), 4) for value in values]
                except ValueError:
                    numeric_values = []
                if name and name != "$ID/":
                    swatches.append(
                        {
                            "name": name,
                            "space": element.attrib.get("Space", ""),
                            "values": numeric_values,
                        }
                    )
        except (KeyError, ET.ParseError):
            pass

        table_count = 0
        for name in archive.namelist():
            if not (name.startswith("Stories/Story_") and name.endswith(".xml")):
                continue
            try:
                root = ET.fromstring(archive.read(name))
            except ET.ParseError:
                continue
            table_count += sum(
                local_name(element.tag) == "Table" for element in root.iter()
            )

    return {
        "name": path.name,
        "page_count": len(page_names),
        "page_names": page_names,
        "layers": layers,
        "paragraph_styles": paragraph_styles,
        "swatches": swatches,
        "table_count": table_count,
        "linked_artwork_count": len(linked_artwork),
    }


def annotation_subtype(value) -> str:
    return str(value or "").replace("/'", "").replace("'", "").replace("/", "")


def decode_annotation_text(value) -> str:
    if isinstance(value, bytes):
        for encoding in ("utf-8", "utf-16-be", "latin-1"):
            try:
                return value.decode(encoding).strip("\x00")
            except UnicodeDecodeError:
                pass
    return str(value or "")


def stroke_metrics(points: list[list[float]]) -> dict:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    path_length = sum(
        math.hypot(
            points[index][0] - points[index - 1][0],
            points[index][1] - points[index - 1][1],
        )
        for index in range(1, len(points))
    )
    endpoint_distance = math.hypot(
        points[-1][0] - points[0][0], points[-1][1] - points[0][1]
    )
    dx = points[-1][0] - points[0][0]
    dy = points[-1][1] - points[0][1]
    diagonal = math.hypot(right - left, bottom - top)
    return {
        "bounds": rounded_bounds(top, left, bottom, right),
        "path_length": path_length,
        "endpoint_distance": endpoint_distance,
        "dx": dx,
        "dy": dy,
        "diagonal": diagonal,
        "center": ((left + right) / 2, (top + bottom) / 2),
    }


def union_bounds(first: list[float], second: list[float]) -> list[float]:
    return rounded_bounds(
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[2], second[2]),
        max(first[3], second[3]),
    )


def hue_name(color: list[float]) -> str:
    if len(color) < 3:
        return "unknown"
    hue, saturation, value = colorsys.rgb_to_hsv(
        *[max(0, min(1, channel)) for channel in color[:3]]
    )
    degrees = hue * 360
    if saturation < 0.16:
        return "gray" if value < 0.92 else "neutral"
    if degrees < 18 or degrees >= 345:
        return "red"
    if degrees < 48:
        return "orange"
    if degrees < 75:
        return "yellow"
    if degrees < 165:
        return "green"
    if degrees < 205:
        return "cyan"
    if degrees < 265:
        return "blue"
    if degrees < 330:
        return "purple"
    return "red"


def _raw_point_to_selected(
    point: tuple[float, float], geometry: dict
) -> tuple[float, float]:
    """Convert a raw PDF point to selected-box-local displayed (x, top) space."""
    x, y = point
    left, bottom, right, top = geometry["box"]
    rotation = geometry["rotation"]
    if rotation == 0:
        return x - left, top - y
    if rotation == 90:
        return y - bottom, x - left
    if rotation == 180:
        return right - x, y - bottom
    return top - y, right - x


def _raw_rect_to_selected_bounds(rect: list[float], geometry: dict) -> list[float]:
    left, bottom, right, top = rect
    corners = [
        _raw_point_to_selected((x, y), geometry)
        for x in (left, right)
        for y in (bottom, top)
    ]
    return rounded_bounds(
        min(point[1] for point in corners),
        min(point[0] for point in corners),
        max(point[1] for point in corners),
        max(point[0] for point in corners),
    )


def extract_annotations(
    page, page_number: int, geometry: dict
) -> tuple[list[dict], int]:
    raw_annotations = page.page_obj.attrs.get("Annots")
    annotations = resolve1(raw_annotations) if raw_annotations is not None else []
    operations: list[dict] = []
    ignored = 0
    operation_number = 1

    for reference in annotations or []:
        try:
            annotation = resolve1(reference)
        except Exception:
            ignored += 1
            continue
        subtype = annotation_subtype(annotation.get("Subtype"))
        if subtype == "Popup":
            ignored += 1
            continue
        if subtype == "Text":
            contents = decode_annotation_text(annotation.get("Contents"))
            if re.search(r"(?:Completed|Rejected|Cancelled) set by", contents, re.I):
                ignored += 1
                continue
            if contents.strip():
                rect = [float(value) for value in resolve1(annotation.get("Rect"))]
                bounds = _raw_rect_to_selected_bounds(rect, geometry)
                operations.append(
                    {
                        "id": f"p{page_number:03d}-note-{operation_number:03d}",
                        "kind": "note",
                        "page": page_number,
                        "bounds": bounds,
                        "text": contents,
                        "confidence": 0.3,
                        "status": "review",
                        "enabled": False,
                    }
                )
                operation_number += 1
            else:
                ignored += 1
            continue
        if subtype != "Ink":
            ignored += 1
            continue

        raw_ink = resolve1(annotation.get("InkList")) or []
        strokes = []
        for raw_stroke in raw_ink:
            values = [float(value) for value in resolve1(raw_stroke)]
            points = [
                [
                    round(coordinate, 3)
                    for coordinate in _raw_point_to_selected(
                        (values[index], values[index + 1]), geometry
                    )
                ]
                for index in range(0, len(values) - 1, 2)
            ]
            if len(points) < 2:
                continue
            metrics = stroke_metrics(points)
            strokes.append({"points": points, **metrics})
        if not strokes:
            ignored += 1
            continue

        color = [
            round(float(value), 6) for value in (resolve1(annotation.get("C")) or [])
        ]
        opacity = round(float(annotation.get("CA", 1)), 4)
        border_style = resolve1(annotation.get("BS")) or {}
        stroke_width = round(float(border_style.get("W", 6)), 3)
        consumed: set[int] = set()

        for first_index, first in enumerate(strokes):
            if first_index in consumed:
                continue
            first_linear = (
                first["diagonal"] > 8
                and first["endpoint_distance"] > 5
                and first["path_length"] <= first["endpoint_distance"] * 1.45
                and abs(first["dx"]) > 2
                and abs(first["dy"]) > 2
            )
            if not first_linear:
                continue
            for second_index in range(first_index + 1, len(strokes)):
                if second_index in consumed:
                    continue
                second = strokes[second_index]
                second_linear = (
                    second["diagonal"] > 8
                    and second["endpoint_distance"] > 5
                    and second["path_length"] <= second["endpoint_distance"] * 1.45
                    and abs(second["dx"]) > 2
                    and abs(second["dy"]) > 2
                )
                if (
                    not second_linear
                    or first["dx"] * first["dy"] * second["dx"] * second["dy"] >= 0
                ):
                    continue
                union = union_bounds(first["bounds"], second["bounds"])
                width = union[3] - union[1]
                height = union[2] - union[0]
                center_distance = math.hypot(
                    first["center"][0] - second["center"][0],
                    first["center"][1] - second["center"][1],
                )
                if (
                    min(width, height) < 5
                    or max(width, height) / max(min(width, height), 0.1) > 3
                ):
                    continue
                if center_distance > max(first["diagonal"], second["diagonal"]) * 0.55:
                    continue
                operations.append(
                    {
                        "id": f"p{page_number:03d}-cross-{operation_number:03d}",
                        "kind": "cross",
                        "page": page_number,
                        "bounds": union,
                        "color": color,
                        "hue": hue_name(color),
                        "confidence": 0.94,
                        "status": "ready",
                    }
                )
                operation_number += 1
                consumed.update((first_index, second_index))
                break

        for index, stroke in enumerate(strokes):
            if index in consumed:
                continue
            width = stroke["bounds"][3] - stroke["bounds"][1]
            height = stroke["bounds"][2] - stroke["bounds"][0]
            closed = (
                stroke["diagonal"] > 10
                and stroke["endpoint_distance"] < stroke["diagonal"] * 0.28
                and stroke["path_length"] > stroke["diagonal"] * 2.0
                and 0.45 <= width / max(height, 0.1) <= 2.2
            )
            if closed:
                operations.append(
                    {
                        "id": f"p{page_number:03d}-circle-{operation_number:03d}",
                        "kind": "circle",
                        "page": page_number,
                        "bounds": stroke["bounds"],
                        "color": color,
                        "hue": hue_name(color),
                        "confidence": 0.88,
                        "status": "ready",
                    }
                )
                operation_number += 1
                consumed.add(index)

        remaining = [
            stroke for index, stroke in enumerate(strokes) if index not in consumed
        ]
        if remaining:
            bounds = remaining[0]["bounds"]
            for stroke in remaining[1:]:
                bounds = union_bounds(bounds, stroke["bounds"])
            operations.append(
                {
                    "id": f"p{page_number:03d}-color-{operation_number:03d}",
                    "kind": "color_mark",
                    "page": page_number,
                    "bounds": bounds,
                    "strokes": [
                        {"points": stroke["points"], "bounds": stroke["bounds"]}
                        for stroke in remaining
                    ],
                    "color": color,
                    "hue": hue_name(color),
                    "opacity": opacity,
                    "stroke_width": stroke_width,
                    "confidence": 0.72,
                    "status": "review",
                    "fallback": "review",
                }
            )
            operation_number += 1

    return operations, ignored


def extract(
    clean_path: Path,
    manuscript_path: Path,
    idml_path: Path,
    progress=None,
    printers_marks: bool = False,
    preprocessed_clean_pages: list[dict] | None = None,
    preprocessed_manuscript_pages: list[dict] | None = None,
) -> dict:
    document = parse_idml(idml_path)
    with (
        pdfplumber.open(clean_path) as clean,
        pdfplumber.open(manuscript_path) as manuscript,
    ):
        if len(clean.pages) != len(manuscript.pages):
            raise ValueError(
                f"Page-count mismatch: clean PDF has {len(clean.pages)}, manuscript has {len(manuscript.pages)}"
            )
        if document["page_count"] != len(manuscript.pages):
            raise ValueError(
                f"Page-count mismatch: IDML has {document['page_count']}, PDFs have {len(manuscript.pages)}"
            )
        if preprocessed_clean_pages is not None and len(
            preprocessed_clean_pages
        ) != len(clean.pages):
            raise ValueError(
                "Clean PDF text extraction returned an unexpected page count"
            )
        if preprocessed_manuscript_pages is not None and len(
            preprocessed_manuscript_pages
        ) != len(manuscript.pages):
            raise ValueError(
                "Manuscript PDF text extraction returned an unexpected page count"
            )

        pages = []
        ignored_annotations = 0
        for page_number, (clean_page, manuscript_page) in enumerate(
            zip(clean.pages, manuscript.pages), start=1
        ):
            if progress:
                progress(page_number, len(manuscript.pages), 0, 0, "starting")
            clean_geometry, manuscript_geometry = matching_page_geometries(
                clean_page, manuscript_page, printers_marks
            )
            blank_chars = (
                normalized_preprocessed_characters(
                    preprocessed_clean_pages[page_number - 1]["chars"], clean_geometry
                )
                if preprocessed_clean_pages is not None
                else normalized_characters(clean_page, clean_geometry)
            )
            manuscript_chars = (
                normalized_preprocessed_characters(
                    preprocessed_manuscript_pages[page_number - 1]["chars"],
                    manuscript_geometry,
                )
                if preprocessed_manuscript_pages is not None
                else normalized_characters(manuscript_page, manuscript_geometry)
            )
            additions = subtract_characters(blank_chars, manuscript_chars)
            removed = subtract_characters(manuscript_chars, blank_chars)
            runs = group_into_lines(additions)
            operations = []
            for run_number, run in enumerate(runs, start=1):
                source_edit = overlaps_removed_source(run, removed)
                operations.append(
                    {
                        "id": f"p{page_number:03d}-text-{run_number:03d}",
                        "kind": "text",
                        "page": page_number,
                        **run,
                        "confidence": 0.45 if source_edit else 0.98,
                        "status": "review" if source_edit else "ready",
                        "enabled": not source_edit,
                        **(
                            {
                                "review_reason": "overlaps text changed from the clean PDF"
                            }
                            if source_edit
                            else {}
                        ),
                    }
                )
            annotation_operations, ignored = extract_annotations(
                manuscript_page, page_number, manuscript_geometry
            )
            operations.extend(annotation_operations)
            ignored_annotations += ignored
            pages.append(
                {
                    "page": page_number,
                    "document_page": document["page_names"][page_number - 1],
                    "width": round(float(manuscript_geometry["width"]), 3),
                    "height": round(float(manuscript_geometry["height"]), 3),
                    "trimmed_printer_marks": bool(manuscript_geometry["trimmed"]),
                    "operations": operations,
                }
            )
            if progress:
                progress(
                    page_number,
                    len(manuscript.pages),
                    len(runs),
                    len(annotation_operations),
                )

    counts = Counter(
        operation["kind"] for page in pages for operation in page["operations"]
    )
    review_count = sum(
        operation.get("status") == "review"
        for page in pages
        for operation in page["operations"]
    )
    return {
        "format": "indesign-solutions-v2",
        "version": 2,
        "clean_pdf": clean_path.name,
        "manuscript_pdf": manuscript_path.name,
        "idml": idml_path.name,
        "printers_marks": printers_marks,
        "document": document,
        "summary": {
            "pages": len(pages),
            "operations": sum(counts.values()),
            "text": counts["text"],
            "crosses": counts["cross"],
            "circles": counts["circle"],
            "color_marks": counts["color_mark"],
            "notes": counts["note"],
            "review": review_count,
            "idml_tables": document["table_count"],
            "ignored_annotations": ignored_annotations,
        },
        "pages": pages,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clean_pdf", type=Path)
    parser.add_argument("manuscript_pdf", type=Path)
    parser.add_argument("idml", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument(
        "--printers-marks",
        action="store_true",
        help="Normalize each PDF to its embedded TrimBox before comparing coordinates.",
    )
    args = parser.parse_args()
    try:
        result = extract(
            args.clean_pdf,
            args.manuscript_pdf,
            args.idml,
            printers_marks=args.printers_marks,
        )
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {result['summary']['operations']} operations on {result['summary']['pages']} pages"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
