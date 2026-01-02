package config

import (
	"errors"
	"fmt"

	"k8s.io/client-go/tools/clientcmd"
)

type KubernetesConfig struct {
	Contexts []Context

	CurrentContext   string
	CurrentNamespace string

	TenancyLabels      []string
	PlatformNamespaces []string
}

func applyKubernetesConfig(cfg *Config) error {
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, &clientcmd.ConfigOverrides{})

	config, err := kubeconfig.RawConfig()

	if err != nil {
		return err
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
