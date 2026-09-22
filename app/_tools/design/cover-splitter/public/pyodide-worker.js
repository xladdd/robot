/* Splits cover PDFs and packages requested exports inside a classic browser Worker. */
const PYODIDE_VERSION = "0.28.3";
const PYODIDE_ROOT = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYPDF_VERSION = "6.18.0";
const SCRIPT_URL = "/cover-splitter/split_cover.py";
const RESULT_FILENAME = "cover-splits.zip";
const VALID_SIZES = new Set(["A5", "A4", "B5", "half"]);

let runtimePromise = null;
let busy = false;

function log(message, progress, fileName) {
  self.postMessage({ type: "log", message, progress, fileName });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function asArrayBuffer(value, fileName) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  throw new TypeError(`${fileName} is missing its file ArrayBuffer.`);
}

function validateSplitRequest(data) {
  if (!Array.isArray(data?.files) || data.files.length === 0) {
    throw new TypeError("At least one PDF is required.");
  }

  const includeInside = data?.includeInside === true;
  const files = data.files.map((file, index) => {
    const name = String(file?.name ?? file?.originalName ?? "").trim();
    if (!name)
      throw new TypeError(`PDF ${index + 1} is missing its original name.`);
    const size = String(file?.size ?? "").trim();
    if (!VALID_SIZES.has(size)) {
      throw new TypeError(`${name} size must be one of A5, A4, B5, or half.`);
    }
    return {
      name,
      buffer: asArrayBuffer(file?.buffer ?? file?.data, name),
      size,
    };
  });
  return { files, includeInside };
}

function validateArchiveRequest(data) {
  if (!Array.isArray(data?.files) || data.files.length === 0) {
    throw new TypeError("At least one output file is required.");
  }

  const names = new Set();
  return data.files.map((file, index) => {
    const name = String(file?.name ?? "").trim();
    if (!name || name.includes("/") || name.includes("\\")) {
      throw new TypeError(`Output file ${index + 1} has an invalid name.`);
    }
    if (names.has(name.toLocaleLowerCase())) {
      throw new TypeError(`More than one output is named ${name}.`);
    }
    names.add(name.toLocaleLowerCase());
    return { name, buffer: asArrayBuffer(file?.buffer, name) };
  });
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      log("Downloading the local Python runtime…", 2);
      importScripts(`${PYODIDE_ROOT}pyodide.js`);
      const pyodide = await loadPyodide({ indexURL: PYODIDE_ROOT });
      log("Loading local PDF tools…", 10);
      await pyodide.loadPackage("micropip");
      await pyodide.runPythonAsync(`
import micropip
await micropip.install("pypdf==${PYPDF_VERSION}")
`);
      return pyodide;
    })();
  }
  return runtimePromise;
}

function removeTree(fileSystem, path) {
  try {
    const stats = fileSystem.stat(path);
    if (fileSystem.isDir(stats.mode)) {
      for (const entry of fileSystem.readdir(path)) {
        if (entry !== "." && entry !== "..") {
          removeTree(fileSystem, `${path}/${entry}`);
        }
      }
      fileSystem.rmdir(path);
    } else {
      fileSystem.unlink(path);
    }
  } catch {
    // Cleanup must not replace the processing result or its useful error.
  }
}

function resultBuffer(fileSystem, path) {
  const output = fileSystem.readFile(path);
  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  );
}

function jobPath(prefix) {
  return `/tmp/${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function splitCovers(data) {
  const { files, includeInside } = validateSplitRequest(data);
  const pyodide = await loadRuntime();
  let jobRoot = jobPath("cover-splitter");

  try {
    const inputDir = `${jobRoot}/input`;
    const outputDir = `${jobRoot}/output`;
    const zipPath = `${jobRoot}/${RESULT_FILENAME}`;
    pyodide.FS.mkdirTree(inputDir);
    pyodide.FS.mkdirTree(outputDir);

    log(
      `Copying ${files.length} PDF${files.length === 1 ? "" : "s"} into local working memory…`,
      24,
    );
    const manifest = files.map((file, index) => {
      const localPath = `${inputDir}/source-${String(index).padStart(4, "0")}.pdf`;
      pyodide.FS.writeFile(localPath, new Uint8Array(file.buffer));
      return {
        path: localPath,
        original_name: file.name,
        size_choice: file.size,
      };
    });
    pyodide.FS.writeFile(
      `${jobRoot}/manifest.json`,
      new TextEncoder().encode(JSON.stringify(manifest)),
    );

    log("Loading the local cover splitter…", 30);
    const sourceResponse = await fetch(SCRIPT_URL, {
      credentials: "same-origin",
    });
    if (!sourceResponse.ok) {
      throw new Error(
        `Could not load the cover splitter (${sourceResponse.status}).`,
      );
    }
    pyodide.FS.writeFile(
      `${jobRoot}/split_cover.py`,
      new TextEncoder().encode(await sourceResponse.text()),
    );

    const reportFileProgress = (completed, total, fileName, phase) => {
      const count = Number(total);
      const done = Number(completed);
      const progress = 35 + Math.round((done / count) * 53);
      if (phase === "starting") {
        log(
          `Splitting ${done + 1}/${count}: ${fileName}…`,
          progress,
          String(fileName),
        );
      } else if (phase === "finished") {
        log(
          `Finished ${done}/${count}: ${fileName}`,
          progress,
          String(fileName),
        );
      } else if (phase === "packaging") {
        log("Packaging the split covers…", 90);
      }
    };

    pyodide.globals.set("browser_job_root", jobRoot);
    pyodide.globals.set("browser_include_inside", includeInside);
    pyodide.globals.set("browser_progress", reportFileProgress);
    await pyodide.runPythonAsync(`
import importlib.util
import json
from pathlib import Path

_job_root = Path(str(browser_job_root))
_spec = importlib.util.spec_from_file_location(
    "cover_splitter",
    _job_root / "split_cover.py",
)
if _spec is None or _spec.loader is None:
    raise RuntimeError("Could not initialize the cover splitter module.")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
_inputs = json.loads((_job_root / "manifest.json").read_text(encoding="utf-8"))
_module.split_covers_to_zip(
    _inputs,
    _job_root / "output",
    _job_root / "${RESULT_FILENAME}",
    progress=browser_progress,
    include_inside=bool(browser_include_inside),
)
`);

    log("Reading the local ZIP archive…", 96);
    const generated = pyodide.FS.readdir(outputDir)
      .filter((name) => name !== "." && name !== "..")
      .sort()
      .map((name) => ({
        name,
        buffer: resultBuffer(pyodide.FS, `${outputDir}/${name}`),
      }));
    const buffer = resultBuffer(pyodide.FS, zipPath);
    log("Cover splits are ready.", 100);
    return { buffer, filename: RESULT_FILENAME, files: generated };
  } finally {
    removeTree(pyodide.FS, jobRoot);
    pyodide.globals.delete("browser_job_root");
    pyodide.globals.delete("browser_include_inside");
    pyodide.globals.delete("browser_progress");
    jobRoot = null;
  }
}

async function packageExports(data) {
  const files = validateArchiveRequest(data);
  const pyodide = await loadRuntime();
  let jobRoot = jobPath("cover-export-archive");

  try {
    const inputDir = `${jobRoot}/input`;
    const zipPath = `${jobRoot}/${RESULT_FILENAME}`;
    pyodide.FS.mkdirTree(inputDir);
    const manifest = files.map((file, index) => {
      const path = `${inputDir}/file-${String(index).padStart(4, "0")}`;
      pyodide.FS.writeFile(path, new Uint8Array(file.buffer));
      return { name: file.name, path };
    });
    pyodide.FS.writeFile(
      `${jobRoot}/manifest.json`,
      new TextEncoder().encode(JSON.stringify(manifest)),
    );

    log("Updating the local ZIP archive…", 92);
    pyodide.globals.set("browser_archive_root", jobRoot);
    await pyodide.runPythonAsync(`
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

_archive_root = Path(str(browser_archive_root))
_archive_files = json.loads((_archive_root / "manifest.json").read_text(encoding="utf-8"))
with ZipFile(_archive_root / "${RESULT_FILENAME}", "w", compression=ZIP_DEFLATED) as _archive:
    for _file in _archive_files:
        _archive.write(_file["path"], arcname=_file["name"])
`);
    const buffer = resultBuffer(pyodide.FS, zipPath);
    log("The ZIP archive is ready.", 100);
    return { buffer, filename: RESULT_FILENAME };
  } finally {
    removeTree(pyodide.FS, jobRoot);
    pyodide.globals.delete("browser_archive_root");
    jobRoot = null;
  }
}

self.onmessage = async (event) => {
  if (busy) {
    self.postMessage({
      type: "error",
      message: "The cover splitter is already processing a request.",
    });
    return;
  }

  busy = true;
  try {
    const action = String(event.data?.action ?? "split");
    const result =
      action === "package"
        ? await packageExports(event.data)
        : await splitCovers(event.data);
    const transfers = [result.buffer];
    if (Array.isArray(result.files)) {
      for (const file of result.files) transfers.push(file.buffer);
    }
    self.postMessage({ type: "result", ...result }, transfers);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: errorMessage(error),
      stack: error?.stack,
    });
  } finally {
    busy = false;
  }
};
