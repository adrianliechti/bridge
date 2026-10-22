package config

import (
	"runtime"
)

type ContainerConfig struct {
	Path string
}

func applyContainerConfig(cfg *Config) error {
	if runtime.GOOS != "darwin" {
		return nil
	}

	path, err := lookPath("container", "/opt/homebrew/bin/container", "/usr/local/bin/container")

	if err != nil {
		return nil
	}

	cfg.Container = &ContainerConfig{
		Path: path,
	}

	return nil
}
