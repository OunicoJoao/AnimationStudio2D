import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgba, rgbaToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, parsePalette, paletteToGpl, presetColors, PRESET_PALETTES } from '../src/core/color.js';

test('hex ida e volta', () => {
  assert.deepEqual(hexToRgba('#f6cf6e'), [246, 207, 110, 255]);
  assert.deepEqual(hexToRgba('abc'), [170, 187, 204, 255]);
  assert.deepEqual(hexToRgba('#11223344'), [17, 34, 51, 68]);
  assert.equal(hexToRgba('zzz'), null);
  assert.equal(rgbaToHex([246, 207, 110, 255]), '#f6cf6e');
  assert.equal(rgbaToHex([1, 2, 3, 128], true), '#01020380');
});

test('HSV e HSL ida e volta em várias cores', () => {
  for (const c of [[255, 0, 0], [12, 200, 99], [0, 0, 0], [255, 255, 255], [128, 64, 200]]) {
    const [h, s, v] = rgbToHsv(...c);
    assert.deepEqual(hsvToRgb(h, s, v), c);
    const [h2, s2, l2] = rgbToHsl(...c);
    const back = hslToRgb(h2, s2, l2);
    back.forEach((v2, i) => assert.ok(Math.abs(v2 - c[i]) <= 1));
  }
});

test('paletas: GIMP, JASC e hex', () => {
  const cols = [[1, 2, 3, 255], [250, 128, 0, 255]];
  assert.deepEqual(parsePalette(paletteToGpl(cols)), cols);
  assert.deepEqual(parsePalette('JASC-PAL\n0100\n2\n1 2 3\n250 128 0\n'), cols);
  assert.deepEqual(parsePalette('#010203\nfa8000\n'), cols);
  for (const name of Object.keys(PRESET_PALETTES)) assert.ok(presetColors(name).every((c) => c && c.length === 4));
});
