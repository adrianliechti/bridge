package server

import (
	"context"
	"net"
	"testing"

	"github.com/adrianliechti/bridge/pkg/config"
	"k8s.io/client-go/rest"
)

// kubernetesContext points a context at host:port without any credentials.
func kubernetesContext(name, addr string) config.KubernetesContext {
	return config.KubernetesContext{
		Name: name,

		Config: func(ctx context.Context, auth *config.AuthInfo) (*rest.Config, error) {
			return &rest.Config{Host: "https://" + addr}, nil
		},
	}
}

func TestDefaultKubernetesContext(t *testing.T) {
	up, err := net.Listen("tcp", "127.0.0.1:0")

	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { up.Close() })

	closed, err := net.Listen("tcp", "127.0.0.1:0")

	if err != nil {
		t.Fatal(err)
	}

	down := closed.Addr().String()
	closed.Close()

	tests := []struct {
		name     string
		current  string
		contexts []config.KubernetesContext
		want     string
	}{
		{
			name:     "current reachable",
			current:  "b",
			contexts: []config.KubernetesContext{kubernetesContext("a", up.Addr().String()), kubernetesContext("b", up.Addr().String())},
			want:     "b",
		},
		{
			name:     "current down",
			current:  "kind",
			contexts: []config.KubernetesContext{kubernetesContext("kind", down), kubernetesContext("remote", up.Addr().String())},
			want:     "remote",
		},
		{
			name:     "all down",
			current:  "kind",
			contexts: []config.KubernetesContext{kubernetesContext("kind", down), kubernetesContext("docker-desktop", down)},
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{
				config: &config.Config{
					Kubernetes: &config.KubernetesConfig{
						Contexts:       tt.contexts,
						CurrentContext: tt.current,
					},
				},
			}

			if got := s.defaultKubernetesContext(context.Background()); got != tt.want {
				t.Errorf("default = %q, want %q", got, tt.want)
			}
		})
	}
}
