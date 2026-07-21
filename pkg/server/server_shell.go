package server

// Interactive shell endpoint for docker and Apple container contexts.
//
// GET /contexts/{context}/shell/{id}?command=/bin/sh (websocket)
//
// The wire format matches the Kubernetes exec channel protocol: binary
// messages prefixed with a channel byte (0 stdin, 1 stdout, 3 error,
// 4 resize with a {"Width","Height"} JSON payload).

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/adrianliechti/bridge/pkg/ssh"

	"github.com/coder/websocket"
	"github.com/creack/pty"
)

const (
	shellChannelStdin  = 0
	shellChannelStdout = 1
	shellChannelError  = 3
	shellChannelResize = 4
)

type shellStream struct {
	stdin  io.Writer
	stdout io.Reader

	resize func(cols, rows int)
	close  func()
}

func shellError(ctx context.Context, ws *websocket.Conn, err error) {
	ws.Write(ctx, websocket.MessageBinary, append([]byte{shellChannelError}, []byte(err.Error())...))
}

func serveShell(ctx context.Context, ws *websocket.Conn, stream *shellStream) {
	defer stream.close()

	done := make(chan struct{})

	go func() {
		defer close(done)

		buf := make([]byte, 32*1024)

		for {
			n, err := stream.stdout.Read(buf)

			if n > 0 {
				if err := ws.Write(ctx, websocket.MessageBinary, append([]byte{shellChannelStdout}, buf[:n]...)); err != nil {
					return
				}
			}

			if err != nil {
				return
			}
		}
	}()

	go func() {
		for {
			_, data, err := ws.Read(ctx)

			if err != nil {
				stream.close()
				return
			}

			if len(data) < 1 {
				continue
			}

			switch data[0] {
			case shellChannelStdin:
				if _, err := stream.stdin.Write(data[1:]); err != nil {
					stream.close()
					return
				}

			case shellChannelResize:
				var size struct {
					Width  int
					Height int
				}

				if err := json.Unmarshal(data[1:], &size); err == nil {
					stream.resize(size.Width, size.Height)
				}
			}
		}
	}()

	<-done
}

// Apple container: `container exec` on a pseudo-terminal

func (s *Server) containerShell(ctx context.Context, ws *websocket.Conn, id string, command []string) {
	cmd := exec.Command(s.config.Container.Path, append([]string{"exec", "-it", id}, command...)...)

	master, err := pty.Start(cmd)

	if err != nil {
		shellError(ctx, ws, err)
		return
	}

	serveShell(ctx, ws, &shellStream{
		stdin:  master,
		stdout: master,

		resize: func(cols, rows int) {
			pty.Setsize(master, &pty.Winsize{
				Cols: uint16(cols),
				Rows: uint16(rows),
			})
		},

		close: func() {
			master.Close()

			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		},
	})

	cmd.Wait()
}

// Docker: exec API with a hijacked connection

func (s *Server) dockerShell(ctx context.Context, ws *websocket.Conn, name, id string, command []string) {
	var host string

	for _, c := range s.config.Docker.Contexts {
		if strings.EqualFold(c.Name, name) {
			host = c.Host
		}
	}

	if host == "" {
		shellError(ctx, ws, errors.New("docker context not found"))
		return
	}

	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dockerDial(host)
			},
		},
	}

	execID, err := dockerExecCreate(client, id, command)

	if err != nil {
		shellError(ctx, ws, err)
		return
	}

	conn, err := dockerDial(host)

	if err != nil {
		shellError(ctx, ws, err)
		return
	}

	defer conn.Close()

	reader, err := dockerExecStart(conn, execID)

	if err != nil {
		shellError(ctx, ws, err)
		return
	}

	serveShell(ctx, ws, &shellStream{
		stdin:  conn,
		stdout: reader,

		resize: func(cols, rows int) {
			resize, _ := http.NewRequest("POST", fmt.Sprintf("http://docker/exec/%s/resize?w=%d&h=%d", execID, cols, rows), nil)

			if resp, err := client.Do(resize); err == nil {
				resp.Body.Close()
			}
		},

		close: func() {
			conn.Close()
		},
	})
}

func dockerExecCreate(client *http.Client, id string, command []string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"AttachStdin":  true,
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          true,
		"Cmd":          command,
	})

	resp, err := client.Post("http://docker/containers/"+id+"/exec", "application/json", bytes.NewReader(body))

	if err != nil {
		return "", err
	}

	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return "", dockerAPIError(resp)
	}

	var result struct {
		ID string `json:"Id"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.ID, nil
}

func dockerExecStart(conn net.Conn, execID string) (io.Reader, error) {
	body, _ := json.Marshal(map[string]any{
		"Detach": false,
		"Tty":    true,
	})

	req, err := http.NewRequest("POST", "http://docker/exec/"+execID+"/start", bytes.NewReader(body))

	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "tcp")

	if err := req.Write(conn); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)

	resp, err := http.ReadResponse(reader, req)

	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusSwitchingProtocols && resp.StatusCode != http.StatusOK {
		return nil, dockerAPIError(resp)
	}

	// the connection is now a raw bidirectional stream (tty mode, no
	// multiplexing); early output may already sit in the buffered reader
	return reader, nil
}

func dockerAPIError(resp *http.Response) error {
	defer resp.Body.Close()

	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	var result struct {
		Message string `json:"message"`
	}

	if err := json.Unmarshal(data, &result); err == nil && result.Message != "" {
		return errors.New(result.Message)
	}

	return fmt.Errorf("docker api error: %s", resp.Status)
}

// dockerDial opens a raw connection to the docker daemon of a context host
func dockerDial(host string) (net.Conn, error) {
	u, err := url.Parse(host)

	if err != nil {
		return nil, err
	}

	switch u.Scheme {
	case "unix":
		socketPath := u.Path

		if socketPath == "" {
			socketPath = "/var/run/docker.sock"
		}

		return net.Dial("unix", socketPath)

	case "tcp", "http":
		return net.Dial("tcp", u.Host)

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

		return tls.Dial("tcp", u.Host, tlsConfig)

	case "ssh":
		sshClient, err := ssh.New(u)

		if err != nil {
			return nil, err
		}

		return sshClient.Dial("unix", "/var/run/docker.sock")

	default:
		return nil, fmt.Errorf("unsupported docker context scheme: %s", u.Scheme)
	}
}
