package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/adrianliechti/bridge"
	"k8s.io/client-go/rest"
)

type Server struct {
	handler http.Handler
}

func New(config *rest.Config, options *Options) (*Server, error) {
	if options == nil {
		options = new(Options)
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

	mux := http.NewServeMux()

	proxy := &httputil.ReverseProxy{
		Transport: tr,

		ErrorLog: log.New(io.Discard, "", 0),

		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = target.Host
		},
	}

	mux.Handle("/api/", proxy)
	mux.Handle("/apis/", proxy)

	if options.OpenAIBaseURL != "" {
		target, err := url.Parse(options.OpenAIBaseURL)

		if err != nil {
			return nil, err
		}

		proxy := &httputil.ReverseProxy{
			ErrorLog: log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/openai/v1")

				r.SetURL(target)

				if options.OpenAIKey != "" {
					r.Out.Header.Set("Authorization", "Bearer "+options.OpenAIKey)
				}

				r.Out.Host = target.Host
			},
		}

		mux.Handle("/openai/v1/", proxy)
	}

	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		config := &Config{
			Context:   options.DefaultContext,
			Namespace: options.DefaultNamespace,
		}

		if options.OpenAIBaseURL != "" {
			config.AI = &AIConfig{
				Model: options.OpenAIModel,
			}
		}

		if len(options.PlatformNamespaces) > 0 || len(options.PlatformSpaceLabels) > 0 {
			config.Platform = &PlatformConfig{}

			if len(options.PlatformNamespaces) > 0 {
				config.Platform.Namespaces = options.PlatformNamespaces
			}

			if len(options.PlatformSpaceLabels) > 0 {
				config.Platform.Spaces = &PlatformSpacesConfig{
					Labels: options.PlatformSpaceLabels,
				}
			}
		}

		json.NewEncoder(w).Encode(config)
	})

	mux.Handle("/", http.FileServerFS(bridge.DistFS))

	return &Server{
		handler: mux,
	}, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr:    addr,
		Handler: s,
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}

	return nil
}
