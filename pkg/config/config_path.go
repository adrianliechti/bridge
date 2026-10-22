package config

import (
	"os"
	"os/exec"
)

// lookPath finds a CLI on the PATH, or else in one of its usual install
// locations: apps started from Finder only get a minimal PATH.
func lookPath(name string, fallbacks ...string) (string, error) {
	path, err := exec.LookPath(name)

	if err == nil {
		return path, nil
	}

	for _, p := range fallbacks {
		if info, statErr := os.Stat(p); statErr == nil && !info.IsDir() {
			return p, nil
		}
	}

	return "", err
}
