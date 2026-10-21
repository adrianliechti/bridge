import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { attachTerminalClipboard } from '../src/components/terminalClipboard.ts';

let clipboardDescriptor;
let reads;
let writes;

beforeEach(() => {
  reads = 0;
  writes = [];
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: async () => {
        reads++;
        return 'echo café\necho done';
      },
      writeText: async (text) => {
        writes.push(text);
      },
    },
  });
});

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else delete navigator.clipboard;
});

function setup() {
  const terminal = {
    selection: '',
    pasted: [],
    focused: false,
    attachCustomKeyEventHandler(handler) {
      this.key = handler;
    },
    getSelection() {
      return this.selection;
    },
    hasSelection() {
      return this.selection.length > 0;
    },
    paste(text) {
      this.pasted.push(text);
    },
    focus() {
      this.focused = true;
    },
  };
  const errors = [];
  const clipboard = attachTerminalClipboard(terminal, (error) => errors.push(error));
  return { terminal, clipboard, errors };
}

function key(key, modifiers = {}) {
  return {
    key,
    type: 'keydown',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...modifiers,
  };
}

test('Ctrl+C interrupts without a selection and uses native copy with a selection', () => {
  const { terminal } = setup();
  assert.equal(terminal.key(key('c', { ctrlKey: true })), true);
  terminal.selection = 'pod output';
  const event = key('c', { ctrlKey: true });
  assert.equal(terminal.key(event), false);
  assert.equal(event.defaultPrevented, false);
});

test('native Cmd+C/V and Ctrl+V are not cancelled or duplicated', () => {
  const { terminal } = setup();
  for (const event of [
    key('c', { metaKey: true }),
    key('v', { metaKey: true }),
    key('v', { ctrlKey: true }),
  ]) {
    assert.equal(terminal.key(event), false);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(reads, 0);
  assert.deepEqual(writes, []);
});

test('Ctrl+Shift+C copies terminal selection exactly once', async () => {
  const { terminal } = setup();
  terminal.selection = 'café\nsecond line';
  const event = key('C', { ctrlKey: true, shiftKey: true });
  assert.equal(terminal.key(event), false);
  assert.equal(event.defaultPrevented, true);
  terminal.key(key('C', { ctrlKey: true, shiftKey: true, type: 'keyup' }));
  terminal.key(key('C', { ctrlKey: true, shiftKey: true, repeat: true }));
  await Promise.resolve();
  assert.deepEqual(writes, ['café\nsecond line']);
});

test('paste uses xterm paste so bracketed paste and newline handling stay active', async () => {
  const { terminal } = setup();
  const event = key('V', { ctrlKey: true, shiftKey: true });
  assert.equal(terminal.key(event), false);
  assert.equal(event.defaultPrevented, true);
  await Promise.resolve();
  assert.deepEqual(terminal.pasted, ['echo café\necho done']);
  assert.equal(terminal.focused, true);
});

test('clipboard rejection is reported without injecting input', async () => {
  navigator.clipboard.readText = async () => {
    throw new Error('Permission denied');
  };
  const { clipboard, terminal, errors } = setup();
  await clipboard.paste();
  assert.deepEqual(terminal.pasted, []);
  assert.match(errors[0], /denied/);
});

test('pending paste is discarded after the terminal is disposed', async () => {
  let resolve;
  navigator.clipboard.readText = () =>
    new Promise((done) => {
      resolve = done;
    });
  const { clipboard, terminal } = setup();
  const pending = clipboard.paste();
  clipboard.dispose();
  resolve('do not send');
  await pending;
  assert.deepEqual(terminal.pasted, []);
});

test('Alt and composing shortcuts keep their terminal meaning', () => {
  const { terminal } = setup();
  assert.equal(terminal.key(key('c', { ctrlKey: true, altKey: true })), true);
  assert.equal(terminal.key(key('v', { ctrlKey: true, isComposing: true })), true);
});

test('switching containers cancels a pending paste into the previous session', async () => {
  let resolve;
  navigator.clipboard.readText = () =>
    new Promise((done) => {
      resolve = done;
    });
  const { clipboard, terminal } = setup();
  const pending = clipboard.paste();
  clipboard.cancelPendingPaste();
  resolve('do not send to the new container');
  await pending;
  assert.deepEqual(terminal.pasted, []);
});
