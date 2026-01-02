package server

import (
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"

	"github.com/adrianliechti/bridge"
	"github.com/adrianliechti/bridge/pkg/config"
)

type Server struct {
	config *config.Config

	http.Handler
}

type Context struct {
	Type string

	Name string
}

func New(cfg *config.Config) (*Server, error) {
	contexts := make(map[string]*Context)

	for _, c := range cfg.Docker.Contexts {
		contexts[c.Name] = &Context{
			Type: "docker",
			Name: c.Name,
		}
	}

	for _, c := range cfg.Kubernetes.Contexts {
		contexts[c.Name] = &Context{
			Type: "kubernetes",
			Name: c.Name,
		}
	}

	mux := http.NewServeMux()

	s := &Server{
		config:  cfg,
		Handler: mux,
	}

	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		config := &Config{}

		if cfg.OpenAI != nil {
			config.AI = &AIConfig{
				Model: cfg.OpenAI.Model,
			}
		}

		if cfg.Docker != nil {
			config.Docker = &DockerConfig{
				CurrentContext: cfg.Docker.CurrentContext,
			}

			for _, c := range cfg.Docker.Contexts {
				config.Docker.Contexts = append(config.Docker.Contexts, c.Name)
			}
		}

		if cfg.Kubernetes != nil {
			config.Kubernetes = &KubernetesConfig{
				DefaultContext:   cfg.Kubernetes.CurrentContext,
				DefaultNamespace: cfg.Kubernetes.CurrentNamespace,

				TenancyLabels:      cfg.Kubernetes.TenancyLabels,
				PlatformNamespaces: cfg.Kubernetes.PlatformNamespaces,
			}

			for _, c := range cfg.Kubernetes.Contexts {
				config.Kubernetes.Contexts = append(config.Kubernetes.Contexts, c.Name)
			}
		}

		json.NewEncoder(w).Encode(config)
	})

	mux.HandleFunc("/contexts/{context}/{path...}", func(w http.ResponseWriter, r *http.Request) {
		path := r.PathValue("path")

		context, ok := contexts[r.PathValue("context")]

		if !ok {
			http.Error(w, "context not found", http.StatusNotFound)
			return
		}

		switch context.Type {
		case "docker":
			proxy, err := s.dockerProxy(context.Name)

			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			r.URL.Path = "/" + path
			proxy.ServeHTTP(w, r)

		case "kubernetes":
			proxy, err := s.kubernetesProxy(context.Name)

			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			r.URL.Path = "/" + path
			proxy.ServeHTTP(w, r)

		default:
			http.Error(w, "unsupported context type", http.StatusBadRequest)
			return
		}
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

	mux.Handle("/", spaHandler(bridge.DistFS))

	return s, nil
}

func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServerFS(fsys)

	// Read index.html once at startup
	indexHTML, err := fs.ReadFile(fsys, "index.html")
	if err != nil {
		panic("failed to read index.html: " + err.Error())
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		urlPath := path.Clean(r.URL.Path)

		// Redirect trailing slashes to canonical path (except root)
		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			http.Redirect(w, r, urlPath, http.StatusMovedPermanently)
			return
		}

		// Try to open the file
		filePath := strings.TrimPrefix(urlPath, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		f, err := fsys.Open(filePath)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// File doesn't exist, serve index.html for SPA routing
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(indexHTML)
	})
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
