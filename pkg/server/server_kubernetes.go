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
