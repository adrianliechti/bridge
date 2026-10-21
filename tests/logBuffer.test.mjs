import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogBuffer } from '../src/hooks/logBuffer.ts';

test('busy log streams publish once per batch and retain the latest lines in order', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [];
  const buffer = createLogBuffer((snapshot) => updates.push(snapshot), 3);
  for (let i = 0; i < 10000; i++) buffer.push(i);
  assert.equal(updates.length, 0);
  t.mock.timers.tick(100);
  assert.deepEqual(updates, [{ entries: [9997, 9998, 9999], dropped: 9997 }]);
  buffer.push(10000);
  t.mock.timers.tick(100);
  assert.deepEqual(updates[1], { entries: [9998, 9999, 10000], dropped: 9998 });
  assert.deepEqual(
    updates[0].entries,
    [9997, 9998, 9999],
    'published snapshots must stay unchanged',
  );
});

test('stream completion flushes pending logs; disposal prevents late updates', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [];
  const buffer = createLogBuffer((snapshot) => updates.push(snapshot));
  buffer.push('last line');
  buffer.flush();
  assert.equal(updates.length, 1);
  buffer.push('old session');
  buffer.dispose();
  buffer.push('after dispose');
  t.mock.timers.tick(200);
  buffer.flush();
  assert.deepEqual(updates, [{ entries: ['last line'], dropped: 0 }]);
});
