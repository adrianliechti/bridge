package server

// Services behind a context that can be started and stopped from the UI: the
// Apple container system services and Docker Desktop.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type systemStatus struct {
	// state as reported by the CLI, e.g. "running", "stopped", "starting"
	Status string `json:"status"`

	Running bool   `json:"running"`
	Version string `json:"version,omitempty"`
}

type systemService interface {
	systemStatus(ctx context.Context) (*systemStatus, error)
	systemStart(ctx context.Context) error
	systemStop(ctx context.Context) error
}

// upper bound for a start / stop: a first Apple container start may download
// the default kernel, Docker Desktop boots a VM
const systemTimeout = 5 * time.Minute

var errNoSystemService = errors.New("context cannot be started or stopped")

// systemKind names the service behind a context ("container" or
// "docker-desktop"), or returns "" if it has none.
func (s *Server) systemKind(name string) string {
	c, ok := s.contexts[name]

	if !ok {
		return ""
	}

	switch {
	case c.Type == "container" && s.container != nil:
		return "container"

	case c.Type == "docker" && s.config.Docker.Desktop != nil && c.Name == s.config.Docker.Desktop.Context:
		return "docker-desktop"
	}

	return ""
}

func (s *Server) systemService(name string) systemService {
	switch s.systemKind(name) {
	case "container":
		return s.container

	case "docker-desktop":
		return &dockerDesktop{path: s.config.Docker.Desktop.Path}
	}

	return nil
}

func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	svc := s.systemService(r.PathValue("context"))

	if svc == nil {
		containerError(w, http.StatusNotFound, errNoSystemService)
		return
	}

	status, err := svc.systemStatus(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	containerJSON(w, status)
}

func (s *Server) handleSystemStart(w http.ResponseWriter, r *http.Request) {
	s.handleSystemAction(w, r, systemService.systemStart)
}

func (s *Server) handleSystemStop(w http.ResponseWriter, r *http.Request) {
	s.handleSystemAction(w, r, systemService.systemStop)
}

func (s *Server) handleSystemAction(w http.ResponseWriter, r *http.Request, action func(systemService, context.Context) error) {
	svc := s.systemService(r.PathValue("context"))

	if svc == nil {
		containerError(w, http.StatusNotFound, errNoSystemService)
		return
	}

	// Detach from the request so navigating away does not abort a half-done
	// start or stop
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), systemTimeout)
	defer cancel()

	if err := action(svc, ctx); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			err = fmt.Errorf("timed out after %s", systemTimeout)
		}

		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
