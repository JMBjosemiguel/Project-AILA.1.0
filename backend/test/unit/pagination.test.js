'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePagination, buildPaginationMeta } = require('../../src/utils/pagination');

test('parsePagination coerces query strings to safe integers', () => {
  const p = parsePagination({ page: '3', pageSize: '25' });
  assert.deepEqual(p, { page: 3, pageSize: 25, limit: 25, offset: 50 });
  assert.equal(Number.isInteger(p.limit), true);
  assert.equal(Number.isInteger(p.offset), true);
});

test('parsePagination applies defaults for missing values', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, limit: 20, offset: 0 });
});

test('parsePagination clamps out-of-range and rubbish input to safe bounds', () => {
  assert.equal(parsePagination({ page: '-5' }).page, 1);       // below min -> 1
  assert.equal(parsePagination({ page: '0' }).page, 1);        // falsy -> default 1
  assert.equal(parsePagination({ pageSize: '-1' }).pageSize, 1);   // below min -> clamped to 1
  assert.equal(parsePagination({ pageSize: '0' }).pageSize, 20);   // falsy -> default 20
  assert.equal(parsePagination({ pageSize: '99999' }).pageSize, 100); // above MAX_PAGE_SIZE -> 100
  assert.equal(parsePagination({ page: 'abc', pageSize: 'xyz' }).offset, 0);
  assert.equal(parsePagination({ page: '1.5' }).page, 1);      // parseInt -> 1
  for (const q of [{ page: '-5' }, { pageSize: '-1' }, { page: '99999' }, { page: 'abc' }]) {
    const p = parsePagination(q);
    assert.ok(Number.isInteger(p.limit) && p.limit >= 1 && p.limit <= 100);
    assert.ok(Number.isInteger(p.offset) && p.offset >= 0);
  }
});

test('parsePagination offset is always a non-negative integer', () => {
  for (const q of [{ page: '10', pageSize: '10' }, { page: '1' }, { page: '999', pageSize: '50' }]) {
    const { offset } = parsePagination(q);
    assert.equal(Number.isInteger(offset) && offset >= 0, true);
  }
});

test('buildPaginationMeta reports at least one page', () => {
  assert.deepEqual(buildPaginationMeta({ page: 1, pageSize: 10, total: 0 }),
    { page: 1, pageSize: 10, total: 0, totalPages: 1 });
  assert.equal(buildPaginationMeta({ page: 1, pageSize: 10, total: 25 }).totalPages, 3);
});
