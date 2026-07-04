---
name: verify
description: Build, run, and drive the Bridge web UI (Kubernetes/Docker dashboard) to verify changes end-to-end.
---

# Verifying Bridge

## Handles

Three processes, then drive the browser:

```bash
# --reject-paths override is REQUIRED for the Terminal tab: kubectl proxy
# blocks /pods/*/exec by default (403 on the websocket).
kubectl proxy --address=127.0.0.1 --port=8001 --reject-paths='^/never-reject$'   # "local-cluster" context
socat -4 TCP-LISTEN:2375,bind=127.0.0.1,fork UNIX-CONNECT:/var/run/docker.sock   # "local-docker"
npm run dev                                            # vite on http://localhost:5173
```

The `/contexts/local-cluster` vite proxy needs `ws: true` (in vite.config.ts) or terminal
websockets die at the dev server. To exercise terminal/logs, `kubectl run` a busybox pod
(`bridge-shell-test`) and `docker run` a busybox loop container — most system pods
(coredns, local-path-provisioner) are distroless with NO shell.

`public/config.json` defines the dev contexts (`local-cluster`, `local-docker`) and the AI model.
The `/openai` vite proxy targets `http://localhost:8080` — an OpenAI-compatible gateway usually
running locally; `GET /v1/models` lists valid ids (`auto` works). If chat errors with
"400 completer not found", the configured `ai.model` doesn't exist on the gateway.

## Driving

No Playwright in the repo. Install `playwright-core` in a scratch dir and launch the cached
browser directly:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Users/adrian/Library/Caches/ms-playwright/<chromium-XXXX>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: true,
});
```

Locator gotchas:
- The resource detail panel is `aside.fixed`; the left nav is also an `aside`, so scope tab
  clicks to `aside.fixed` or you get strict-mode violations.
- Table rows: `tbody tr`; namespace is the 2nd column in all-namespaces view.
- Chat panel: open via `button[title="AI Assistant"]`, input via placeholder
  `/Ask about your Kubernetes/`.

## Flows worth driving

- `/` auto-redirects to `/cluster/local-cluster`.
- Row click → URL `/cluster/<ctx>/<type>/<name>`; tabs write `?tab=...`; reload with a
  `?tab=` deep link must keep that tab active.
- Duplicate pod names across namespaces (create two namespaces each with a same-named pod)
  — clicking either row must open that row's pod, and its row stays highlighted.
- Unknown resource type URLs: `/cluster/<ctx>/garbage` shows a not-found message;
  `/docker/<ctx>/garbage` redirects to the docker welcome.
- AI chat round-trip: ask "list the pods in namespace X" — should tool-call against the
  live cluster and answer; with a bad model id the red error banner must appear.

Clean up any test namespaces you create (`kubectl delete ns ...`).
