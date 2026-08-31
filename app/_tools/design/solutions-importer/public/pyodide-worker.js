/* Builds a Solutions Importer manifest locally in CPython/WebAssembly. */
const PYODIDE_VERSION = "0.28.3";
const PYODIDE_ROOT = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

function log(message, progress) {
  self.postMessage({ type: "log", message, progress });
}

self.onmessage = async (event) => {
  const { clean, manuscript, idml, cleanName, manuscriptName, idmlName, cleanText, manuscriptText, printersMarks, language } = event.data;
  const cs = language === "cs";
  try {
    log(cs ? "Stahuji místní prostředí Pythonu…" : "Downloading the local Python runtime…", 2);
    importScripts(`${PYODIDE_ROOT}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_ROOT });
    log(cs ? "Načítám nástroje pro PDF…" : "Loading PDF analysis tools…", 10);
    await pyodide.loadPackage("micropip");
    await pyodide.runPythonAsync(`
import micropip
await micropip.install(["pdfminer.six==20251107", "Pillow>=9.1"])
await micropip.install("pdfplumber==0.11.8", deps=False)
`);

    log(cs ? "Kopíruji soubory do místní pracovní paměti…" : "Copying files into local working memory…", 24);
    pyodide.FS.writeFile("/tmp/clean.pdf", new Uint8Array(clean));
    pyodide.FS.writeFile("/tmp/manuscript.pdf", new Uint8Array(manuscript));
    pyodide.FS.writeFile("/tmp/chapter.idml", new Uint8Array(idml));
    pyodide.FS.writeFile("/tmp/clean-text.json", JSON.stringify(cleanText));
    pyodide.FS.writeFile("/tmp/manuscript-text.json", JSON.stringify(manuscriptText));

    const sourceResponse = await fetch("/solutions/extract_solution_operations.py");
    if (!sourceResponse.ok) throw new Error(`Could not load the Solutions extractor (${sourceResponse.status}).`);
    const source = (await sourceResponse.text()).replace(/\nif __name__ == ["']__main__["']:[\s\S]*$/, "");
    pyodide.runPython(source);

    const progress = (page, total, textRuns, marks, phase) => {
      const isStarting = phase === "starting";
      const completedPages = isStarting ? Math.max(page - 1, 0) : page;
      const percent = 30 + Math.round((completedPages / total) * 62);
      log(
        isStarting
          ? (cs ? `Analyzuji stranu ${page}/${total}…` : `Analysing page ${page}/${total}…`)
          : (cs
            ? `Strana ${page}/${total}: ${textRuns} textových operací, ${marks} značek`
            : `Page ${page}/${total}: ${textRuns} text operations, ${marks} marks`),
        percent,
      );
    };
    pyodide.globals.set("browser_progress", progress);
    pyodide.globals.set("browser_clean_name", cleanName);
    pyodide.globals.set("browser_manuscript_name", manuscriptName);
    pyodide.globals.set("browser_idml_name", idmlName);
    pyodide.globals.set("browser_printers_marks", Boolean(printersMarks));
    log(cs ? "Porovnávám text, poznámky a strukturu IDML…" : "Comparing text, annotations, and IDML structure…", 30);
    const json = await pyodide.runPythonAsync(`
from pathlib import Path
import json

result = extract(
    Path('/tmp/clean.pdf'),
    Path('/tmp/manuscript.pdf'),
    Path('/tmp/chapter.idml'),
    browser_progress,
    bool(browser_printers_marks),
    json.loads(Path('/tmp/clean-text.json').read_text(encoding='utf-8')),
    json.loads(Path('/tmp/manuscript-text.json').read_text(encoding='utf-8')),
)
result['clean_pdf'] = browser_clean_name
result['manuscript_pdf'] = browser_manuscript_name
result['idml'] = browser_idml_name
json.dumps(result, ensure_ascii=False, indent=2) + '\\n'
`);
    log(cs ? "Manifest je připraven ke kontrole." : "The operation manifest is ready for review.", 97);
    self.postMessage({ type: "result", json });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error?.stack,
    });
  }
};
