# Bridge

Bridge is a local dashboard for Kubernetes, Docker, and Apple container.
A single Go binary serves an embedded web UI and talks directly to your
existing contexts — no agents, no cluster-side install, nothing leaves
your machine.

It ships as a small desktop app.

## Features

- **Kubernetes** — browse the resources of any context in your kubeconfig:
  workloads, networking, storage, configuration, and more, with live logs
  and an interactive terminal for pods. Network Policies include selected-pod
  matches and readable ingress/egress rules, selectors, ports, and IP exceptions.
  Overview maps every workload by namespace — readiness, one square per pod,
  and the hosts, services, volumes, and config it uses — under a "Needs
  attention" list that explains what is failing.
- **Docker** — containers, images, volumes, and networks for every Docker
  context (Docker Desktop, remote engines over SSH/TLS, etc.), including
  container logs, shell access, and lifecycle actions
  (create, start, stop, restart, delete). Contexts whose daemon is not
  running are hidden — except Docker Desktop, which Bridge can start and
  stop itself (`docker desktop start` / `stop`) when its CLI plugin is
  installed.
  The context picker labels Docker contexts "Docker" (plus the context name
  when there are several) and Apple container "Container".
- **Apple container** — on macOS, containers managed by
  [apple/container](https://github.com/apple/container) appear as the
  `apple` context. Bridge emulates the subset of the Docker Engine API the
  UI needs on top of the `container` CLI (version 1.6.x), so listing,
  creating, logs, terminal, images, volumes, and networks all work the
  same way as with Docker. The sidebar shows whether the container system
  services are running and starts / stops them
  (`container system start` / `stop`).
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
  `container` binary is on your `PATH` (or in `/opt/homebrew/bin` or
  `/usr/local/bin`, since apps started from Finder get a minimal `PATH`).

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
task run:kubernetes-proxy   # kubectl proxy on :8001 (allows pod exec)
task run:docker-proxy       # docker socket on tcp://127.0.0.1:2375
task run:client             # vite dev server on http://localhost:5173
```

The dev contexts (`local-cluster`, `local-docker`) are defined in
`public/config.json`.

Run the checks (Node.js 22.18+ is required for the frontend tests):

```sh
npm test
npm run lint
npm run build
go test ./...
```

Pod and container terminals support Cmd+C/V, Ctrl+Shift+C/V, and Ctrl+V. Ctrl+C copies selected terminal text; without
a selection it interrupts the running command. If clipboard permissions
block a shortcut, use the terminal's right-click clipboard menu.
Reopen the Terminal tab to start a new session after disconnecting.

Docker logs remain available after a container stops. Log views keep the
latest 5,000 lines and show when older lines have been discarded; failed
log requests can be retried in place.

To try the Network Policy inspector, apply the two self-contained examples
to your chosen Kubernetes context:

```sh
kubectl --context YOUR_CONTEXT apply -f examples/network-policies/
```

In Bridge, choose that context, open **Network → Network Policies**, and
select the corresponding namespace (or all namespaces):

| Example                                           | Namespace               | Expected display                                                                                            |
| ------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Simple](examples/network-policies/simple.yaml)   | `bridge-policy-simple`  | One matching pod; ingress **Deny all by default**, egress **Not isolated here**                             |
| [Complex](examples/network-policies/complex.yaml) | `bridge-policy-complex` | Two matching pods (`api-stable`, `api-canary`), excluding `api-debug`; both directions **Selected traffic** |

The complex example includes AND/OR peers, all four selector expression
operators, namespace selectors, IP exceptions, named ports, a port range,
TCP/UDP DNS rules, and a rule allowing all ports. These are visual fixtures:
the placeholder pods serve no traffic, and peer workloads are not included.
Each example creates its own namespace. Remove the examples with:

```sh
kubectl --context YOUR_CONTEXT delete -f examples/network-policies/
```

Build and run the desktop app:

```sh
task run:app            # build the app and launch it with web inspection
task build:app          # produce Bridge.app / Bridge.exe
task install            # install the kubectl plugin and the app locally
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
