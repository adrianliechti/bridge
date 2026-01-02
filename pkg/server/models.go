package server

type Config struct {
	AI *AIConfig `json:"ai,omitempty"`

	Docker     *DockerConfig     `json:"docker,omitempty"`
	Kubernetes *KubernetesConfig `json:"kubernetes,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}
type DockerConfig struct {
	Contexts []string `json:"contexts,omitempty"`

	CurrentContext string `json:"defaultContext,omitempty"`
}

type KubernetesConfig struct {
	Contexts []string `json:"contexts,omitempty"`

	DefaultContext   string `json:"defaultContext,omitempty"`
	DefaultNamespace string `json:"defaultNamespace,omitempty"`

	TenancyLabels      []string `json:"tenancyLabels,omitempty"`
	PlatformNamespaces []string `json:"platformNamespaces,omitempty"`
}
