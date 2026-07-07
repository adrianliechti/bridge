package config

import (
	"os/exec"
	"runtime"
)

type ContainerConfig struct {
	Path string
}

func applyContainerConfig(cfg *Config) error {
	if runtime.GOOS != "darwin" {
		return nil
	}

	path, err := exec.LookPath("container")

	if err != nil {
		return nil
	}

	cfg.Container = &ContainerConfig{
		Path: path,
	}

	return nil
}
