package server

import (
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"strings"
	"sync"
	"time"

	"github.com/adrianliechti/bridge/pkg/config"
	"k8s.io/client-go/rest"
)

func (s *Server) kubernetesProxy(ctx context.Context, name string, auth *config.AuthInfo) (http.Handler, error) {
	for _, c := range s.config.Kubernetes.Contexts {
		if !strings.EqualFold(c.Name, name) {
			continue
		}

		config, err := c.Config(ctx, auth)

		if err != nil {
			return nil, err
		}

		tr, err := rest.TransportFor(config)

		if err != nil {
			return nil, err
		}

		target, path, err := rest.DefaultServerUrlFor(config)

		if err != nil {
			return nil, err
		}

		target.Path = path

		proxy := &httputil.ReverseProxy{
			Transport: tr,

			ErrorLog: log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.SetURL(target)
				r.Out.Host = target.Host
			},
		}

		return proxy, nil
	}

	return nil, errors.New("kubernetes context not found")
}

// defaultKubernetesContext picks the context the UI opens with: the
// kubeconfig's current context while its API server accepts connections,
// otherwise the first one that does, or "" when none is up (e.g. kind or Docker
// Desktop clusters while Docker is stopped).
func (s *Server) defaultKubernetesContext(ctx context.Context) string {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()

	contexts := s.config.Kubernetes.Contexts
	reachable := make([]bool, len(contexts))

	var wg sync.WaitGroup

	for i, c := range contexts {
		wg.Go(func() {
			reachable[i] = kubernetesReachable(ctx, c)
		})
	}

	wg.Wait()

	for i, c := range contexts {
		if reachable[i] && c.Name == s.config.Kubernetes.CurrentContext {
			return c.Name
		}
	}

	for i, c := range contexts {
		if reachable[i] {
			return c.Name
		}
	}

	return ""
}

// kubernetesReachable reports whether the context's API server accepts TCP
// connections. It never authenticates, so credential plugins don't run for
// contexts the user did not open. Clusters behind a proxy are assumed up.
func kubernetesReachable(ctx context.Context, c config.KubernetesContext) bool {
	cfg, err := c.Config(ctx, nil)

	if err != nil {
		return false
	}

	if cfg.Proxy != nil {
		return true
	}

	target, _, err := rest.DefaultServerUrlFor(cfg)

	if err != nil {
		return false
	}

	port := target.Port()

	if port == "" {
		port = "443"

		if target.Scheme == "http" {
			port = "80"
		}
	}

	var dialer net.Dialer

	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(target.Hostname(), port))

	if err != nil {
		return false
	}

	conn.Close()

	return true
}
