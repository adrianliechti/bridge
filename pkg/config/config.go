package config

import (
	"k8s.io/client-go/rest"
)

type Config struct {
	OpenAI *OpenAIConfig

	Docker     *DockerConfig
	Kubernetes *KubernetesConfig
}

type Context struct {
	Name   string
	Config *rest.Config
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
