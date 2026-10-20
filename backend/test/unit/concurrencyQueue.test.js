'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../../src/utils/concurrencyQueue');

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

test('concurrencyQueue', async (t) => {
  await t.test('only one task runs at a time — a slower task does not let a later one overtake it', async () => {
    const queue = createQueue();
    const order = [];
    let running = 0;
    let maxConcurrent = 0;

    function makeTask(label, ms) {
      return async () => {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        await delay(ms);
        order.push(label);
        running -= 1;
      };
    }

    const p1 = queue.run(makeTask('slow', 40));
    const p2 = queue.run(makeTask('fast', 1));
    const p3 = queue.run(makeTask('fast2', 1));

    await Promise.all([p1, p2, p3]);

    assert.deepEqual(order, ['slow', 'fast', 'fast2'], 'tasks must finish in the order they were queued, not interleaved');
    assert.equal(maxConcurrent, 1, 'no two tasks should ever run at the same time');
  });

  await t.test('a failed task rejects its own caller but does not block tasks queued after it', async () => {
    const queue = createQueue();
    const p1 = queue.run(async () => { throw new Error('boom'); });
    const p2 = queue.run(async () => 'ok');

    await assert.rejects(p1, /boom/);
    assert.equal(await p2, 'ok');
  });

  await t.test('each run() call resolves with its own task result', async () => {
    const queue = createQueue();
    const results = await Promise.all([
      queue.run(async () => 1),
      queue.run(async () => 2),
      queue.run(async () => 3),
    ]);
    assert.deepEqual(results, [1, 2, 3]);
  });
});
