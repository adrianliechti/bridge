package server

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/adrianliechti/bridge/pkg/config"
	"github.com/adrianliechti/bridge/pkg/ssh"
)

func (s *Server) dockerProxy(ctx context.Context, name string, auth *config.AuthInfo) (http.Handler, error) {
	tr, target, err := s.dockerTransport(name)

	if err != nil {
		return nil, err
	}

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

// availableDockerContexts returns the docker contexts that can be used.
func (s *Server) availableDockerContexts(ctx context.Context) []config.DockerContext {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	contexts := s.config.Docker.Contexts
	available := make([]bool, len(contexts))

	var wg sync.WaitGroup

	for i, c := range contexts {
		wg.Go(func() {
			available[i] = s.dockerAvailable(ctx, c)
		})
	}

	wg.Wait()

	result := make([]config.DockerContext, 0)

	for i, c := range contexts {
		if available[i] {
			result = append(result, c)
		}
	}

	return result
}

// dockerAvailable reports whether the daemon behind a docker context answers,
// or can be started from the UI (Docker Desktop). SSH contexts are assumed
// available: checking them means opening a session.
func (s *Server) dockerAvailable(ctx context.Context, c config.DockerContext) bool {
	if s.systemKind(c.Name) != "" {
		return true
	}

	if u, err := url.Parse(c.Host); err == nil && u.Scheme == "ssh" {
		return true
	}

	tr, target, err := s.dockerTransport(c.Name)

	if err != nil {
		return false
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.JoinPath("_ping").String(), nil)

	if err != nil {
		return false
	}

	resp, err := tr.RoundTrip(req)

	if err != nil {
		return false
	}

	// drain so the connection goes back to the pool
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

type dockerTransport struct {
	transport http.RoundTripper
	target    *url.URL
}

// dockerTransport returns the transport for a docker context. Transports are
// shared per context so connections are pooled; a transport per request would
// keep each idle connection open forever. SSH transports are not shared, as a
// cached session would not survive a dropped connection.
func (s *Server) dockerTransport(name string) (http.RoundTripper, *url.URL, error) {
	s.dockerMu.Lock()
	cached, ok := s.dockerTransports[strings.ToLower(name)]
	s.dockerMu.Unlock()

	if ok {
		return cached.transport, cached.target, nil
	}

	tr, target, shared, err := s.newDockerTransport(name)

	if err != nil {
		return nil, nil, err
	}

	if shared {
		s.dockerMu.Lock()
		defer s.dockerMu.Unlock()

		if s.dockerTransports == nil {
			s.dockerTransports = make(map[string]dockerTransport)
		}

		// keep the first one if another request raced us here
		if cached, ok := s.dockerTransports[strings.ToLower(name)]; ok {
			return cached.transport, cached.target, nil
		}

		s.dockerTransports[strings.ToLower(name)] = dockerTransport{tr, target}
	}

	return tr, target, nil
}

func (s *Server) newDockerTransport(name string) (tr http.RoundTripper, target *url.URL, shared bool, err error) {
	for _, c := range s.config.Docker.Contexts {
		if !strings.EqualFold(c.Name, name) {
			continue
		}

		u, err := url.Parse(c.Host)

		if err != nil {
			return nil, nil, false, err
		}

		switch u.Scheme {
		case "unix":
			socketPath := u.Path

			if socketPath == "" {
				socketPath = "/var/run/docker.sock"
			}

			if _, err := os.Stat(socketPath); err != nil {
				return nil, nil, false, fmt.Errorf("docker socket not found: %w", err)
			}

			tr = &http.Transport{
				DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
					return net.Dial("unix", socketPath)
				},
			}

			target = &url.URL{
				Scheme: "http",
				Host:   "localhost",
			}

		case "tcp", "http":
			tr = &http.Transport{}

			target = &url.URL{
				Scheme: "http",
				Host:   u.Host,
			}

		case "https":
			tlsConfig := &tls.Config{}

			if path := os.Getenv("DOCKER_CERT_PATH"); path != "" {
				cert, err := tls.LoadX509KeyPair(
					filepath.Join(path, "cert.pem"),
					filepath.Join(path, "key.pem"),
				)

				if err != nil {
					return nil, nil, false, err
				}

				tlsConfig.Certificates = []tls.Certificate{cert}

				if os.Getenv("DOCKER_TLS_VERIFY") == "" {
					tlsConfig.InsecureSkipVerify = true
				}
			}

			tr = &http.Transport{
				TLSClientConfig: tlsConfig,
			}

			target = &url.URL{
				Scheme: "https",
				Host:   u.Host,
			}

		case "ssh":
			sshClient, err := ssh.New(u)

			if err != nil {
				return nil, nil, false, err
			}

			tr = &http.Transport{
				DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
					return sshClient.Dial("unix", "/var/run/docker.sock")
				},
			}

			target = &url.URL{
				Scheme: "http",
				Host:   "localhost",
			}

		default:
			return nil, nil, false, fmt.Errorf("unsupported docker context scheme: %s", u.Scheme)
		}

		return tr, target, u.Scheme != "ssh", nil
	}

	return nil, nil, false, fmt.Errorf("docker context not found")
}
