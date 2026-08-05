import json
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_blocks(document):
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


source = Path(sys.argv[1])
destination = Path(sys.argv[2])
document = Document(source)
chapters = []
current = None

for block in iter_blocks(document):
    if isinstance(block, Paragraph):
        style = block.style.name if block.style else "Normal"
        text = block.text.strip()
        images = []
        for blip in block._p.xpath(".//a:blip"):
            relationship_id = blip.get(qn("r:embed"))
            if relationship_id:
                filename = document.part.related_parts[relationship_id].partname.rsplit("/", 1)[-1]
                images.append(f"/design-manual/media/{filename}")

        if style == "Heading 1":
            current = {"title": text, "blocks": []}
            chapters.append(current)
            continue
        if current is None:
            continue
        if images:
            current["blocks"].append({"type": "images", "images": images, "text": text, "style": style})
        elif text:
            kind = {
                "Heading 2": "h2",
                "Heading 3": "h3",
                "Subtitle": "caption",
                "List Bullet": "bullet",
            }.get(style, "paragraph")
            current["blocks"].append({"type": kind, "text": text})
    else:
        if current is None:
            continue
        rows = [[cell.text.strip() for cell in row.cells] for row in block.rows]
        current["blocks"].append({"type": "table", "rows": rows})

destination.write_text(json.dumps({"chapters": chapters}, ensure_ascii=False, indent=2), encoding="utf-8")
