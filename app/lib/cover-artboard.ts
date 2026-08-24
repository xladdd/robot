type ArtboardJpeg = { number: number; bytes: Uint8Array; width: number; height: number };
type ArtboardCover = { number: number; data: string };

const encoder = new TextEncoder();

function text(value: string) {
  return encoder.encode(value);
}

function join(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function object(id: number, body: Uint8Array | string) {
  return join([text(`${id} 0 obj\n`), typeof body === "string" ? text(body) : body, text("\nendobj\n")]);
}

function imageObject(id: number, image: ArtboardJpeg) {
  return object(id, join([
    text(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
    image.bytes,
    text("\nendstream"),
  ]));
}

export function buildCoverArtboardPdf(images: ArtboardJpeg[]) {
  const pageWidth = 960;
  const pageHeight = 540;
  const imageStartId = 6;
  const contentId = imageStartId + images.length;
  const resources = images.map((_, index) => `/Im${index + 1} ${imageStartId + index} 0 R`).join(" ");
  const commands = [
    "q 0.902 0.902 0.902 rg 0 0 960 540 re f Q",
    "q 0.80 0.80 0.80 RG 0.45 w",
    ...Array.from({ length: 15 }, (_, index) => `${index * 72} 0 m ${index * 72} 540 l S`),
    ...Array.from({ length: 9 }, (_, index) => `0 ${index * 72} m 960 ${index * 72} l S`),
    "Q",
  ];
  const rows = Math.max(1, Math.ceil(images.length / 4));
  const cellWidth = 190;
  const cellHeight = 128;
  const gapX = 20;
  const gapY = 12;
  const totalHeight = rows * cellHeight + (rows - 1) * gapY;
  const gridBottom = 68 + (432 - totalHeight) / 2;
  const gridTop = gridBottom + totalHeight;

  images.forEach((image, index) => {
    const row = Math.floor(index / 4);
    const rowStart = row * 4;
    const columns = Math.min(4, images.length - rowStart);
    const rowWidth = columns * cellWidth + (columns - 1) * gapX;
    const rowLeft = (pageWidth - rowWidth) / 2;
    const column = index % 4;
    const cellLeft = rowLeft + column * (cellWidth + gapX);
    const cellBottom = gridTop - (row + 1) * cellHeight - row * gapY;
    const imageHeight = 110;
    const imageWidth = imageHeight * 0.75;
    const numberWidth = 25;
    const groupWidth = numberWidth + 8 + imageWidth;
    const x = cellLeft + (cellWidth - groupWidth) / 2;
    const y = cellBottom + (cellHeight - imageHeight) / 2;
    const number = String(image.number).padStart(2, "0");
    commands.push(
      `q 0.72 0.72 0.72 rg ${x + numberWidth + 11} ${y - 3} ${imageWidth} ${imageHeight} re f Q`,
      `q ${imageWidth} 0 0 ${imageHeight} ${x + numberWidth + 8} ${y} cm /Im${index + 1} Do Q`,
      `q 1 0.31 0.055 rg ${x} ${y + imageHeight - 25} ${numberWidth} 25 re f Q`,
      `BT /F2 10 Tf 0.03 0.04 0.05 rg ${x + 6.2} ${y + imageHeight - 16.5} Td (${number}) Tj ET`,
    );
  });

  commands.push(
    "q 1 0.31 0.055 RG 1 w 31 10 m 31 38 l S 17 24 m 45 24 l S 37.5 24 m 37.5 27.59 34.59 30.5 31 30.5 c 27.41 30.5 24.5 27.59 24.5 24 c 24.5 20.41 27.41 17.5 31 17.5 c 34.59 17.5 37.5 20.41 37.5 24 c S Q",
    "BT /F2 10 Tf 1 Tc 1 0.31 0.055 rg 55 20 Td (TAKTIK) Tj ET",
    "BT /F1 10 Tf 1 Tc 0.10 0.10 0.10 rg 101 20 Td (ROBOT) Tj ET",
  );
  const content = text(`${commands.join("\n")}\n`);
  const objects = [
    object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << ${resources} >> >> /Contents ${contentId} 0 R >>`),
    object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
    ...images.map((image, index) => imageObject(imageStartId + index, image)),
    object(contentId, join([text(`<< /Length ${content.length} >>\nstream\n`), content, text("endstream")])),
  ];
  const header = text("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [];
  let offset = header.length;
  for (const item of objects) { offsets.push(offset); offset += item.length; }
  const xrefOffset = offset;
  const xref = text(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return join([header, ...objects, xref]);
}

async function dataUrlToJpeg(cover: ArtboardCover): Promise<ArtboardJpeg> {
  const image = new Image();
  image.src = cover.data;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#07101a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  const bytes = new Uint8Array(await (await fetch(canvas.toDataURL("image/jpeg", 0.92))).arrayBuffer());
  return { number: cover.number, bytes, width: canvas.width, height: canvas.height };
}

export async function createCoverArtboardPdf(covers: ArtboardCover[]) {
  return buildCoverArtboardPdf(await Promise.all(covers.slice(0, 12).map(dataUrlToJpeg)));
}
