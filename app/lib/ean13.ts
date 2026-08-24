const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

// Verdana Regular digit outlines, reduced to the ten glyphs required by EAN-13.
// Coordinates are from the installed Verdana face (2048 units/em); no font is embedded in the PDF.
const VERDANA_DIGITS: Record<string, string> = {
  "0": "M1167-745Q1167-344 1042-157Q916 31 652 31Q384 31 261-159Q137-349 137-743Q137-1140 262-1330Q387-1519 652-1519Q920-1519 1044-1327Q1167-1134 1167-745ZM904-291Q939-372 952-482Q964-591 964-745Q964-897 952-1009Q939-1121 903-1199Q868-1276 808-1315Q747-1354 652-1354Q558-1354 497-1315Q435-1276 399-1197Q365-1123 353-1004Q340-885 340-743Q340-587 351-482Q362-377 398-294Q431-216 492-175Q552-134 652-134Q746-134 808-173Q870-212 904-291Z",
  "1": "M1084-152L1084 0L278 0L278-152L588-152L588-1150L278-1150L278-1286Q341-1286 413-1297Q485-1307 522-1327Q568-1352 595-1391Q621-1429 625-1494L780-1494L780-152L1084-152Z",
  "2": "M1169-171L1169 0L161 0L161-209Q266-299 372-389Q477-479 568-568Q760-754 831-864Q902-973 902-1100Q902-1216 826-1282Q749-1347 612-1347Q521-1347 415-1315Q309-1283 208-1217L198-1217L198-1427Q269-1462 388-1491Q506-1520 617-1520Q846-1520 976-1410Q1106-1299 1106-1110Q1106-1025 1085-952Q1063-878 1021-812Q982-750 930-690Q877-630 802-557Q695-452 581-354Q467-255 368-171L1169-171Z",
  "3": "M1038-717Q1086-674 1117-609Q1148-544 1148-441Q1148-339 1111-254Q1074-169 1007-106Q932-36 831-3Q729 31 608 31Q484 31 364 2Q244-28 167-63L167-272L182-272Q267-216 382-179Q497-142 604-142Q667-142 738-163Q809-184 853-225Q899-269 922-322Q944-375 944-456Q944-536 919-589Q893-641 848-671Q803-702 739-714Q675-725 601-725L511-725L511-891L581-891Q733-891 824-955Q914-1018 914-1140Q914-1194 891-1235Q868-1275 827-1301Q784-1327 735-1337Q686-1347 624-1347Q529-1347 422-1313Q315-1279 220-1217L210-1217L210-1426Q281-1461 400-1491Q518-1520 629-1520Q738-1520 821-1500Q904-1480 971-1436Q1043-1388 1080-1320Q1117-1252 1117-1161Q1117-1037 1030-945Q942-852 823-828L823-814Q871-806 933-781Q995-755 1038-717Z",
  "4": "M1203-579L1203-419L982-419L982 0L790 0L790-419L77-419L77-649L798-1489L982-1489L982-579L1203-579ZM213-579L790-579L790-1251L213-579Z",
  "5": "M1157-473Q1157-369 1119-274Q1081-179 1015-114Q943-44 844-7Q744 31 613 31Q491 31 378 6Q265-20 187-56L187-267L201-267Q283-215 393-179Q503-142 609-142Q680-142 747-162Q813-182 865-232Q909-275 932-335Q954-395 954-474Q954-551 928-604Q901-657 854-689Q802-727 728-743Q653-758 561-758Q473-758 392-746Q310-734 251-722L251-1489L1147-1489L1147-1314L444-1314L444-918Q487-922 532-924Q577-926 610-926Q731-926 822-906Q913-885 989-833Q1069-778 1113-691Q1157-604 1157-473Z",
  "6": "M1191-483Q1191-256 1042-113Q892 31 675 31Q565 31 475-3Q385-37 316-104Q230-187 184-324Q137-461 137-654Q137-852 180-1005Q222-1158 315-1277Q403-1390 542-1454Q681-1517 866-1517Q925-1517 965-1512Q1005-1507 1046-1494L1046-1303L1036-1303Q1008-1318 952-1332Q895-1345 836-1345Q621-1345 493-1211Q365-1076 344-847Q428-898 510-925Q591-951 698-951Q793-951 866-934Q938-916 1014-863Q1102-802 1147-709Q1191-616 1191-483ZM988-475Q988-568 961-629Q933-690 870-735Q824-767 768-777Q712-787 651-787Q566-787 493-767Q420-747 343-705Q341-683 340-663Q339-642 339-611Q339-453 372-362Q404-270 461-217Q507-173 561-153Q614-132 677-132Q822-132 905-221Q988-309 988-475Z",
  "7": "M1173-1489L1173-1266L499 0L285 0L1002-1314L154-1314L154-1489L1173-1489Z",
  "8": "M1180-415Q1180-222 1030-94Q879 34 651 34Q409 34 266-91Q122-216 122-411Q122-535 194-636Q266-736 397-795L397-801Q277-865 220-941Q162-1017 162-1131Q162-1299 300-1411Q438-1523 651-1523Q874-1523 1007-1416Q1140-1309 1140-1144Q1140-1043 1077-946Q1014-848 892-793L892-787Q1032-727 1106-639Q1180-551 1180-415ZM943-1142Q943-1249 861-1313Q778-1376 650-1376Q524-1376 444-1316Q363-1256 363-1154Q363-1082 404-1030Q444-977 526-936Q563-918 633-889Q702-860 768-841Q867-907 905-978Q943-1049 943-1142ZM974-396Q974-488 934-544Q893-599 775-655Q728-677 672-696Q616-715 523-749Q433-700 379-616Q324-532 324-426Q324-291 417-203Q510-115 653-115Q799-115 887-190Q974-265 974-396Z",
  "9": "M1167-834Q1167-639 1123-480Q1078-321 988-209Q897-95 760-33Q623 29 438 29Q386 29 340 24Q294 18 258 6L258-185L268-185Q297-170 350-157Q403-143 468-143Q689-143 815-276Q940-408 960-641Q867-585 785-561Q703-537 606-537Q514-537 440-555Q365-573 290-625Q202-686 158-780Q113-874 113-1005Q113-1233 263-1376Q413-1519 629-1519Q737-1519 829-1486Q921-1452 990-1385Q1075-1302 1121-1172Q1167-1041 1167-834ZM965-877Q965-1032 933-1126Q901-1220 845-1272Q798-1317 744-1337Q690-1356 627-1356Q483-1356 400-1266Q316-1176 316-1013Q316-918 343-858Q370-798 434-753Q479-722 533-712Q587-701 653-701Q731-701 811-722Q891-743 961-783Q962-804 964-825Q965-845 965-877Z",
};

export type EanResult = { digits: string; source: "ISBN-10" | "ISBN-13"; suppliedCheckDigitValid: boolean };

export function normalizeIsbn(value: string): EanResult {
  const cleaned = value.toUpperCase().replace(/[\s-]/g, "");
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(cleaned)) throw new Error("Enter a valid 10- or 13-digit ISBN.");
  if (cleaned.length === 10) {
    const expected10 = [...cleaned.slice(0, 9)].reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
    const check10 = cleaned[9] === "X" ? 10 : Number(cleaned[9]);
    if ((expected10 + check10) % 11 !== 0) throw new Error("The ISBN-10 check digit is not valid.");
    const body = `978${cleaned.slice(0, 9)}`;
    return { digits: body + eanCheckDigit(body), source: "ISBN-10", suppliedCheckDigitValid: true };
  }
  if (!cleaned.startsWith("978") && !cleaned.startsWith("979")) throw new Error("An ISBN-13 must begin with 978 or 979.");
  const expected = eanCheckDigit(cleaned.slice(0, 12));
  if (cleaned[12] !== expected) throw new Error(`The check digit should be ${expected}, not ${cleaned[12]}.`);
  return { digits: cleaned, source: "ISBN-13", suppliedCheckDigitValid: true };
}

export function eanCheckDigit(twelveDigits: string) {
  const sum = [...twelveDigits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export function eanModules(digits: string) {
  const parity = PARITY[Number(digits[0])];
  const left = [...digits.slice(1, 7)].map((digit, index) => (parity[index] === "L" ? L_CODES : G_CODES)[Number(digit)]).join("");
  const right = [...digits.slice(7)].map((digit) => R_CODES[Number(digit)]).join("");
  return `101${left}01010${right}101`;
}

function fmt(n: number) { return Number(n.toFixed(3)).toString(); }

function digitPath(digit: string, x: number, baseline: number, size: number) {
  const tokens = VERDANA_DIGITS[digit].match(/[MLQZ]|-?\d+(?:\.\d+)?/g) || [];
  const scale = size / 2048;
  let i = 0, command = "", currentX = 0, currentY = 0, output = "";
  const point = () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
  while (i < tokens.length) {
    if (/^[MLQZ]$/.test(tokens[i])) command = tokens[i++];
    if (command === "Z") { output += "h\n"; command = ""; continue; }
    if (command === "M" || command === "L") {
      const p = point(); currentX = p.x; currentY = p.y;
      output += `${fmt(x + p.x * scale)} ${fmt(baseline - p.y * scale)} ${command === "M" ? "m" : "l"}\n`;
    } else if (command === "Q") {
      const control = point(), end = point();
      const c1x = currentX + (2 / 3) * (control.x - currentX), c1y = currentY + (2 / 3) * (control.y - currentY);
      const c2x = end.x + (2 / 3) * (control.x - end.x), c2y = end.y + (2 / 3) * (control.y - end.y);
      output += `${fmt(x + c1x * scale)} ${fmt(baseline - c1y * scale)} ${fmt(x + c2x * scale)} ${fmt(baseline - c2y * scale)} ${fmt(x + end.x * scale)} ${fmt(baseline - end.y * scale)} c\n`;
      currentX = end.x; currentY = end.y;
    }
  }
  return output;
}

export function createEan13Pdf(digits: string) {
  const mm = 72 / 25.4, width = 37.29 * mm, height = 25.93 * mm, moduleWidth = 0.33 * mm;
  const barTop = height - 0.75 * mm, normalBottom = 4.1 * mm, guardBottom = 2.8 * mm;
  const startX = 3.63 * mm;
  const modules = eanModules(digits);
  let content = "0 0 0 1 k\n"; // DeviceCMYK: C0 M0 Y0 K100
  for (let index = 0; index < modules.length; index++) {
    if (modules[index] !== "1") continue;
    const guard = index < 3 || (index >= 45 && index < 50) || index >= 92;
    const bottom = guard ? guardBottom : normalBottom;
    content += `${fmt(startX + index * moduleWidth)} ${fmt(bottom)} ${fmt(moduleWidth)} ${fmt(barTop - bottom)} re f\n`;
  }
  const fontSize = 7.55;
  const placements: Array<[string, number]> = [[digits[0], 0.7 * mm]];
  for (let index = 0; index < 6; index++) placements.push([digits[index + 1], startX + (3 + index * 7 + 3.5) * moduleWidth - (1302 / 2048 * fontSize) / 2]);
  for (let index = 0; index < 6; index++) placements.push([digits[index + 7], startX + (50 + index * 7 + 3.5) * moduleWidth - (1302 / 2048 * fontSize) / 2]);
  for (const [digit, x] of placements) content += digitPath(digit, x, 0.72 * mm, fontSize) + "f\n";

  const encoder = new TextEncoder();
  const streamLength = encoder.encode(content).length;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(height)}] /Resources << /ProcSet [/PDF] >> /Contents 4 0 R >>`,
    `<< /Length ${streamLength} >>\nstream\n${content}endstream`,
    "<< /Title (EAN-13 ISBN barcode) /Creator (Taktik Robot) /Subject (Vector EAN-13; outlined Verdana digits; DeviceCMYK 0 0 0 1) >>",
  ];
  let pdf = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = encoder.encode(pdf).length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([encoder.encode(pdf)], { type: "application/pdf" });
}
