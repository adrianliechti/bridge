package config

import (
	"context"
	"errors"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type KubernetesConfig struct {
	Contexts []KubernetesContext

	CurrentContext   string
	CurrentNamespace string

	TenancyLabels      []string
	PlatformNamespaces []string
}

type KubernetesContext struct {
	Name string

	Config func(ctx context.Context, auth *AuthInfo) (*rest.Config, error)
}

func applyKubernetesConfig(cfg *Config) error {
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, &clientcmd.ConfigOverrides{})

	config, err := kubeconfig.RawConfig()

	if err != nil {
		return err
	}

	contexts := make([]KubernetesContext, 0)

	for contextName := range config.Contexts {
		contextConfig := clientcmd.NewNonInteractiveClientConfig(config, contextName, &clientcmd.ConfigOverrides{}, loader)

		contexts = append(contexts, KubernetesContext{
			Name: contextName,

			Config: func(ctx context.Context, auth *AuthInfo) (*rest.Config, error) {
				return contextConfig.ClientConfig()
			},
		})
	}

	if len(contexts) == 0 {
		return errors.New("no valid kubernetes contexts found in kubeconfig")
	}

	cfg.Kubernetes = &KubernetesConfig{
		Contexts: contexts,

		CurrentContext: config.CurrentContext,
	}

	if c, ok := config.Contexts[config.CurrentContext]; ok && c.Namespace != "" {
		cfg.Kubernetes.CurrentNamespace = c.Namespace
	}

	return nil
}
