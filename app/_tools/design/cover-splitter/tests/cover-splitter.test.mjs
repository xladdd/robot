import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const splitterPath = new URL("../public/split_cover.py", import.meta.url);
const workerPath = new URL("../public/pyodide-worker.js", import.meta.url);
const interfacePath = new URL("../MainInterface.tsx", import.meta.url);

test("uses a validated size choice from every worker file record", async () => {
  const [worker, splitter] = await Promise.all([
    readFile(workerPath, "utf8"),
    readFile(splitterPath, "utf8"),
  ]);

  assert.match(worker, /const size = String\(file\?\.size \?\? ""\)\.trim\(\)/);
  assert.match(worker, /size_choice: file\.size/);
  assert.doesNotMatch(worker, /data\?\.(?:size|sizeChoice)/);
  assert.match(splitter, /input_file\["size_choice"\]/);
});

test("keeps vector panel crops and the optional inside-cover mapping", async () => {
  const splitter = await readFile(splitterPath, "utf8");

  assert.match(splitter, /"A5": 148\.0/);
  assert.match(splitter, /"A4": 210\.0/);
  assert.match(splitter, /"B5": 176\.0/);
  assert.match(splitter, /panel_width = width \/ 2\.0/);
  assert.match(splitter, /width - panel_width, panel_width/);
  assert.match(splitter, /reader\.pages\[0\]/);
  assert.match(splitter, /inside_page = reader\.pages\[1\]/);
  assert.match(splitter, /include_inside: bool = False/);
  assert.match(splitter, /merge_transformed_page/);
  assert.match(splitter, /output_page\.mediabox = output_box/);
  assert.match(
    splitter,
    /output_page\.cropbox = RectangleObject\(output_box\)/,
  );
  assert.match(splitter, /f"\{stem\}_BACK\.pdf"/);
  assert.match(splitter, /f"\{stem\}_FRONT\.pdf"/);
  assert.match(splitter, /f"\{stem\}_FRONT-inside\.pdf"/);
  assert.match(splitter, /f"\{stem\}_BACK-inside\.pdf"/);
  assert.match(
    splitter,
    /_write_panel\(inside_page, inside_left_region, paths\[2\]\)/,
  );
  assert.match(
    splitter,
    /_write_panel\(inside_page, inside_right_region, paths\[3\]\)/,
  );
  assert.match(splitter, /ZipFile\(archive_path/);
});

test("registers browser-local multi-file processing and the stable public path", async () => {
  const [component, worker] = await Promise.all([
    readFile(interfacePath, "utf8"),
    readFile(workerPath, "utf8"),
    access(
      new URL(
        "../../../../../public/cover-splitter/pyodide-worker.js",
        import.meta.url,
      ),
    ),
  ]);

  assert.match(component, /MAX_FILE_BYTES = 30 \* 1024 \* 1024/);
  assert.match(component, /multiple/);
  assert.match(component, /renderFirstPdfPage/);
  assert.match(
    component,
    /new Worker\("\/cover-splitter\/pyodide-worker\.js"\)/,
  );
  assert.match(component, /size: entry\.sizeChoice/);
  assert.match(component, /includeInside: splitInside/);
  assert.match(component, /type="checkbox"/);
  assert.match(
    component,
    /className="cover-splitter-controls[^"\n]*editor-sidebar"/,
  );
  assert.match(component, /className="cover-splitter-console"/);
  assert.match(component, /className="cover-splitter-preview-column"/);
  assert.match(component, /className="cover-splitter-remove"/);
  assert.match(worker, /PYODIDE_VERSION = "0\.28\.3"/);
  assert.match(worker, /data\?\.includeInside === true/);
  assert.match(worker, /include_inside=bool\(browser_include_inside\)/);
  assert.match(worker, /micropip\.install\("pypdf==/);
  assert.match(worker, /self\.postMessage\(\{ type: "result", buffer/);
});
