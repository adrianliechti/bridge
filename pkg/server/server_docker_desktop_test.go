package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fakeDocker writes a stand-in for the docker CLI that runs script.
func fakeDocker(t *testing.T, script string) string {
	path := filepath.Join(t.TempDir(), "docker")

	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	return path
}

func TestDockerDesktopStatusStopped(t *testing.T) {
	t.Run("could not retrieve status", func(t *testing.T) {
		t.Parallel()

		// printed (exit status 1) once Docker Desktop has quit
		d := &dockerDesktop{path: fakeDocker(t, `echo "Could not retrieve status. Is Docker Desktop running?" >&2; exit 1`)}

		status, err := d.systemStatus(context.Background())

		if err != nil || status.Running || status.Status != "stopped" {
			t.Errorf("status = %+v, err = %v, want stopped", status, err)
		}
	})

	t.Run("no answer", func(t *testing.T) {
		t.Parallel()

		// the CLI plugin runs as a child that keeps the output open
		d := &dockerDesktop{path: fakeDocker(t, `sleep 20 & wait`)}

		start := time.Now()
		status, err := d.systemStatus(context.Background())

		if err != nil || status.Running || status.Status != "stopped" {
			t.Errorf("status = %+v, err = %v, want stopped", status, err)
		}

		if elapsed := time.Since(start); elapsed > 6*time.Second {
			t.Errorf("took %s, want the 3s status timeout to apply", elapsed)
		}
	})
}
