# Bridge

Bridge is a local dashboard for Kubernetes, Docker, and Apple container.
A single Go binary serves an embedded web UI and talks directly to your
existing contexts — no agents, no cluster-side install, nothing leaves
your machine.

It ships as a small desktop app.

## Features

- **Kubernetes** — browse the resources of any context in your kubeconfig:
  workloads, networking, storage, configuration, and more, with live logs
  and an interactive terminal for pods.
- **Docker** — containers, images, volumes, and networks for every Docker
  context (Docker Desktop, remote engines over SSH/TLS, etc.), including
  container logs, shell access, and lifecycle actions
  (create, start, stop, restart, delete).
- **Apple container** — on macOS, containers managed by
  [apple/container](https://github.com/apple/container) appear as the
  `apple` context. Bridge emulates the subset of the Docker Engine API the
  UI needs on top of the `container` CLI (version 1.1.x), so listing,
  creating, logs, terminal, images, volumes, and networks all work the
  same way as with Docker.
- **AI assistant** (optional) — a chat panel wired to an OpenAI-compatible
  API that can inspect your cluster and containers using tools.

## Installation

```sh
brew install --cask adrianliechti/tap/bridge-app
```

## Configuration

Bridge discovers everything from the tools you already use:

- **Kubernetes contexts** come from your kubeconfig
  (`~/.kube/config` or `$KUBECONFIG`).
- **Docker contexts** come from the Docker CLI configuration
  (`docker context ls`).
- **Apple container** is picked up automatically on macOS when the
  `container` binary is on your `PATH`.

The AI assistant is enabled through environment variables:

| Variable          | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `OPENAI_API_KEY`  | API key                                                 |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint (defaults to the OpenAI API) |
| `OPENAI_MODEL`    | Model id to use                                         |

## Development

The backend is Go (`pkg/`, `cmd/`, `app/`); the frontend is React +
TypeScript built with Vite (`src/`). [Task](https://taskfile.dev) drives
the common workflows.

Run the UI against a live cluster and Docker engine:

```sh
task kubernetes-proxy   # kubectl proxy on :8001 (allows pod exec)
task docker-proxy       # docker socket on tcp://127.0.0.1:2375
task client             # vite dev server on http://localhost:5173
```

The dev contexts (`local-cluster`, `local-docker`) are defined in
`public/config.json`.

Build and run the desktop app:

```sh
task run:app            # build web UI, run the app via go run
task build              # produce Bridge.app / Bridge.exe
task install            # install the app locally
```

## How it works

`pkg/server` hosts the embedded single-page app and exposes each context
under `/contexts/{name}/...`:

- Kubernetes contexts are reverse-proxied to the cluster API server using
  the credentials from your kubeconfig.
- Docker contexts are reverse-proxied to the Docker Engine API over the
  context's endpoint (unix socket, tcp, ssh, or https).
- The Apple container context has no daemon socket — its control plane is
  XPC-only — so `pkg/server/server_container.go` translates the required
  Docker Engine API calls into `container` CLI invocations and maps its
  JSON output back.

Interactive terminals use a websocket carrying the Kubernetes exec channel
protocol for all three backends (`exec` API for Docker, `container exec`
on a pty for Apple container).
