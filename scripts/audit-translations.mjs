import fs from "node:fs";
import ts from "typescript";

const filename = new URL("../app/content/ui.ts", import.meta.url);
const source = ts.createSourceFile("ui.ts", fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const dictionaries = new Set(["copy", "coverUi", "figureUi", "solutionsUi", "barcodeUi", "contextualHelp"]);
let failures = 0;

function propertyName(property) {
  const name = property.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) ? name.text : null;
}

function findProperty(object, name) {
  return object.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property) === name)?.initializer;
}

function collectPaths(node, prefix = "") {
  const paths = new Set();
  if (!ts.isObjectLiteralExpression(node)) return paths;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property);
    if (!name) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    paths.add(path);
    if (ts.isObjectLiteralExpression(property.initializer)) {
      for (const nested of collectPaths(property.initializer, path)) paths.add(nested);
    }
  }
  return paths;
}

for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !dictionaries.has(declaration.name.text) || !declaration.initializer) continue;
    const root = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
    if (!ts.isObjectLiteralExpression(root)) continue;
    const english = findProperty(root, "en");
    const czech = findProperty(root, "cs");
    if (!english || !czech) continue;
    const enPaths = collectPaths(english);
    const csPaths = collectPaths(czech);
    const missingCs = [...enPaths].filter((path) => !csPaths.has(path));
    const missingEn = [...csPaths].filter((path) => !enPaths.has(path));
    if (missingCs.length || missingEn.length) {
      failures += 1;
      console.error(`${declaration.name.text}: Czech missing [${missingCs.join(", ")}]; English missing [${missingEn.join(", ")}]`);
    } else {
      console.log(`${declaration.name.text}: ${enPaths.size} matching translation paths`);
    }
  }
}

process.exitCode = failures ? 1 : 0;
