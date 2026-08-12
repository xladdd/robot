#!/usr/bin/env python3
"""Extract text present in a solutions PDF but absent from a blank PDF.

The output JSON is consumed by import_solution_text.jsx in Adobe InDesign.
PDF coordinates are stored in points with a top-left origin.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import pdfplumber


POSITION_TOLERANCE = 0.8
LINE_TOLERANCE = 4.0


def close(a: float, b: float, tolerance: float = POSITION_TOLERANCE) -> bool:
    return abs(a - b) <= tolerance


def same_character(a: dict, b: dict) -> bool:
    """Return True when two extracted glyphs represent the same page content."""
    return (
        a.get("text") == b.get("text")
        and close(float(a["x0"]), float(b["x0"]))
        and close(float(a["top"]), float(b["top"]))
        and close(float(a["x1"]), float(b["x1"]))
        and close(float(a["bottom"]), float(b["bottom"]))
    )


def subtract_characters(blank_chars: list[dict], solution_chars: list[dict]) -> list[dict]:
    """Multiset subtraction with positional matching."""
    buckets: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for index, char in enumerate(blank_chars):
        buckets[str(char.get("text", ""))].append((index, char))

    used: set[int] = set()
    additions: list[dict] = []
    for char in solution_chars:
        candidates = buckets.get(str(char.get("text", "")), [])
        match_index = None
        match_distance = math.inf
        for index, candidate in candidates:
            if index in used or not same_character(candidate, char):
                continue
            distance = abs(candidate["x0"] - char["x0"]) + abs(candidate["top"] - char["top"])
            if distance < match_distance:
                match_index = index
                match_distance = distance
        if match_index is None:
            additions.append(char)
        else:
            used.add(match_index)
    return additions


def group_into_lines(chars: list[dict]) -> list[dict]:
    """Combine added glyphs on the same baseline into positioned text runs."""
    chars = sorted(chars, key=lambda c: (round(float(c["top"]), 1), float(c["x0"])))
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
        line.sort(key=lambda c: float(c["x0"]))
        current: list[dict] = []
        previous_visible: dict | None = None
        for char in line:
            is_visible = bool(str(char.get("text", "")).strip())
            if not current:
                current = [char]
                if is_visible:
                    previous_visible = char
                continue
            typical_size = max(
                float((previous_visible or char).get("size", 10)),
                float(char.get("size", 10)),
            )
            visible_gap = (
                float(char["x0"]) - float(previous_visible["x1"])
                if is_visible and previous_visible is not None
                else 0
            )
            # A long gap is a separate answer box/column even when the PDF contains
            # literal space glyphs spanning it.
            if is_visible and previous_visible is not None and visible_gap > max(typical_size * 0.5, 6.0):
                run = make_run(current)
                if run:
                    runs.append(run)
                current = [char]
            else:
                current.append(char)
            if is_visible:
                previous_visible = char
        if current:
            run = make_run(current)
            if run:
                runs.append(run)
    return sorted(runs, key=lambda r: (r["top"], r["x0"]))


def make_run(chars: list[dict]) -> dict | None:
    visible = [c for c in chars if str(c.get("text", "")).strip()]
    if not visible:
        return None
    return {
        "text": "".join(str(c.get("text", "")) for c in chars).strip(),
        "x0": round(min(float(c["x0"]) for c in visible), 3),
        "top": round(min(float(c["top"]) for c in visible), 3),
        "x1": round(max(float(c["x1"]) for c in visible), 3),
        "bottom": round(max(float(c["bottom"]) for c in visible), 3),
        "source_size": round(max(float(c.get("size", 0)) for c in visible), 3),
    }


def extract(blank_path: Path, solutions_path: Path, progress=None) -> dict:
    with pdfplumber.open(blank_path) as blank, pdfplumber.open(solutions_path) as solutions:
        if len(blank.pages) != len(solutions.pages):
            raise ValueError(
                f"Page-count mismatch: blank has {len(blank.pages)}, solutions has {len(solutions.pages)}"
            )

        pages = []
        for page_index, (blank_page, solutions_page) in enumerate(
            zip(blank.pages, solutions.pages), start=1
        ):
            if not close(blank_page.width, solutions_page.width, 0.05) or not close(
                blank_page.height, solutions_page.height, 0.05
            ):
                raise ValueError(f"Page-size mismatch on page {page_index}")
            additions = subtract_characters(blank_page.chars, solutions_page.chars)
            pages.append(
                {
                    "page": page_index,
                    "width": round(float(solutions_page.width), 3),
                    "height": round(float(solutions_page.height), 3),
                    "runs": group_into_lines(additions),
                }
            )
            if progress:
                progress(page_index, len(blank.pages), len(additions), len(pages[-1]["runs"]))

    return {
        "format": "indesign-solution-text-v1",
        "blank_pdf": blank_path.name,
        "solutions_pdf": solutions_path.name,
        "pages": pages,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract positioned text added between a blank and solutions PDF."
    )
    parser.add_argument("blank_pdf", type=Path)
    parser.add_argument("solutions_pdf", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    for path in (args.blank_pdf, args.solutions_pdf):
        if not path.is_file():
            parser.error(f"PDF not found: {path}")

    try:
        result = extract(args.blank_pdf, args.solutions_pdf)
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    run_count = sum(len(page["runs"]) for page in result["pages"])
    populated_pages = sum(bool(page["runs"]) for page in result["pages"])
    print(f"Wrote {run_count} text runs on {populated_pages} pages to {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
