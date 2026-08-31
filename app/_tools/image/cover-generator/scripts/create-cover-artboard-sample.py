from pathlib import Path
from io import BytesIO
import sys

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

PAGE_W, PAGE_H = 960, 540
BG = "#e6e6e6"
GRID = "#cccccc"
ORANGE = "#ff661a"
WHITE = "#e6e6e6"

FILES = [
    "BI5_Cover_26.06.png",
    "GI5_Cover_26.06.png",
    "MI1_Cover_26.06.png",
    "SEM3_Cover_26.06.png",
    "SI4_Cover_26.png",
    "II6_Cover_26.06.png",
    "LLR7_Cover_26.06.png",
    "BI6_Cover_26.06.png",
    "GI4_Cover_26.06.png",
    "FI7_Cover_22.06.png",
    "FI6_Cover_26.06.png",
    "BI7_Cover_26.06.png",
]


def register_fonts():
    pdfmetrics.registerFont(TTFont("Verdana", "/System/Library/Fonts/Supplemental/Verdana.ttf"))
    pdfmetrics.registerFont(TTFont("Verdana-Bold", "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"))


def optimized_cover(path: Path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((900, 1200), Image.Resampling.LANCZOS)
    stream = BytesIO()
    image.save(stream, format="JPEG", quality=88, optimize=True, progressive=True)
    stream.seek(0)
    return ImageReader(stream)


def make_pdf(source: Path, output: Path, count: int):
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    if count not in {3, 7, 10, 12}:
        raise ValueError("count must be one of 3, 7, 10 or 12")
    covers = [source / name for name in FILES[:count]]
    missing = [str(path) for path in covers if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing sample covers: " + ", ".join(missing))

    pdf = canvas.Canvas(str(output), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    pdf.setTitle("Taktik Robot - Cover Artboard Sample")
    pdf.setAuthor("Taktik Robot")
    pdf.setFillColor(BG)
    pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.45)
    for x in range(0, PAGE_W + 1, 72):
        pdf.line(x, 0, x, PAGE_H)
    for y in range(0, PAGE_H + 1, 72):
        pdf.line(0, y, PAGE_W, y)

    rows = (count + 3) // 4
    cell_w, cell_h = 190, 128
    gap_x, gap_y = 20, 12
    total_h = rows * cell_h + (rows - 1) * gap_y
    grid_bottom = 68 + (432 - total_h) / 2
    grid_top = grid_bottom + total_h
    for index, path in enumerate(covers):
        row, col = divmod(index, 4)
        row_start = row * 4
        columns = min(4, count - row_start)
        row_width = columns * cell_w + (columns - 1) * gap_x
        row_left = (PAGE_W - row_width) / 2
        cell_left = row_left + col * (cell_w + gap_x)
        cell_bottom = grid_top - (row + 1) * cell_h - row * gap_y
        image_h = 110
        image_w = image_h * 0.75
        number_w = 25
        group_w = number_w + 8 + image_w
        x = cell_left + (cell_w - group_w) / 2
        y = cell_bottom + (cell_h - image_h) / 2

        pdf.setFillColor("#b8b8b8")
        pdf.rect(x + number_w + 11, y - 3, image_w, image_h, fill=1, stroke=0)
        pdf.drawImage(optimized_cover(path), x + number_w + 8, y, image_w, image_h, preserveAspectRatio=True, anchor="c", mask="auto")
        pdf.setFillColor(ORANGE)
        pdf.rect(x, y + image_h - 25, number_w, 25, fill=1, stroke=0)
        pdf.setFillColor("#1a1a1a")
        pdf.setFont("Verdana-Bold", 9)
        pdf.drawCentredString(x + number_w / 2, y + image_h - 16.5, f"{index + 1:02d}")

    pdf.setStrokeColor(ORANGE)
    pdf.setLineWidth(1)
    pdf.line(31, 10, 31, 38)
    pdf.line(17, 24, 45, 24)
    pdf.circle(31, 24, 6.5, fill=0, stroke=1)
    pdf.setFont("Verdana-Bold", 9)
    pdf.setFillColor(ORANGE)
    pdf.drawString(55, 20, "TAKTIK")
    pdf.setFont("Verdana", 9)
    pdf.setFillColor("#1a1a1a")
    pdf.drawString(98, 20, "ROBOT")
    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: create-cover-artboard-sample.py SOURCE_FOLDER OUTPUT_PDF COUNT")
    make_pdf(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]))
