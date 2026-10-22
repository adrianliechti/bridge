package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sync/atomic"
	"testing"

	"github.com/adrianliechti/bridge/pkg/config"
)

// fakeDockerDaemon serves /_ping on a unix socket and counts the connections
// it accepts. The socket lives under /tmp: macOS limits socket paths to 104
// bytes, which t.TempDir() can exceed.
func fakeDockerDaemon(t *testing.T) (string, *atomic.Int32) {
	dir, err := os.MkdirTemp("/tmp", "bridge")

	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { os.RemoveAll(dir) })

	socket := filepath.Join(dir, "docker.sock")

	l, err := net.Listen("unix", socket)

	if err != nil {
		t.Fatal(err)
	}

	var conns atomic.Int32

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("OK"))
		}),

		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				conns.Add(1)
			}
		},
	}

	go srv.Serve(l)
	t.Cleanup(func() { srv.Close() })

	return socket, &conns
}

func TestAvailableDockerContexts(t *testing.T) {
	socket, _ := fakeDockerDaemon(t)

	s := &Server{
		config: &config.Config{
			Docker: &config.DockerConfig{
				Contexts: []config.DockerContext{
					{Name: "running", Host: "unix://" + socket},
					{Name: "stopped", Host: "unix://" + filepath.Join(filepath.Dir(socket), "missing.sock")},
					{Name: "remote", Host: "ssh://user@example.invalid"},
				},
			},
		},
	}

	var names []string

	for _, c := range s.availableDockerContexts(context.Background()) {
		names = append(names, c.Name)
	}

	if want := []string{"running", "remote"}; !slices.Equal(names, want) {
		t.Errorf("available = %v, want %v", names, want)
	}
}

func TestDockerProxyReusesConnections(t *testing.T) {
	socket, conns := fakeDockerDaemon(t)

	s := &Server{
		config: &config.Config{
			Docker: &config.DockerConfig{
				Contexts: []config.DockerContext{
					{Name: "local", Host: "unix://" + socket},
				},
			},
		},
	}

	for range 10 {
		proxy, err := s.dockerProxy(context.Background(), "local", nil)

		if err != nil {
			t.Fatal(err)
		}

		w := httptest.NewRecorder()
		proxy.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/_ping", nil))

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
	}

	if got := conns.Load(); got != 1 {
		t.Errorf("connections = %d, want 1 (pooled)", got)
	}
}

func TestSystemKind(t *testing.T) {
	s := &Server{
		config: &config.Config{
			Docker: &config.DockerConfig{
				Desktop: &config.DockerDesktopConfig{Path: "/usr/local/bin/docker", Context: "desktop-linux"},
			},
		},

		contexts: map[string]*Context{
			"desktop-linux": {Type: "docker", Name: "desktop-linux"},
			"colima":        {Type: "docker", Name: "colima"},
			"apple":         {Type: "container", Name: "apple"},
		},

		container: &containerHandler{},
	}

	for name, want := range map[string]string{
		"desktop-linux": "docker-desktop",
		"colima":        "",
		"apple":         "container",
		"unknown":       "",
	} {
		if got := s.systemKind(name); got != want {
			t.Errorf("systemKind(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestDockerDesktopStatusPayload(t *testing.T) {
	// captured from `docker desktop status --format json` (Docker Desktop CLI plugin 4.96.2)
	status, err := decodeDockerDesktopStatus([]byte(`{"PauseType": "", "SessionID": "3a20f2c0-d9d3-454f-a4c7-0c12b7c763f6", "Status": "running"}`))

	if err != nil {
		t.Fatalf("decode docker desktop status: %v", err)
	}

	if !status.Running || status.Status != "running" {
		t.Errorf("status = %+v, want running", status)
	}

	if _, err := decodeDockerDesktopStatus([]byte(`{}`)); !errors.Is(err, errInvalidDockerDesktopStatus) {
		t.Errorf("empty status: error = %v, want invalid docker desktop status", err)
	}
}
