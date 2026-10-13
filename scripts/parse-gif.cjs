// Minimal GIF structure parser: frame count, delays, canvas size, loop.
const fs = require('node:fs');
const buf = fs.readFileSync(process.argv[2] ?? '.hoplite/artifacts/media-test.gif');

if (buf.subarray(0, 6).toString('latin1') !== 'GIF89a') throw new Error('bukan GIF89a');
const width = buf.readUInt16LE(6);
const height = buf.readUInt16LE(8);
const flags = buf[10];
let i = 13;
if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1)); // skip global color table

const delays = [];
let loop = null;
const skipSubBlocks = () => {
  while (buf[i] !== 0) i += buf[i] + 1;
  i += 1;
};
while (buf[i] !== 0x3b) {
  const b = buf[i];
  if (b === 0x21) {
    const label = buf[i + 1];
    if (label === 0xf9) {
      delays.push(buf.readUInt16LE(i + 4) * 10); // delay in ms
      i += 8;
    } else {
      i += 2;
      if (label === 0xff && buf[i] === 11) {
        const app = buf.subarray(i + 1, i + 12).toString('latin1');
        if (app.startsWith('NETSCAPE')) loop = buf.readUInt16LE(i + 14);
      }
      skipSubBlocks();
    }
  } else if (b === 0x2c) {
    const f = buf[i + 9];
    i += 10;
    if (f & 0x80) i += 3 * (1 << ((f & 7) + 1));
    i += 1; // LZW min code size
    skipSubBlocks(); // LZW data
  } else {
    throw new Error(`blok tak dikenal: 0x${b.toString(16)} @ ${i}`);
  }
}
console.log(JSON.stringify({ width, height, frames: delays.length, delaysMs: delays, loop, bytes: buf.length }));
