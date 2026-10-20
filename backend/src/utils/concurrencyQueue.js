// A tiny FIFO mutex: only one task runs at a time, everything else queued
// behind it waits its turn. Used to keep heavy file extraction (unzipping a
// PPTX, walking every PDF page) from running several at once on a 512 MB
// server — a burst of students asking AILA about different large files
// should queue briefly, not run in parallel and spike memory together.
function createQueue() {
  let tail = Promise.resolve();

  function run(task) {
    // tail itself never rejects (see below), so this always runs once its
    // turn comes, regardless of whether earlier tasks succeeded or failed.
    const result = tail.then(task);
    // Swallow rejections in the CHAIN (not in what the caller receives) so
    // one failed task never poisons every task queued after it.
    tail = result.then(() => {}, () => {});
    return result;
  }

  return { run };
}

module.exports = { createQueue };
