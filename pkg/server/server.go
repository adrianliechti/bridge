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
	"github.com/adrianliechti/bridge/pkg/config"
	"k8s.io/client-go/rest"
)

type Server struct {
	handler http.Handler
}

func New(cfg *config.Config) (*Server, error) {
	proxies := make(map[string]*httputil.ReverseProxy)

	for _, c := range cfg.Contexts {
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

	if cfg.OpenAI != nil {
		target, err := url.Parse(cfg.OpenAI.URL)

		if err != nil {
			return nil, err
		}

		proxy := &httputil.ReverseProxy{
			ErrorLog: log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/openai/v1")

				r.SetURL(target)

				if cfg.OpenAI.Token != "" {
					r.Out.Header.Set("Authorization", "Bearer "+cfg.OpenAI.Token)
				}

				r.Out.Host = target.Host
			},
		}

		mux.Handle("/openai/v1/", proxy)
	}

	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		config := &Config{
			DefaultContext:   cfg.CurrentContext,
			DefaultNamespace: cfg.CurrentNamespace,
		}

		if cfg.OpenAI != nil {
			config.AI = &AIConfig{
				Model: cfg.OpenAI.Model,
			}
		}

		if cfg.Platform != nil {
			config.Platform = &PlatformConfig{}

			if len(cfg.Platform.PlatformNamespaces) > 0 {
				config.Platform.Namespaces = cfg.Platform.PlatformNamespaces
			}

			if len(cfg.Platform.PlatformSpaceLabels) > 0 {
				config.Platform.Spaces = &PlatformSpacesConfig{
					Labels: cfg.Platform.PlatformSpaceLabels,
				}
			}
		}

		if cfg.Docker != nil {
			config.Docker = &DockerConfig{
				Available: true,
			}
		}

		json.NewEncoder(w).Encode(config)
	})

	// Docker API proxy
	if cfg.Docker != nil {
		dockerHost, err := cfg.Docker.GetAPIHost()
		if err != nil {
			return nil, err
		}

		dockerTarget, err := url.Parse(dockerHost)
		if err != nil {
			return nil, err
		}

		dockerProxy := &httputil.ReverseProxy{
			Transport: cfg.Docker.Transport,
			ErrorLog:  log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/docker")
				r.SetURL(dockerTarget)
				r.Out.Host = dockerTarget.Host
			},
		}

		// Docker API proxy
		mux.Handle("/docker/", dockerProxy)
	}

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
