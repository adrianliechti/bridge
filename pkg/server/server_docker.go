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

	"github.com/adrianliechti/bridge/pkg/ssh"
)

func (s *Server) dockerProxy(name string) (http.Handler, error) {
	for _, c := range s.config.Docker.Contexts {
		if !strings.EqualFold(c.Name, name) {
			continue
		}

		u, err := url.Parse(c.Host)

		if err != nil {
			return nil, err
		}

		var tr http.RoundTripper
		var target *url.URL

		switch u.Scheme {
		case "unix":
			socketPath := u.Path

			if socketPath == "" {
				socketPath = "/var/run/docker.sock"
			}

			if _, err := os.Stat(socketPath); err != nil {
				return nil, fmt.Errorf("docker socket not found: %w", err)
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
					return nil, err
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
				return nil, err
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
			return nil, fmt.Errorf("unsupported docker context scheme: %s", u.Scheme)
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

	return nil, fmt.Errorf("docker context not found")
}
