import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipStore, unzip, crc32 } from '../src/io/zip.js';
import { encodeGif, buildPalette, medianCut } from '../src/io/gif.js';
import { playOrder } from '../src/app/Playback.js';
import { deflateRawSync } from 'node:zlib';

test('crc32 conhecido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip ida e volta (store)', async () => {
  const enc = new TextEncoder();
  const files = [{ name: 'project.json', data: enc.encode('{"a":1}') }, { name: 'cels/x.png', data: new Uint8Array([1, 2, 3, 250]) }];
  const map = await unzip(zipStore(files));
  assert.equal(new TextDecoder().decode(map.get('project.json')), '{"a":1}');
  assert.deepEqual([...map.get('cels/x.png')], [1, 2, 3, 250]);
});

test('zip com deflate (gerado por outro programa)', async () => {
  // monta um zip "deflate" trocando o método e os dados de um zip store
  const raw = new TextEncoder().encode('olá olá olá olá olá');
  const comp = deflateRawSync(raw);
  const z = zipStore([{ name: 'a.txt', data: comp }]);
  const dv = new DataView(z.buffer);
  dv.setUint16(8, 8, true); // método no cabeçalho local
  const cd = z.length - 22 - 46 - 5;
  dv.setUint16(cd + 10, 8, true); // método no diretório central
  const map = await unzip(z);
  assert.equal(new TextDecoder().decode(map.get('a.txt')), 'olá olá olá olá olá');
});

test('GIF: cabeçalho, quadros e trailer', async () => {
  const w = 8, h = 4;
  const mk = (r) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = 100; d[i + 2] = 50; d[i + 3] = i < 16 ? 0 : 255; } return d; };
  const gif = await encodeGif([{ data: mk(10), delay: 100 }, { data: mk(240), delay: 50 }], w, h);
  assert.equal(new TextDecoder().decode(gif.subarray(0, 6)), 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b);
  let frames = 0;
  for (let i = 0; i < gif.length - 1; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9) frames++;
  assert.equal(frames, 2);
});

test('paleta limitada a 255 cores para degradês', () => {
  const w = 256, h = 64, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = x; d[i + 1] = y * 4; d[i + 2] = 255 - x; d[i + 3] = 255; }
  const pal = buildPalette([{ data: d }]);
  assert.ok(pal.length <= 255 && pal.length > 100);
  assert.equal(medianCut([[1, 1, 1, 1]], 4).length, 1);
});

test('ordem de reprodução dos trechos', () => {
  assert.deepEqual(playOrder(2, 5, 'forward'), [2, 3, 4, 5]);
  assert.deepEqual(playOrder(2, 5, 'reverse'), [5, 4, 3, 2]);
  assert.deepEqual(playOrder(0, 3, 'pingpong'), [0, 1, 2, 3, 2, 1]);
});
