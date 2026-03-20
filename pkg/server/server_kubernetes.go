package server

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"strings"

	"github.com/adrianliechti/bridge/pkg/config"
	"k8s.io/client-go/rest"
)

func resolveKubernetesContexts(k *config.KubernetesConfig, r *http.Request) ([]config.KubernetesContext, error) {
	if k.ContextResolver != nil {
		return k.ContextResolver(r)
	}

	return k.Contexts, nil
}

func (s *Server) kubernetesProxy(ctx context.Context, name string, auth *config.AuthInfo, r *http.Request) (http.Handler, error) {
	contexts, err := resolveKubernetesContexts(s.config.Kubernetes, r)

	if err != nil {
		return nil, err
	}

	for _, c := range contexts {
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

				if auth := r.In.Header.Get("Authorization"); auth != "" {
					r.Out.Header.Set("Authorization", auth)
				}
			},
		}

		return proxy, nil
	}

	return nil, errors.New("kubernetes context not found")
}
