package config

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type Config struct {
	Contexts []Context

	CurrentContext   string
	CurrentNamespace string

	OpenAI   *OpenAIConfig
	Platform *PlatformConfig
	Docker   *DockerConfig
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

type DockerConfig struct {
	Host      string // DOCKER_HOST value (unix://, tcp://, https://)
	Transport http.RoundTripper
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
	applyDockerConfig(cfg)

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

func applyDockerConfig(cfg *Config) {
	host := os.Getenv("DOCKER_HOST")

	if host == "" {
		// Default to Unix socket
		host = "unix:///var/run/docker.sock"
	}

	transport, err := createDockerTransport(host)
	if err != nil {
		fmt.Printf("Warning: Docker not available: %v\n", err)
		return
	}

	cfg.Docker = &DockerConfig{
		Host:      host,
		Transport: transport,
	}
}

func createDockerTransport(host string) (http.RoundTripper, error) {
	u, err := url.Parse(host)
	if err != nil {
		return nil, fmt.Errorf("invalid DOCKER_HOST: %w", err)
	}

	switch u.Scheme {
	case "unix":
		socketPath := u.Path
		if socketPath == "" {
			socketPath = "/var/run/docker.sock"
		}

		// Check if socket exists and is accessible
		if _, err := os.Stat(socketPath); err != nil {
			return nil, fmt.Errorf("docker socket not found: %w", err)
		}

		return &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		}, nil

	case "tcp", "http":
		return &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
		}, nil

	case "https":
		tlsConfig := &tls.Config{}

		// Check for DOCKER_CERT_PATH
		certPath := os.Getenv("DOCKER_CERT_PATH")
		if certPath != "" {
			cert, err := tls.LoadX509KeyPair(
				certPath+"/cert.pem",
				certPath+"/key.pem",
			)
			if err != nil {
				return nil, fmt.Errorf("failed to load docker certs: %w", err)
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}

		// Check DOCKER_TLS_VERIFY
		if os.Getenv("DOCKER_TLS_VERIFY") == "" {
			tlsConfig.InsecureSkipVerify = true
		}

		return &http.Transport{
			TLSClientConfig: tlsConfig,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
		}, nil

	default:
		return nil, fmt.Errorf("unsupported DOCKER_HOST scheme: %s", u.Scheme)
	}
}

func getDockerAPIHost(host string) (string, error) {
	u, err := url.Parse(host)
	if err != nil {
		return "", err
	}

	switch u.Scheme {
	case "unix":
		return "http://localhost", nil
	case "tcp", "http":
		return "http://" + u.Host, nil
	case "https":
		return "https://" + u.Host, nil
	default:
		return "", fmt.Errorf("unsupported scheme: %s", u.Scheme)
	}
}

// GetDockerAPIHost returns the HTTP host URL for Docker API calls
func (c *DockerConfig) GetAPIHost() (string, error) {
	return getDockerAPIHost(c.Host)
}

// IsUnixSocket returns true if the Docker connection uses a Unix socket
func (c *DockerConfig) IsUnixSocket() bool {
	return strings.HasPrefix(c.Host, "unix://")
}
