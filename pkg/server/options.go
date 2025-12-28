package server

type Options struct {
	OpenAIKey     string
	OpenAIModel   string
	OpenAIBaseURL string

	DefaultContext   string
	DefaultNamespace string

	PlatformNamespaces  []string
	PlatformSpaceLabels []string
}
