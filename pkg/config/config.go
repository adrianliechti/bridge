package config

import (
	"errors"
	"fmt"
	"os"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type Config struct {
	Contexts []Context

	CurrentContext   string
	CurrentNamespace string

	OpenAI   *OpenAIConfig
	Platform *PlatformConfig
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

type PlatformConfig struct {
	PlatformNamespaces  []string
	PlatformSpaceLabels []string
}

func New() (*Config, error) {
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, &clientcmd.ConfigOverrides{})

	config, err := kubeconfig.RawConfig()

	if err != nil {
		return nil, err
	}

	contexts := make([]Context, 0)

	for contextName := range config.Contexts {
		contextConfig := clientcmd.NewNonInteractiveClientConfig(config, contextName, &clientcmd.ConfigOverrides{}, loader)

		restConfig, err := contextConfig.ClientConfig()

		if err != nil {
			fmt.Printf("Warning: failed to load context %q: %v\n", contextName, err)
			continue
		}

		contexts = append(contexts, Context{
			Name:   contextName,
			Config: restConfig,
		})
	}

	if len(contexts) == 0 {
		return nil, errors.New("no valid kubernetes contexts found in kubeconfig")
	}

	cfg := &Config{
		Contexts: contexts,

		CurrentContext: config.CurrentContext,
	}

	if c, ok := config.Contexts[config.CurrentContext]; ok && c.Namespace != "" {
		cfg.CurrentNamespace = c.Namespace
	}

	applyOpenAIConfig(cfg)

	return cfg, nil
}

func applyOpenAIConfig(cfg *Config) {
	baseURL := os.Getenv("OPENAI_BASE_URL")
	apiKey := os.Getenv("OPENAI_API_KEY")
	model := os.Getenv("OPENAI_MODEL")

	if baseURL == "" && apiKey == "" {
		return
	}

	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"

		if model == "" {
			model = "gpt-5.2"
		}
	}

	cfg.OpenAI = &OpenAIConfig{
		URL:   baseURL,
		Token: apiKey,
		Model: model,
	}
}
