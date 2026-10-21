import assert from 'node:assert/strict';
import { test } from 'node:test';
import { responseError } from '../src/api/errors.ts';
import {
  getContainerLogs,
  streamContainerLogs,
  runContainer,
  listContainers,
  stopContainer,
  startContainer,
  ContainerStartError,
} from '../src/api/docker/docker.ts';

function streamedResponse(chunks) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}

function frame(channel, payload) {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const result = new Uint8Array(bytes.length + 8);
  result[0] = channel;
  new DataView(result.buffer).setUint32(4, bytes.length);
  result.set(bytes, 8);
  return result;
}

test('API errors show Docker/Kubernetes messages and plain proxy errors', async () => {
  for (const [body, expected] of [
    ['{"message":"port is already allocated"}', 'port is already allocated'],
    ['{"kind":"Status","message":"pods is forbidden"}', 'pods is forbidden'],
    ['docker socket not found\n', 'docker socket not found'],
    ['', 'Request failed: 500'],
    ['<html>Bad gateway</html>', 'Request failed: 500'],
    ['{"details":{}}', 'Request failed: 500'],
  ]) {
    assert.equal(
      await responseError(new Response(body, { status: 500 }), 'Request failed'),
      expected,
    );
  }
});

test('list and lifecycle failures retain the daemon explanation', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{"message":"daemon unavailable"}', { status: 503 }),
  );
  await assert.rejects(listContainers('test'), /daemon unavailable/);
  await assert.rejects(stopContainer('test', 'app'), /daemon unavailable/);
});

test('HTTP 200 image-pull failures stop creation and show the registry error', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    if (url.includes('/containers/create'))
      return new Response('{"message":"No such image"}', { status: 404 });
    return streamedResponse([
      new TextEncoder().encode('{"status":"Pulling"}\n{"errorDet'),
      new TextEncoder().encode('ail":{"message":"pull access denied"}}'),
    ]);
  });
  const phases = [];
  await assert.rejects(
    runContainer('test', { image: 'private/image' }, (phase) => phases.push(phase)),
    /pull access denied/,
  );
  assert.equal(requests.length, 2, 'must not retry creation or start after a failed pull');
  assert.deepEqual(phases, ['creating', 'pulling']);
});

test('successful streamed pulls continue to create and start', async (t) => {
  let creates = 0;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    if (url.includes('/containers/create')) {
      creates++;
      return creates === 1
        ? new Response('{"message":"No such image"}', { status: 404 })
        : new Response('{"Id":"new-container"}', { status: 201 });
    }
    if (url.includes('/images/create')) return new Response('{"status":"Downloaded"}\n');
    return new Response(null, { status: 204 });
  });
  assert.equal(await runContainer('test', { image: 'alpine' }), 'new-container');
  assert.match(requests.at(-1), /new-container\/start$/);
});

test('start failure retains the created container for retry without another create', async (t) => {
  const requests = [];
  let startFails = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    if (new URL(url, 'http://localhost').pathname.endsWith('/containers/create'))
      return Response.json({ Id: 'created-container' });
    return startFails
      ? new Response('{"message":"port already allocated"}', { status: 500 })
      : new Response(null, { status: 204 });
  });
  let containerId;
  await assert.rejects(runContainer('test', { image: 'alpine' }), (error) => {
    assert.ok(error instanceof ContainerStartError);
    assert.match(error.message, /was created.*port already allocated/);
    containerId = error.containerId;
    return true;
  });
  startFails = false;
  await startContainer('test', containerId);
  assert.equal(
    requests.filter((url) =>
      new URL(url, 'http://localhost').pathname.endsWith('/containers/create'),
    ).length,
    1,
  );
  assert.ok(requests.slice(1).every((url) => url.endsWith('/containers/created-container/start')));
});

test('stopped container logs use follow=false and remove Docker binary headers', async (t) => {
  let requestedUrl;
  const encoded = frame(1, 'last output before exit\n');
  t.mock.method(globalThis, 'fetch', async (url) => {
    requestedUrl = url;
    return streamedResponse([encoded.subarray(0, 2), encoded.subarray(2, 7), encoded.subarray(7)]);
  });
  assert.equal(await getContainerLogs('test', 'stopped'), 'last output before exit');
  assert.equal(new URL(requestedUrl, 'http://localhost').searchParams.has('follow'), false);
});

test('log streams keep split Unicode and partial stdout/stderr separate', async (t) => {
  const bytes = new TextEncoder().encode('🙂\n');
  t.mock.method(globalThis, 'fetch', async () =>
    streamedResponse([
      frame(1, 'out '),
      frame(2, 'error\n'),
      frame(1, bytes.subarray(0, 2)),
      frame(1, bytes.subarray(2)),
    ]),
  );
  const lines = [];
  let ready = 0;
  await streamContainerLogs(
    'test',
    'app',
    { follow: false },
    (line) => lines.push(line),
    undefined,
    () => ready++,
  );
  assert.deepEqual(lines, ['error', 'out 🙂']);
  assert.equal(ready, 1);
});

test('raw TTY logs preserve a final line without a newline', async (t) => {
  const bytes = new TextEncoder().encode('café');
  t.mock.method(globalThis, 'fetch', async () =>
    streamedResponse([bytes.subarray(0, 4), bytes.subarray(4)]),
  );
  assert.equal(await getContainerLogs('test', 'tty'), 'café');
});
