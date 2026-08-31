import fs from "node:fs/promises";
import sharp from "sharp";

const input = process.argv[2] || "/private/tmp/beck-kg/Beck_KG_V1_present_0p5.tif";
const output = new URL("../code/data/koppen-climate.json", import.meta.url);
const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
const colors = [
  [0, 0, 255], [0, 120, 255], [70, 170, 250],
  [255, 0, 0], [255, 150, 150], [245, 165, 0], [255, 220, 100],
  [255, 255, 0], [200, 200, 0], [150, 150, 0], [150, 255, 150], [100, 200, 100], [50, 150, 50], [200, 255, 80], [100, 255, 80], [50, 200, 0],
  [255, 0, 255], [200, 0, 200], [150, 50, 150], [150, 100, 150], [170, 175, 255], [90, 120, 220], [75, 80, 180], [50, 0, 135], [0, 255, 255], [55, 200, 255], [0, 125, 125], [0, 70, 95],
  [178, 178, 178], [102, 102, 102],
];
const colorClass = new Map(colors.map((rgb, index) => [rgb.join(","), index + 1]));
const broad = (value) => value <= 3 ? "A" : value <= 7 ? "B" : value <= 16 ? "C" : value <= 28 ? "D" : "E";
const runs = [];
for (let y = 0; y < info.height; y += 1) {
  let start = 0, active = null;
  for (let x = 0; x <= info.width; x += 1) {
    const offset = (y * info.width + Math.min(x, info.width - 1)) * info.channels;
    const climateClass = x < info.width ? colorClass.get(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`) : undefined;
    const group = climateClass ? broad(climateClass) : null;
    if (group !== active) {
      if (active) runs.push([active, start * .5 - 180, 90 - (y + 1) * .5, x * .5 - 180, 90 - y * .5]);
      active = group;
      start = x;
    }
  }
}
const result = {
  source: {
    title: "Present-day Köppen–Geiger climate classification",
    authors: "Beck et al. (2018)",
    period: "1980–2016",
    resolution: "0.5° majority-resampled grid",
    doi: "10.1038/sdata.2018.214",
    license: "CC BY 4.0",
  },
  groups: {
    A: { label: "Tropical", color: "#e45745" },
    B: { label: "Arid", color: "#e6ad3c" },
    C: { label: "Temperate", color: "#69ad63" },
    D: { label: "Cold", color: "#4f83cc" },
    E: { label: "Polar", color: "#8d67b1" },
  },
  runs,
};
await fs.writeFile(output, JSON.stringify(result));
console.log(`Wrote ${runs.length} climate-zone runs to ${output.pathname}`);
