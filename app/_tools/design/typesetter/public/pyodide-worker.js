/* Extracts DOCX manuscript blocks and an IDML inventory locally in CPython/WASM. */
const PYODIDE_VERSION = "0.28.3";
const PYODIDE_ROOT = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let runtimePromise = null;

function log(message, progress) {
  self.postMessage({ type: "log", message, progress });
}

async function runtime(language) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const cs = language === "cs";
      log(
        cs
          ? "Stahuji místní prostředí Pythonu…"
          : "Downloading the local Python runtime…",
        8,
      );
      importScripts(`${PYODIDE_ROOT}pyodide.js`);
      return loadPyodide({ indexURL: PYODIDE_ROOT });
    })();
  }
  return runtimePromise;
}

self.onmessage = async (event) => {
  const { manuscript, idml, manuscriptName, idmlName, language } = event.data;
  const cs = language === "cs";
  try {
    const pyodide = await runtime(language);
    log(
      cs
        ? "Kopíruji soubory do místní pracovní paměti…"
        : "Copying files into local working memory…",
      30,
    );
    pyodide.FS.writeFile("/tmp/manuscript.docx", new Uint8Array(manuscript));
    pyodide.FS.writeFile("/tmp/template.idml", new Uint8Array(idml));

    const response = await fetch("/typesetter/extract_typesetter.py");
    if (!response.ok)
      throw new Error(`Could not load the Typesetter extractor (${response.status}).`);
    const source = (await response.text()).replace(
      /\nif __name__ == ["']__main__["']:[\s\S]*$/,
      "",
    );
    pyodide.runPython(source);
    pyodide.globals.set("browser_manuscript_name", manuscriptName);
    pyodide.globals.set("browser_idml_name", idmlName);

    log(
      cs
        ? "Čtu strukturu DOCX a inventář IDML…"
        : "Reading DOCX structure and the IDML inventory…",
      58,
    );
    const json = await pyodide.runPythonAsync(`
from pathlib import Path
import json
result = extract(Path('/tmp/manuscript.docx'), Path('/tmp/template.idml'))
result['manuscript']['filename'] = browser_manuscript_name
result['template']['filename'] = browser_idml_name
json.dumps(result, ensure_ascii=False)
`);
    log(
      cs ? "Místní inventář je připraven." : "The local inventory is ready.",
      100,
    );
    self.postMessage({ type: "result", json });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error && error.stack,
    });
  }
};
