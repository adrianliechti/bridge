package config

type Config struct {
	OpenAI *OpenAIConfig

	Docker     *DockerConfig
	Kubernetes *KubernetesConfig
}

type AuthInfo struct {
	Bearer string
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
