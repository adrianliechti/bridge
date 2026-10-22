package config

import (
	"os/exec"
	"slices"

	"github.com/docker/cli/cli/config"
	"github.com/docker/cli/cli/context/store"
)

type DockerConfig struct {
	Contexts []DockerContext

	CurrentContext string

	// set when Docker Desktop and its CLI plugin (`docker desktop`) are
	// installed, so its engine can be started and stopped
	Desktop *DockerDesktopConfig
}

type DockerDesktopConfig struct {
	// docker CLI
	Path string

	// context Docker Desktop creates for its engine
	Context string
}

type DockerContext struct {
	Name        string
	Description string

	Host          string
	SkipTLSVerify bool
}

func applyDockerConfig(cfg *Config) error {
	c, err := config.Load("")

	if err != nil {
		return err
	}

	s := store.New(config.ContextStoreDir(), store.Config{})

	metadatas, err := s.List()

	if err != nil {
		return err
	}

	contexts := make([]DockerContext, 0)

	for _, c := range metadatas {
		context := DockerContext{
			Name: c.Name,
		}

		if metadata, ok := c.Metadata.(map[string]any); ok {
			if val, ok := metadata["Description"].(string); ok {
				context.Description = val
			}
		}

		if docker, ok := c.Endpoints["docker"].(map[string]any); ok {
			if val, ok := docker["Host"].(string); ok {
				context.Host = val
			}

			if val, ok := docker["SkipTLSVerify"].(bool); ok {
				context.SkipTLSVerify = val
			}
		}

		contexts = append(contexts, context)
	}

	cfg.Docker = &DockerConfig{
		Contexts: contexts,

		CurrentContext: c.CurrentContext,

		Desktop: detectDockerDesktop(contexts),
	}

	return nil
}

func detectDockerDesktop(contexts []DockerContext) *DockerDesktopConfig {
	const context = "desktop-linux"

	if !slices.ContainsFunc(contexts, func(c DockerContext) bool { return c.Name == context }) {
		return nil
	}

	path, err := lookPath("docker", "/usr/local/bin/docker", "/Applications/Docker.app/Contents/Resources/bin/docker")

	if err != nil {
		return nil
	}

	// fails with "'desktop' is not a docker command" without the plugin
	if err := exec.Command(path, "desktop", "version").Run(); err != nil {
		return nil
	}

	return &DockerDesktopConfig{
		Path:    path,
		Context: context,
	}
}
