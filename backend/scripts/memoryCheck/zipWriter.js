'use strict';
// A minimal STORED-only (uncompressed) ZIP writer — only needed to generate
// synthetic PPTX/DOCX test fixtures for the local memory-check script.
// Nowhere near a general-purpose zip library (no compression, no streaming),
// deliberately: the goal here is a small, obviously-correct test fixture
// generator, not a dependency.
const crypto = require('crypto');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ZipWriter {
  constructor() {
    this.entries = [];
    this.chunks = [];
    this.offset = 0;
  }

  addFile(name, content) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const localHeaderOffset = this.offset;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method: stored
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date (arbitrary valid value)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    this.chunks.push(localHeader, nameBuf, data);
    this.offset += localHeader.length + nameBuf.length + data.length;

    this.entries.push({ name: nameBuf, crc, size: data.length, localHeaderOffset });
  }

  toBuffer() {
    const centralDirChunks = [];
    for (const entry of this.entries) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4); // version made by
      central.writeUInt16LE(20, 6); // version needed
      central.writeUInt16LE(0, 8); // flags
      central.writeUInt16LE(0, 10); // method
      central.writeUInt16LE(0, 12); // mod time
      central.writeUInt16LE(0x21, 14); // mod date
      central.writeUInt32LE(entry.crc, 16);
      central.writeUInt32LE(entry.size, 20); // compressed size
      central.writeUInt32LE(entry.size, 24); // uncompressed size
      central.writeUInt16LE(entry.name.length, 28);
      central.writeUInt16LE(0, 30); // extra length
      central.writeUInt16LE(0, 32); // comment length
      central.writeUInt16LE(0, 34); // disk number start
      central.writeUInt16LE(0, 36); // internal attrs
      central.writeUInt32LE(0, 38); // external attrs
      central.writeUInt32LE(entry.localHeaderOffset, 42);
      centralDirChunks.push(central, entry.name);
    }

    const centralDirBuffer = Buffer.concat(centralDirChunks);
    const centralDirOffset = this.offset;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central dir
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(centralDirBuffer.length, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...this.chunks, centralDirBuffer, eocd]);
  }
}

function randomBinary(size) {
  return crypto.randomBytes(size);
}

module.exports = { ZipWriter, randomBinary };
