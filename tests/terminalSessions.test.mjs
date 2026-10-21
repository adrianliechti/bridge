import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { ExecSession } from '../src/api/kubernetes/kubernetesExec.ts';
import { ShellSession } from '../src/api/docker/dockerExec.ts';

class FakeWebSocket {
  static OPEN = 1;
  static sockets = [];
  readyState = 0;
  sent = [];
  constructor(url) {
    this.url = url;
    FakeWebSocket.sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 2;
  }
  closed() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '' });
  }
  send(data) {
    this.sent.push(data);
  }
  message(channel, bytes) {
    const payload = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    this.onmessage?.({ data: new Uint8Array([channel, ...payload]).buffer });
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalWindow = globalThis.window;

beforeEach((t) => {
  FakeWebSocket.sockets = [];
  globalThis.WebSocket = FakeWebSocket;
  globalThis.window = { location: { protocol: 'http:', host: 'localhost:8888' } };
  t.mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const options = { context: 'cluster/name #1', namespace: 'default', pod: 'pod', container: 'app' };

for (const Session of [ExecSession, ShellSession]) {
  test(`${Session.name}: split Unicode survives interleaved stdout/stderr`, async (t) => {
    const output = [];
    let closes = 0;
    const session = new Session({
      ...options,
      onData: (text) => output.push(text),
      onClose: () => closes++,
    });
    const connected = session.connect();
    const ws = FakeWebSocket.sockets[0];
    assert.match(new URL(ws.url).pathname, /cluster%2Fname%20%231/);
    ws.open();
    t.mock.timers.tick(200);
    await connected;
    const bytes = new TextEncoder().encode('🙂');
    ws.message(1, bytes.subarray(0, 2));
    ws.message(2, 'stderr');
    ws.message(1, bytes.subarray(2));
    assert.deepEqual(output, ['stderr', '🙂']);
    session.send('café');
    assert.equal(ws.sent[0][0], 0);
    assert.equal(new TextDecoder().decode(ws.sent[0].subarray(1)), 'café');
    ws.closed();
    assert.equal(closes, 1);
  });

  test(`${Session.name}: disconnect suppresses late output`, async (t) => {
    const output = [];
    const session = new Session({ ...options, onData: (text) => output.push(text) });
    const connected = session.connect();
    const ws = FakeWebSocket.sockets[0];
    ws.open();
    t.mock.timers.tick(200);
    await connected;
    session.disconnect();
    ws.message(1, 'stale output');
    ws.closed();
    assert.deepEqual(output, []);
    assert.equal(session.isConnected, false);
  });
}

test('pod exec sends the entire custom command as one argv', async (t) => {
  const command = ['/bin/sh', '-c', 'printf hello'];
  const session = new ExecSession({ ...options, command, onData() {} });
  const connected = session.connect();
  const ws = FakeWebSocket.sockets[0];
  assert.deepEqual(new URL(ws.url).searchParams.getAll('command'), command);
  ws.open();
  t.mock.timers.tick(200);
  await connected;
  session.disconnect();
  ws.closed();
});

test('a failed bash socket cannot close or write to the successful sh session', async (t) => {
  const output = [];
  let closes = 0;
  const session = new ExecSession({
    ...options,
    onData: (text) => output.push(text),
    onClose: () => closes++,
  });
  const connected = session.connect();
  const bash = FakeWebSocket.sockets[0];
  bash.open();
  bash.message(3, JSON.stringify({ status: 'Failure', message: 'bash not found' }));
  await Promise.resolve();
  const sh = FakeWebSocket.sockets[1];
  assert.deepEqual(new URL(sh.url).searchParams.getAll('command'), ['/bin/sh']);
  sh.open();
  t.mock.timers.tick(200);
  await connected;
  bash.closed();
  bash.message(1, 'stale bash output');
  assert.equal(closes, 0);
  assert.deepEqual(output, []);
  assert.equal(session.isConnected, true);
  sh.message(1, 'ready');
  assert.deepEqual(output, ['ready']);
  session.disconnect();
  sh.closed();
});

test('pod exec preserves the server error when shell attempts fail', async () => {
  const session = new ExecSession({ ...options, onData() {} });
  const connected = session.connect();
  const rejected = assert.rejects(connected, /forbidden/);
  FakeWebSocket.sockets[0].message(3, '{"status":"Failure","message":"forbidden"}');
  await Promise.resolve();
  FakeWebSocket.sockets[1].message(3, '{"status":"Failure","message":"forbidden"}');
  await rejected;
});
