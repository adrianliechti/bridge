package config

import (
	"context"

	"k8s.io/client-go/rest"
)

type Config struct {
	OpenAI *OpenAIConfig

	Docker     *DockerConfig
	Kubernetes *KubernetesConfig
}

type Context struct {
	Name string

	Config func(ctx context.Context) (*rest.Config, error)
}

type OpenAIConfig struct {
	URL   string
	Token string
	Model string
}

func New() (*Config, error) {
	cfg := &Config{}

	applyOpenAIConfig(cfg)
	applyDockerConfig(cfg)
	applyKubernetesConfig(cfg)

	return cfg, nil
}
