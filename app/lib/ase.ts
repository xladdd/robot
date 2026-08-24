export type AseSwatch = { name: string; hex: string; model: "RGB" | "CMYK" | "LAB" | "Gray"; values: number[]; group: string };

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function hex(rgb: number[]) { return `#${rgb.map((value) => Math.round(clamp(value) * 255).toString(16).padStart(2, "0")).join("")}`; }
function labToRgb([l, a, b]: number[]) {
  let y = (l + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const pivot = (value: number) => value ** 3 > .008856 ? value ** 3 : (value - 16 / 116) / 7.787;
  x = 0.96422 * pivot(x); y = pivot(y); z = 0.82521 * pivot(z);
  let r = x * 3.1338561 + y * -1.6168667 + z * -.4906146;
  let g = x * -.9787684 + y * 1.9161415 + z * .033454;
  let blue = x * .0719453 + y * -.2289914 + z * 1.4052427;
  const gamma = (value: number) => value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;
  r = gamma(r); g = gamma(g); blue = gamma(blue);
  return [r, g, blue];
}

export function parseAse(buffer: ArrayBuffer): AseSwatch[] {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== "ASEF") throw new Error("This is not a valid Adobe Swatch Exchange file.");
  let offset = 8;
  const blockCount = view.getUint32(offset); offset += 4;
  const swatches: AseSwatch[] = [];
  const groups: string[] = [];
  const readName = (end: number) => {
    if (offset + 2 > end) throw new Error("The ASE file is truncated.");
    const length = view.getUint16(offset); offset += 2;
    let value = "";
    for (let index = 0; index < Math.max(0, length - 1); index += 1) { if (offset + 2 > end) throw new Error("The ASE file is truncated."); value += String.fromCharCode(view.getUint16(offset)); offset += 2; }
    if (length) offset += 2;
    return value.trim();
  };
  for (let block = 0; block < blockCount && offset + 6 <= view.byteLength; block += 1) {
    const type = view.getUint16(offset), size = view.getUint32(offset + 2); offset += 6;
    const end = offset + size;
    if (end > view.byteLength) throw new Error("The ASE file contains a truncated block.");
    if (type === 0xc001) groups.push(readName(end));
    else if (type === 0xc002) groups.pop();
    else if (type === 0x0001) {
      const name = readName(end) || `Swatch ${swatches.length + 1}`;
      if (offset + 4 > end) throw new Error("The ASE colour block is truncated.");
      const tag = String.fromCharCode(...new Uint8Array(buffer, offset, 4)); offset += 4;
      const count = tag === "RGB " || tag === "LAB " ? 3 : tag === "CMYK" ? 4 : tag === "Gray" ? 1 : 0;
      if (!count || offset + count * 4 > end) { offset = end; continue; }
      const values = Array.from({ length: count }, () => { const value = view.getFloat32(offset); offset += 4; return value; });
      const rgb = tag === "RGB " ? values : tag === "CMYK" ? [1 - Math.min(1, values[0] + values[3]), 1 - Math.min(1, values[1] + values[3]), 1 - Math.min(1, values[2] + values[3])] : tag === "LAB " ? labToRgb(values) : [values[0], values[0], values[0]];
      swatches.push({ name, hex: hex(rgb), model: tag.trim() as AseSwatch["model"], values, group: groups.at(-1) || "" });
    }
    offset = end;
  }
  if (!swatches.length) throw new Error("No supported solid RGB, CMYK, Lab, or Gray swatches were found.");
  return swatches.slice(0, 24);
}
