package server

// Docker Desktop, started and stopped through its CLI plugin (`docker desktop`)

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type dockerDesktop struct {
	path string
}

func (d *dockerDesktop) run(ctx context.Context, args ...string) ([]byte, error) {
	var stdout, stderr bytes.Buffer

	cmd := exec.CommandContext(ctx, d.path, append([]string{"desktop"}, args...)...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// `docker` runs the plugin as a child that keeps the output pipes open
	// after `docker` itself is killed on cancel
	cmd.WaitDelay = time.Second

	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return nil, errors.New(msg)
		}

		return nil, err
	}

	return stdout.Bytes(), nil
}

var errInvalidDockerDesktopStatus = errors.New("invalid docker desktop status response")

func decodeDockerDesktopStatus(data []byte) (*systemStatus, error) {
	var status struct {
		Status string `json:"Status"`
	}

	if err := json.Unmarshal(data, &status); err != nil {
		return nil, errors.Join(errInvalidDockerDesktopStatus, err)
	}

	if status.Status == "" {
		return nil, errInvalidDockerDesktopStatus
	}

	return &systemStatus{
		Status:  status.Status,
		Running: status.Status == "running",
	}, nil
}

var dockerDesktopStopped = &systemStatus{Status: "stopped"}

// dockerDesktopBackendDown reports whether the Docker Desktop backend is not
// listening (macOS only; its socket goes away when Docker Desktop quits).
func dockerDesktopBackendDown() bool {
	if runtime.GOOS != "darwin" {
		return false
	}

	home, err := os.UserHomeDir()

	if err != nil {
		return false
	}

	conn, err := net.DialTimeout("unix", filepath.Join(home, "Library/Containers/com.docker.docker/Data/backend.sock"), 500*time.Millisecond)

	if err != nil {
		return true
	}

	conn.Close()
	return false
}

func (d *dockerDesktop) systemStatus(ctx context.Context) (*systemStatus, error) {
	if dockerDesktopBackendDown() {
		return dockerDesktopStopped, nil
	}

	// Once Docker Desktop has quit, `status` does not report "stopped": it
	// retries for ~16s, then fails with "Could not retrieve status. Is Docker
	// Desktop running?". A running backend answers within milliseconds.
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	data, err := d.run(ctx, "status", "--format", "json")

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return dockerDesktopStopped, nil
	}

	if err != nil {
		if strings.Contains(err.Error(), "Could not retrieve status") {
			return dockerDesktopStopped, nil
		}

		return nil, err
	}

	return decodeDockerDesktopStatus(data)
}

func (d *dockerDesktop) systemStart(ctx context.Context) error {
	_, err := d.run(ctx, "start")
	return err
}

func (d *dockerDesktop) systemStop(ctx context.Context) error {
	_, err := d.run(ctx, "stop")
	return err
}
