package config

import (
	"github.com/docker/cli/cli/config"
	"github.com/docker/cli/cli/context/store"
)

type DockerConfig struct {
	Contexts []DockerContext

	CurrentContext string
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
	}

	return nil
}
