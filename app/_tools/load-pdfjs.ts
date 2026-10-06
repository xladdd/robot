let pdfJsPromise:
  | Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>
  | undefined;

/** Load browser PDF.js only when a user starts a local PDF operation. */
export async function loadPdfJs() {
  const pdfJs = await (pdfJsPromise ??=
    import("pdfjs-dist/legacy/build/pdf.mjs"));
  if (typeof window !== "undefined")
    pdfJs.GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";
  return pdfJs;
}
