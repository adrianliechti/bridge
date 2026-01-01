package server

import (
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"strings"

	"k8s.io/client-go/rest"
)

func (s *Server) kubernetesProxy(name string) (http.Handler, error) {
	for _, c := range s.config.Kubernetes.Contexts {
		if !strings.EqualFold(c.Name, name) {
			continue
		}

		tr, err := rest.TransportFor(c.Config)

		if err != nil {
			return nil, err
		}

		target, path, err := rest.DefaultServerUrlFor(c.Config)

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
