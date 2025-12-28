package server

import (
	"k8s.io/client-go/rest"
)

type BridgeContext struct {
	Name   string
	Config *rest.Config
}

type BridgeOptions struct {
	OpenAIKey     string
	OpenAIModel   string
	OpenAIBaseURL string

	DefaultContext   string
	DefaultNamespace string

	PlatformNamespaces  []string
	PlatformSpaceLabels []string
}
