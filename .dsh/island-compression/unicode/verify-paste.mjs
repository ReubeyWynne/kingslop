import fs from 'node:fs';
import { decodeFragment } from './transport.mjs';
import { crc32 } from '../core.mjs';
import { decode } from '../node-codec.mjs';
const input = fs.readFileSync(process.argv[2] ?? 0, 'utf8').trim(), index = input.indexOf('#');
try {
  const bytes = decodeFragment(index < 0 ? input : input.slice(index));
  if (bytes[0] === 85 && bytes[1] === 84 && bytes[2] === 1) {
    const n = bytes.length, expected = (bytes[n - 4] * 2 ** 24 + bytes[n - 3] * 2 ** 16 + bytes[n - 2] * 256 + bytes[n - 1]) >>> 0;
    if (crc32(bytes.subarray(0, -4)) !== expected) throw new Error('Diagnostic checksum differs');
    const original = JSON.parse(fs.readFileSync(new URL('paste-samples.json', import.meta.url))).stress.url;
    console.log(JSON.stringify({ type: 'UT/1 diagnostic', utf16Units: input.length, bytes: n, crc32: expected.toString(16).padStart(8, '0'), exactOriginal: input === original }, null, 2));
  } else {
    const layout = decode(bytes), prior = JSON.parse(fs.readFileSync(new URL('../results.json', import.meta.url))), matches = prior.reference.filter(f => !f.nativeCompression && Buffer.from(f.payload, 'base64url').equals(Buffer.from(bytes))).map(f => f.layout);
    console.log(JSON.stringify({ type: 'IC/1 island', utf16Units: input.length, bytes: bytes.length, board: layout.board, pieces: layout.pieces.length, surfaces: layout.surfaces.length, exactBinaryMatches: matches }, null, 2));
  }
} catch (e) { console.error('Invalid or changed payload: ' + e.message); process.exitCode = 1; }
