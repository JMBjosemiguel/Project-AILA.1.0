'use strict';
// Local-only check (never run as part of `npm test` / CI): generates a
// ~40 MB PPTX (80 text slides + image padding) and a ~40 MB PDF (220 pages +
// a per-page embedded image), extracts ALL text from each straight off disk,
// proves the LAST slide's/page's sentence was read and would make it into an
// Ask AILA prompt, and reports peak RSS + elapsed time. Nothing it generates
// is committed — files are written under the OS temp directory and deleted
// afterward.
//
// Usage: node backend/scripts/memoryCheck/runMemoryCheck.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generatePptx, generatePdf, LAST_SLIDE_SENTINEL, LAST_PAGE_SENTINEL } = require('./generateLargeTestFiles');
const { extractPptxChunks } = require('../../src/utils/zipTextEntries');
const { extractPdfChunks } = require('../../src/utils/pdfTextByPage');
const { selectRelevantChunks } = require('../../src/services/resourceTextExtraction');

const MEMORY_CEILING_MB = 300;

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

// Samples RSS on an interval while `task` runs, so a transient mid-extraction
// spike is caught even if memory drops back down before `task` resolves.
async function withPeakRss(task) {
  let peak = process.memoryUsage().rss;
  const interval = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 25);
  const startedAt = Date.now();
  try {
    const result = await task();
    peak = Math.max(peak, process.memoryUsage().rss);
    return { result, peakRssBytes: peak, elapsedMs: Date.now() - startedAt };
  } finally {
    clearInterval(interval);
  }
}

function report(label, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${label}${detail ? `: ${detail}` : ''}`);
  return passed;
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aila-memcheck-'));
  const pptxPath = path.join(workDir, 'large-lecture.pptx');
  const pdfPath = path.join(workDir, 'large-lecture.pdf');
  let allPassed = true;

  try {
    console.log('Generating fixtures (this takes a few seconds)...');
    generatePptx(pptxPath);
    generatePdf(pdfPath);
    const pptxSizeMb = mb(fs.statSync(pptxPath).size);
    const pdfSizeMb = mb(fs.statSync(pdfPath).size);
    console.log(`  PPTX: ${pptxPath} (${pptxSizeMb} MB)`);
    console.log(`  PDF:  ${pdfPath} (${pdfSizeMb} MB)`);
    console.log('');

    // --- PPTX ---------------------------------------------------------
    if (global.gc) global.gc();
    const pptxRun = await withPeakRss(() => extractPptxChunks(pptxPath));
    const pptxChunks = pptxRun.result.chunks;
    const lastSlide = pptxChunks[pptxChunks.length - 1];

    console.log(`PPTX extraction: ${pptxChunks.length} slides, ${pptxRun.elapsedMs}ms, peak RSS ${mb(pptxRun.peakRssBytes)} MB`);
    allPassed = report('PPTX: last slide text was extracted', lastSlide && lastSlide.text.includes(LAST_SLIDE_SENTINEL)) && allPassed;
    allPassed = report('PPTX: peak RSS stays under the ceiling', mb(pptxRun.peakRssBytes) < MEMORY_CEILING_MB, `${mb(pptxRun.peakRssBytes)} MB < ${MEMORY_CEILING_MB} MB`) && allPassed;

    const pptxAskResult = selectRelevantChunks(pptxChunks, 'What does the last slide say about its nursing concept?', 120000);
    allPassed = report('PPTX: an Ask AILA prompt about the last slide includes its text', pptxAskResult.text.includes(LAST_SLIDE_SENTINEL)) && allPassed;
    console.log('');

    // --- PDF ------------------------------------------------------------
    if (global.gc) global.gc();
    const pdfRun = await withPeakRss(() => extractPdfChunks(pdfPath));
    const pdfChunks = pdfRun.result.chunks;
    const lastPage = pdfChunks[pdfChunks.length - 1];

    console.log(`PDF extraction: ${pdfRun.result.pageCount} pages, ${pdfRun.elapsedMs}ms, peak RSS ${mb(pdfRun.peakRssBytes)} MB`);
    allPassed = report('PDF: last page text was extracted', lastPage && lastPage.text.includes(LAST_PAGE_SENTINEL)) && allPassed;
    allPassed = report('PDF: peak RSS stays under the ceiling', mb(pdfRun.peakRssBytes) < MEMORY_CEILING_MB, `${mb(pdfRun.peakRssBytes)} MB < ${MEMORY_CEILING_MB} MB`) && allPassed;

    const pdfAskResult = selectRelevantChunks(pdfChunks, 'What does the last page say about its nursing concept?', 120000);
    allPassed = report('PDF: an Ask AILA prompt about the last page includes its text', pdfAskResult.text.includes(LAST_PAGE_SENTINEL)) && allPassed;
    console.log('');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  console.log(allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Memory check crashed:', error);
  process.exit(1);
});
