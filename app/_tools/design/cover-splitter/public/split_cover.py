"""Split cover PDFs into vector outside and optional inside panels."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path, PurePosixPath
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from pypdf import PageObject, PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject

POINTS_PER_MM = 72.0 / 25.4
FIXED_WIDTHS_MM = {
    "A5": 148.0,
    "A4": 210.0,
    "B5": 176.0,
}
WIDTH_TOLERANCE_POINTS = 0.5
ARCHIVE_NAME = "cover-splits.zip"
ProgressCallback = Callable[[int, int, str, str], None]


def mm_to_points(millimetres: float) -> float:
    """Convert millimetres to PDF points."""
    return float(millimetres) * POINTS_PER_MM


def normalize_size_choice(size_choice: str) -> str:
    """Return a canonical size choice or raise for unsupported input."""
    choice = str(size_choice).strip()
    if choice.lower() == "half":
        return "half"

    choice = choice.upper()
    if choice not in FIXED_WIDTHS_MM:
        raise ValueError("Size must be one of A5, A4, B5, or half.")
    return choice


def panel_regions(
    full_width: float,
    size_choice: str,
    tolerance: float = WIDTH_TOLERANCE_POINTS,
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Return ``(left, width)`` regions for back and front panels."""
    width = float(full_width)
    if width <= 0:
        raise ValueError("The source page width must be greater than zero.")

    choice = normalize_size_choice(size_choice)
    if choice == "half":
        panel_width = width / 2.0
        return (0.0, panel_width), (panel_width, panel_width)

    panel_width = mm_to_points(FIXED_WIDTHS_MM[choice])
    required_width = panel_width * 2.0
    if width + float(tolerance) < required_width:
        actual_mm = width / POINTS_PER_MM
        required_mm = required_width / POINTS_PER_MM
        raise ValueError(
            f"The source page is {actual_mm:.2f} mm wide, but {choice} splitting "
            f"requires at least {required_mm:.2f} mm."
        )

    return (0.0, panel_width), (width - panel_width, panel_width)


def create_panel_page(
    source_page: PageObject,
    panel_left: float,
    panel_width: float,
    source_bottom: float,
    source_height: float,
) -> PageObject:
    """Translate one source-page region onto a new, tightly boxed vector page."""
    output_page = PageObject.create_blank_page(
        width=float(panel_width),
        height=float(source_height),
    )
    transform = Transformation().translate(
        tx=-float(panel_left),
        ty=-float(source_bottom),
    )
    output_page.merge_transformed_page(
        source_page,
        transform,
        over=True,
        expand=False,
    )

    output_box = RectangleObject((0, 0, float(panel_width), float(source_height)))
    output_page.mediabox = output_box
    output_page.cropbox = RectangleObject(output_box)
    return output_page


def output_names(original_name: str, include_inside: bool = False) -> tuple[str, ...]:
    """Build safe output names while retaining the original basename stem."""
    basename = PurePosixPath(str(original_name).replace("\\", "/")).name
    stem = Path(basename).stem
    if not basename or not stem or stem in {".", ".."}:
        raise ValueError("Each input PDF must have a valid original filename.")
    names = [f"{stem}_BACK.pdf", f"{stem}_FRONT.pdf"]
    if include_inside:
        names.extend((f"{stem}_FRONT-inside.pdf", f"{stem}_BACK-inside.pdf"))
    return tuple(names)


def _page_geometry(page: PageObject) -> tuple[float, float, float, float]:
    if page.rotation:
        page.transfer_rotation_to_content()
    box = page.mediabox
    return float(box.left), float(box.bottom), float(box.width), float(box.height)


def _write_panel(page: PageObject, region: tuple[float, float], path: Path) -> None:
    left, bottom, _, height = _page_geometry(page)
    output_page = create_panel_page(
        page,
        left + region[0],
        region[1],
        bottom,
        height,
    )
    writer = PdfWriter()
    writer.add_page(output_page)
    with path.open("wb") as output_file:
        writer.write(output_file)


def split_cover_pdf(
    input_path: str | Path,
    original_name: str,
    size_choice: str,
    output_dir: str | Path,
    include_inside: bool = False,
) -> tuple[Path, ...]:
    """Split page 1 and, when requested, both panels from inside-cover page 2."""
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(Path(input_path), strict=False)
    if not reader.pages:
        raise ValueError(f"{original_name} does not contain any PDF pages.")

    outside_page = reader.pages[0]
    outside_left, outside_bottom, outside_width, outside_height = _page_geometry(
        outside_page
    )
    del outside_left, outside_bottom
    back_region, front_region = panel_regions(outside_width, size_choice)
    names = output_names(original_name, include_inside)
    paths = tuple(destination / name for name in names)

    _write_panel(outside_page, back_region, paths[0])
    _write_panel(outside_page, front_region, paths[1])

    if include_inside:
        if len(reader.pages) < 2:
            raise ValueError(
                f"{original_name} does not contain a second inside-cover page."
            )
        inside_page = reader.pages[1]
        inside_left, inside_bottom, inside_width, inside_height = _page_geometry(
            inside_page
        )
        del inside_left, inside_bottom
        inside_left_region, inside_right_region = panel_regions(
            inside_width, size_choice
        )
        if (
            abs(inside_left_region[1] - back_region[1]) > WIDTH_TOLERANCE_POINTS
            or abs(inside_right_region[1] - front_region[1]) > WIDTH_TOLERANCE_POINTS
            or abs(inside_height - outside_height) > WIDTH_TOLERANCE_POINTS
        ):
            raise ValueError(f"{original_name} page 2 dimensions do not match page 1.")
        # The inside spread is imposed in reverse reading order.
        _write_panel(inside_page, inside_left_region, paths[2])
        _write_panel(inside_page, inside_right_region, paths[3])

    return paths


def split_first_page(
    input_path: str | Path,
    original_name: str,
    size_choice: str,
    output_dir: str | Path,
) -> tuple[Path, Path]:
    """Compatibility helper that writes only the outside back and front PDFs."""
    paths = split_cover_pdf(
        input_path,
        original_name,
        size_choice,
        output_dir,
        include_inside=False,
    )
    return paths[0], paths[1]


def _notify(
    callback: ProgressCallback | None,
    completed: int,
    total: int,
    name: str,
    phase: str,
) -> None:
    if callback is not None:
        callback(completed, total, name, phase)


def _validate_inputs(
    input_files: list[Mapping[str, Any]], include_inside: bool
) -> None:
    seen: set[str] = set()
    for input_file in input_files:
        normalize_size_choice(str(input_file["size_choice"]))
        for name in output_names(str(input_file["original_name"]), include_inside):
            key = name.casefold()
            if key in seen:
                raise ValueError(
                    f"More than one input would create an output named {name}."
                )
            seen.add(key)


def split_covers_to_zip(
    input_files: Iterable[Mapping[str, Any]],
    output_dir: str | Path,
    zip_path: str | Path,
    progress: ProgressCallback | None = None,
    include_inside: bool = False,
) -> Path:
    """Split local PDFs using each record's size and package every panel."""
    inputs = list(input_files)
    if not inputs:
        raise ValueError("At least one PDF is required.")
    _validate_inputs(inputs, include_inside)

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    generated: list[Path] = []
    total = len(inputs)

    for index, input_file in enumerate(inputs):
        original_name = str(input_file["original_name"])
        _notify(progress, index, total, original_name, "starting")
        try:
            generated.extend(
                split_cover_pdf(
                    input_file["path"],
                    original_name,
                    str(input_file["size_choice"]),
                    destination,
                    include_inside=include_inside,
                )
            )
        except Exception as error:
            raise ValueError(f"Could not split {original_name}: {error}") from error
        _notify(progress, index + 1, total, original_name, "finished")

    archive_path = Path(zip_path)
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    _notify(progress, total, total, ARCHIVE_NAME, "packaging")
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        for generated_path in generated:
            archive.write(generated_path, arcname=generated_path.name)
    return archive_path


def main(argv: list[str] | None = None) -> int:
    """Run the splitter outside the browser for local fixtures or debugging."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path, help="Source cover PDFs")
    parser.add_argument(
        "--size",
        required=True,
        choices=("A5", "A4", "B5", "half"),
        help="Panel width preset",
    )
    parser.add_argument(
        "--include-inside",
        action="store_true",
        help="Also split page 2 into FRONT-inside and BACK-inside PDFs",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("cover-splits"),
        help="Directory for the two PDFs per source",
    )
    args = parser.parse_args(argv)

    records = [
        {
            "path": input_path,
            "original_name": input_path.name,
            "size_choice": args.size,
        }
        for input_path in args.inputs
    ]
    archive_path = args.output_dir / ARCHIVE_NAME
    split_covers_to_zip(
        records,
        args.output_dir,
        archive_path,
        include_inside=args.include_inside,
    )
    print(archive_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
