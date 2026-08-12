/* Runs the original pdfplumber extractor in CPython/WebAssembly, off the UI thread. */
const PYODIDE_VERSION = "0.28.3";
const PYODIDE_ROOT = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

function log(message, progress) {
  self.postMessage({ type: "log", message, progress });
}

self.onmessage = async (event) => {
  const { blank, solutions, blankName, solutionsName, language } = event.data;
  const cs = language === "cs";
  try {
    log(cs ? `Stahuji prostředí CPython/Pyodide ${PYODIDE_VERSION}…` : `Downloading CPython/Pyodide ${PYODIDE_VERSION} runtime…`, 2);
    importScripts(`${PYODIDE_ROOT}pyodide.js`);
    log(cs ? "Spouštím prostředí CPython WebAssembly…" : "Starting CPython WebAssembly runtime…", 7);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_ROOT });
    log(cs ? `CPython ${pyodide.runPython("import sys; sys.version.split()[0]")} byl úspěšně spuštěn.` : `CPython ${pyodide.runPython("import sys; sys.version.split()[0]")} started successfully.`, 14);

    log(cs ? "Načítám instalátor balíčků Pythonu (micropip)…" : "Loading Python package installer (micropip)…", 17);
    await pyodide.loadPackage("micropip");
    log(cs ? "Instaluji čistě pythonové závislosti pro extrakci PDF…" : "Installing pure-Python PDF extraction dependencies…", 21);
    // pdfplumber's pypdfium2 dependency is used only for page rendering and has
    // native binaries unavailable in WebAssembly. This extractor reads text and
    // coordinates only, so install the supported extraction stack explicitly.
    await pyodide.runPythonAsync(`
import micropip
await micropip.install(["pdfminer.six==20251107", "Pillow>=9.1"])
`);
    log(cs ? "Instaluji pdfplumber bez nepoužívaného nativního vykreslovače PDFium…" : "Installing pdfplumber without its unused native PDFium renderer…", 27);
    await pyodide.runPythonAsync(`await micropip.install("pdfplumber==0.11.8", deps=False)`);
    log(cs ? `pdfplumber ${pyodide.runPython("import pdfplumber; pdfplumber.__version__")} je připraven.` : `pdfplumber ${pyodide.runPython("import pdfplumber; pdfplumber.__version__")} is ready.`, 30);

    log(cs ? `Kopíruji čistý náhled do paměti Pythonu: ${blankName}` : `Copying clean preview into Python memory: ${blankName}`, 32);
    pyodide.FS.writeFile("/tmp/blank.pdf", new Uint8Array(blank));
    log(cs ? `Kopíruji PDF s řešeními do paměti Pythonu: ${solutionsName}` : `Copying solutions PDF into Python memory: ${solutionsName}`, 34);
    pyodide.FS.writeFile("/tmp/solutions.pdf", new Uint8Array(solutions));
    log(cs ? "Načítám původní algoritmus extract_solution_text.py…" : "Loading the original extract_solution_text.py algorithm…", 36);
    const sourceResponse = await fetch("/solutions/extract_solution_text.py");
    if (!sourceResponse.ok) throw new Error(`Could not load the Python extractor (${sourceResponse.status}).`);
    const source = (await sourceResponse.text()).replace(/\nif __name__ == ["']__main__["']:[\s\S]*$/, "");
    pyodide.runPython(source);

    const progress = (page, total, characters, runs) => {
      const percent = 36 + Math.round((page / total) * 58);
      log(cs ? `Strana ${page}/${total}: ${characters} přidaných znaků → ${runs} umístěných textových rámečků` : `Page ${page}/${total}: ${characters} added characters → ${runs} positioned text frames`, percent);
    };
    pyodide.globals.set("browser_progress", progress);
    pyodide.globals.set("browser_blank_name", blankName);
    pyodide.globals.set("browser_solutions_name", solutionsName);
    log(cs ? "Porovnávám znaky a souřadnice PDF stranu po straně…" : "Comparing PDF characters and coordinates page by page…", 37);
    const json = await pyodide.runPythonAsync(`
from pathlib import Path
import json

result = extract(Path('/tmp/blank.pdf'), Path('/tmp/solutions.pdf'), browser_progress)
result['blank_pdf'] = browser_blank_name
result['solutions_pdf'] = browser_solutions_name
json.dumps(result, ensure_ascii=False, indent=2) + '\\n'
`);
    log(cs ? "Porovnání v Pythonu je dokončeno. Vytvářím JSON pro InDesign…" : "Python comparison complete. Serialising InDesign JSON…", 96);
    self.postMessage({ type: "result", json });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error), stack: error?.stack });
  }
};
