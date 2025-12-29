package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"slices"
	"strings"

	"github.com/adrianliechti/bridge"
	"k8s.io/client-go/rest"
)

type Server struct {
	handler http.Handler
}

func New(contexts []BridgeContext, options *BridgeOptions) (*Server, error) {
	if options == nil {
		options = new(BridgeOptions)
	}

	// Build a reverse proxy for each context
	proxies := make(map[string]*httputil.ReverseProxy)

	for _, c := range contexts {
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

		proxies[c.Name] = proxy
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /contexts", func(w http.ResponseWriter, r *http.Request) {
		result := make([]Context, 0)

		for name := range proxies {
			context := Context{
				Name: name,
			}

			result = append(result, context)
		}

		slices.SortFunc(result, func(a, b Context) int {
			return strings.Compare(a.Name, b.Name)
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("/contexts/{context}/{path...}", func(w http.ResponseWriter, r *http.Request) {
		path := r.PathValue("path")
		context := r.PathValue("context")

		proxy, ok := proxies[context]

		if !ok {
			http.Error(w, "context not found", http.StatusNotFound)
			return
		}

		r.URL.Path = "/" + path
		proxy.ServeHTTP(w, r)
	})

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
			DefaultContext:   options.DefaultContext,
			DefaultNamespace: options.DefaultNamespace,
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
