package server

type Context struct {
	Name string `json:"name"`
}

type Config struct {
	DefaultContext   string `json:"defaultContext,omitempty"`
	DefaultNamespace string `json:"defaultNamespace,omitempty"`

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
