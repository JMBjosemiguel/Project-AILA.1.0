// pdfjs-dist 5.x ships ESM-only (no CJS build at all, even its "legacy" bundle
// is .mjs) — dynamic import() is the standard, version-stable way to consume
// an ESM-only package from this CommonJS codebase.
let pdfjsLibPromise = null;
function loadPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

// Reads every page's text, one page at a time, directly from the file on
// disk — pdf.js's own Node file-stream support (triggered by passing a local
// path as `url`) handles the chunked reading; this function never calls
// fs.readFile on the whole document itself. getTextContent() only walks
// text-show operators, so embedded images are never decoded even though
// their XObject references live in the same per-page content stream.
async function extractPdfChunks(filePath) {
  const pdfjsLib = await loadPdfjsLib();
  const loadingTask = pdfjsLib.getDocument({
    url: filePath,
    isEvalSupported: false,
    // ERRORS only — pdf.js otherwise logs a warning per page for things that
    // don't affect text extraction at all (e.g. a missing standard-font
    // metrics file, only used for rendering/width fallback).
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  });
  loadingTask.onPassword = () => { throw new Error('PDF is password-protected'); };

  const pdfDocument = await loadingTask.promise;
  const chunks = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdfDocument.getPage(pageNumber);
      try {
        // eslint-disable-next-line no-await-in-loop
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) chunks.push({ label: `Page ${pageNumber}`, text });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdfDocument.destroy();
  }

  return { chunks, pageCount: pdfDocument.numPages };
}

module.exports = { extractPdfChunks };
