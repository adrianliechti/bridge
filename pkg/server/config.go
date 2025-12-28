package server

type Config struct {
	Context   string `json:"context,omitempty"`
	Namespace string `json:"namespace,omitempty"`

	AI       *AIConfig       `json:"ai,omitempty"`
	Platform *PlatformConfig `json:"platform,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}

type PlatformConfig struct {
	Namespaces []string `json:"namespaces,omitempty"`

	Spaces *PlatformSpacesConfig `json:"spaces,omitempty"`
}

type PlatformSpacesConfig struct {
	Labels []string `json:"labels,omitempty"`
}
