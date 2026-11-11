import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, FnCommand, MacroCommand } from '../src/history/History.js';

test('desfazer e refazer em ordem', () => {
  const h = new History();
  const log = [];
  h.execute(new FnCommand('a', () => log.push('+a'), () => log.push('-a')));
  h.execute(new FnCommand('b', () => log.push('+b'), () => log.push('-b')));
  h.undo(); h.undo(); h.redo();
  assert.deepEqual(log, ['+a', '+b', '-b', '-a', '+a']);
  assert.equal(h.nextRedoLabel, 'b');
});

test('novo comando apaga o refazer', () => {
  const h = new History();
  h.execute(new FnCommand('a', () => {}, () => {}));
  h.undo();
  h.execute(new FnCommand('b', () => {}, () => {}));
  assert.equal(h.canRedo, false);
});

test('respeita o orçamento de memória e libera comandos antigos', () => {
  const h = new History({ maxBytes: 1000 });
  let disposed = 0;
  for (let i = 0; i < 10; i++) {
    const c = new FnCommand('x' + i, () => {}, () => {}, 400);
    c.dispose = () => disposed++;
    h.push(c);
  }
  assert.ok(h.bytes <= 1000);
  assert.equal(h.undoStack.length, 2);
  assert.equal(disposed, 8);
});

test('macro desfaz na ordem inversa', () => {
  const log = [];
  const m = new MacroCommand('m', [
    new FnCommand('1', () => log.push(1), () => log.push(-1)),
    new FnCommand('2', () => log.push(2), () => log.push(-2)),
  ]);
  m.redo(); m.undo();
  assert.deepEqual(log, [1, 2, -2, -1]);
});
