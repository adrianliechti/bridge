package server

// Adapter for Apple container (https://github.com/apple/container).
//
// The container control plane is XPC-only (launchd mach services), so there
// is no socket to proxy to. Instead this handler emulates the subset of the
// Docker Engine API used by the frontend, backed by the `container` CLI and
// its `--format json` output.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/adrianliechti/bridge/pkg/config"
)

type containerHandler struct {
	path string

	mux *http.ServeMux
}

func newContainerHandler(cfg *config.ContainerConfig) http.Handler {
	h := &containerHandler{
		path: cfg.Path,

		mux: http.NewServeMux(),
	}

	h.mux.HandleFunc("GET /info", h.handleInfo)

	h.mux.HandleFunc("GET /containers/json", h.handleContainerList)
	h.mux.HandleFunc("POST /containers/create", h.handleContainerCreate)
	h.mux.HandleFunc("GET /containers/{id}/json", h.handleContainerInspect)
	h.mux.HandleFunc("GET /containers/{id}/logs", h.handleContainerLogs)
	h.mux.HandleFunc("POST /containers/{id}/start", h.handleContainerStart)
	h.mux.HandleFunc("POST /containers/{id}/stop", h.handleContainerStop)
	h.mux.HandleFunc("POST /containers/{id}/restart", h.handleContainerRestart)
	h.mux.HandleFunc("POST /containers/{id}/pause", h.handleUnsupported)
	h.mux.HandleFunc("POST /containers/{id}/unpause", h.handleUnsupported)
	h.mux.HandleFunc("DELETE /containers/{id}", h.handleContainerDelete)

	h.mux.HandleFunc("GET /images/json", h.handleImageList)
	h.mux.HandleFunc("POST /images/create", h.handleImagePull)
	h.mux.HandleFunc("DELETE /images/{id...}", h.handleImageDelete)

	h.mux.HandleFunc("GET /volumes", h.handleVolumeList)
	h.mux.HandleFunc("GET /volumes/{name}", h.handleVolumeInspect)
	h.mux.HandleFunc("DELETE /volumes/{name}", h.handleVolumeDelete)

	h.mux.HandleFunc("GET /networks", h.handleNetworkList)
	h.mux.HandleFunc("GET /networks/{id...}", h.handleNetworkInspect)
	h.mux.HandleFunc("DELETE /networks/{id...}", h.handleNetworkDelete)

	return h.mux
}

func (h *containerHandler) run(ctx context.Context, args ...string) ([]byte, error) {
	var stdout, stderr bytes.Buffer

	cmd := exec.CommandContext(ctx, h.path, args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return nil, errors.New(strings.TrimPrefix(msg, "Error: "))
		}

		return nil, err
	}

	return stdout.Bytes(), nil
}

func containerError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	json.NewEncoder(w).Encode(map[string]string{
		"message": err.Error(),
	})
}

func containerJSON(w http.ResponseWriter, val any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(val)
}

// CLI JSON models (container CLI 0.6.x)

type containerContainer struct {
	Status string `json:"status"`

	Configuration struct {
		ID     string            `json:"id"`
		Labels map[string]string `json:"labels"`

		Image struct {
			Reference string `json:"reference"`

			Descriptor struct {
				Digest string `json:"digest"`
			} `json:"descriptor"`
		} `json:"image"`

		InitProcess struct {
			Executable       string   `json:"executable"`
			Arguments        []string `json:"arguments"`
			Environment      []string `json:"environment"`
			WorkingDirectory string   `json:"workingDirectory"`
			Terminal         bool     `json:"terminal"`
		} `json:"initProcess"`

		PublishedPorts []struct {
			HostAddress   string `json:"hostAddress"`
			HostPort      int    `json:"hostPort"`
			ContainerPort int    `json:"containerPort"`
			Proto         string `json:"proto"`
		} `json:"publishedPorts"`

		Mounts []struct {
			Source      string   `json:"source"`
			Destination string   `json:"destination"`
			Options     []string `json:"options"`

			Type struct {
				Volume *struct {
					Name string `json:"name"`
				} `json:"volume"`
			} `json:"type"`
		} `json:"mounts"`

		Platform struct {
			Architecture string `json:"architecture"`
			OS           string `json:"os"`
		} `json:"platform"`
	} `json:"configuration"`

	Networks []struct {
		Network  string `json:"network"`
		Hostname string `json:"hostname"`
		Address  string `json:"address"`
		Gateway  string `json:"gateway"`
	} `json:"networks"`
}

type containerImage struct {
	Reference string `json:"reference"`

	Descriptor struct {
		Digest string `json:"digest"`
		Size   int64  `json:"size"`
	} `json:"descriptor"`
}

type containerVolume struct {
	Name   string            `json:"name"`
	Driver string            `json:"driver"`
	Source string            `json:"source"`
	Labels map[string]string `json:"labels"`

	// seconds since the Apple reference date (2001-01-01 UTC)
	CreatedAt float64 `json:"createdAt"`
}

type containerNetwork struct {
	ID    string `json:"id"`
	State string `json:"state"`

	Config struct {
		ID     string            `json:"id"`
		Mode   string            `json:"mode"`
		Labels map[string]string `json:"labels"`
	} `json:"config"`

	Status struct {
		Address string `json:"address"`
		Gateway string `json:"gateway"`
	} `json:"status"`
}

// appleEpoch converts an Apple reference date timestamp to a time.Time
func appleEpoch(seconds float64) time.Time {
	return time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(seconds * float64(time.Second)))
}

// Docker API mapping

func containerState(state string) string {
	switch state {
	case "running", "stopping":
		return "running"

	case "stopped":
		return "exited"

	default:
		return state
	}
}

func containerStatus(c containerContainer) string {
	switch c.Status {
	case "running":
		return "Up"

	case "stopping":
		return "Stopping"

	case "stopped":
		return "Exited"

	default:
		return c.Status
	}
}

func containerCommand(c containerContainer) string {
	return strings.TrimSpace(c.Configuration.InitProcess.Executable + " " + strings.Join(c.Configuration.InitProcess.Arguments, " "))
}

func containerNetworks(c containerContainer) map[string]any {
	networks := map[string]any{}

	for _, n := range c.Networks {
		address, _, _ := strings.Cut(n.Address, "/")

		networks[n.Network] = map[string]any{
			"IPAddress": address,
			"Gateway":   n.Gateway,
		}
	}

	return networks
}

func containerMounts(c containerContainer) []map[string]any {
	mounts := make([]map[string]any, 0)

	for _, m := range c.Configuration.Mounts {
		rw := true

		for _, o := range m.Options {
			if o == "ro" {
				rw = false
			}
		}

		mount := map[string]any{
			"Type":        "bind",
			"Source":      m.Source,
			"Destination": m.Destination,
			"Mode":        strings.Join(m.Options, ","),
			"RW":          rw,
		}

		if m.Type.Volume != nil {
			mount["Type"] = "volume"
			mount["Name"] = m.Type.Volume.Name
		}

		mounts = append(mounts, mount)
	}

	return mounts
}

func containerSummary(c containerContainer) map[string]any {
	ports := make([]map[string]any, 0)

	for _, p := range c.Configuration.PublishedPorts {
		ports = append(ports, map[string]any{
			"IP":          p.HostAddress,
			"PrivatePort": p.ContainerPort,
			"PublicPort":  p.HostPort,
			"Type":        p.Proto,
		})
	}

	labels := c.Configuration.Labels

	if labels == nil {
		labels = map[string]string{}
	}

	return map[string]any{
		"Id":      c.Configuration.ID,
		"Names":   []string{"/" + c.Configuration.ID},
		"Image":   c.Configuration.Image.Reference,
		"ImageID": c.Configuration.Image.Descriptor.Digest,
		"Command": containerCommand(c),
		"State":   containerState(c.Status),
		"Status":  containerStatus(c),
		"Ports":   ports,
		"Labels":  labels,
		"Mounts":  containerMounts(c),

		"NetworkSettings": map[string]any{
			"Networks": containerNetworks(c),
		},
	}
}

func containerInspect(c containerContainer) map[string]any {
	labels := c.Configuration.Labels

	if labels == nil {
		labels = map[string]string{}
	}

	return map[string]any{
		"Id":       c.Configuration.ID,
		"Name":     "/" + c.Configuration.ID,
		"Image":    c.Configuration.Image.Descriptor.Digest,
		"Platform": c.Configuration.Platform.OS,

		"State": map[string]any{
			"Status":  containerState(c.Status),
			"Running": c.Status == "running",
		},

		"Config": map[string]any{
			"Image":      c.Configuration.Image.Reference,
			"Labels":     labels,
			"Env":        c.Configuration.InitProcess.Environment,
			"Cmd":        append([]string{c.Configuration.InitProcess.Executable}, c.Configuration.InitProcess.Arguments...),
			"WorkingDir": c.Configuration.InitProcess.WorkingDirectory,
			"Tty":        c.Configuration.InitProcess.Terminal,
		},

		"HostConfig": map[string]any{},

		"Mounts": containerMounts(c),

		"NetworkSettings": map[string]any{
			"Networks": containerNetworks(c),
		},
	}
}

// Handlers

func (h *containerHandler) handleUnsupported(w http.ResponseWriter, r *http.Request) {
	containerError(w, http.StatusNotImplemented, errors.New("not supported by Apple container"))
}

func (h *containerHandler) handleInfo(w http.ResponseWriter, r *http.Request) {
	version := ""

	if data, err := h.run(r.Context(), "--version"); err == nil {
		fields := strings.Fields(string(data))

		for i, f := range fields {
			if f == "version" && i+1 < len(fields) {
				version = fields[i+1]
			}
		}
	}

	containerJSON(w, map[string]any{
		"ID":              "apple-container",
		"Name":            "apple",
		"Driver":          "container",
		"ServerVersion":   version,
		"OperatingSystem": "macOS (Apple container)",
		"OSType":          "linux",
		"Architecture":    runtime.GOARCH,
		"NCPU":            runtime.NumCPU(),
	})
}

func (h *containerHandler) handleContainerList(w http.ResponseWriter, r *http.Request) {
	args := []string{"list", "--format", "json"}

	if r.URL.Query().Get("all") != "false" {
		args = append(args, "--all")
	}

	data, err := h.run(r.Context(), args...)

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	var items []containerContainer

	if err := json.Unmarshal(data, &items); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	result := make([]map[string]any, 0)

	for _, c := range items {
		result = append(result, containerSummary(c))
	}

	containerJSON(w, result)
}

func (h *containerHandler) handleContainerCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Image string   `json:"Image"`
		Cmd   []string `json:"Cmd"`
		Env   []string `json:"Env"`

		HostConfig struct {
			Binds []string `json:"Binds"`

			PortBindings map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"PortBindings"`
		} `json:"HostConfig"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		containerError(w, http.StatusBadRequest, err)
		return
	}

	if body.Image == "" {
		containerError(w, http.StatusBadRequest, errors.New("image is required"))
		return
	}

	args := []string{"create"}

	if name := r.URL.Query().Get("name"); name != "" {
		args = append(args, "--name", name)
	}

	for _, env := range body.Env {
		args = append(args, "-e", env)
	}

	for port, bindings := range body.HostConfig.PortBindings {
		containerPort, proto, ok := strings.Cut(port, "/")

		if !ok {
			proto = "tcp"
		}

		for _, binding := range bindings {
			if binding.HostPort == "" {
				continue
			}

			spec := binding.HostPort + ":" + containerPort + "/" + proto

			if binding.HostIP != "" {
				spec = binding.HostIP + ":" + spec
			}

			args = append(args, "-p", spec)
		}
	}

	for _, bind := range body.HostConfig.Binds {
		args = append(args, "-v", bind)
	}

	args = append(args, body.Image)
	args = append(args, body.Cmd...)

	data, err := h.run(r.Context(), args...)

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	json.NewEncoder(w).Encode(map[string]any{
		"Id":       strings.TrimSpace(string(data)),
		"Warnings": []string{},
	})
}

func (h *containerHandler) handleImagePull(w http.ResponseWriter, r *http.Request) {
	image := r.URL.Query().Get("fromImage")

	if image == "" {
		containerError(w, http.StatusBadRequest, errors.New("fromImage is required"))
		return
	}

	if tag := r.URL.Query().Get("tag"); tag != "" {
		image = image + ":" + tag
	}

	if _, err := h.run(r.Context(), "image", "pull", image); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	containerJSON(w, map[string]any{
		"status": "Pull complete",
	})
}

func (h *containerHandler) handleContainerInspect(w http.ResponseWriter, r *http.Request) {
	data, err := h.run(r.Context(), "inspect", r.PathValue("id"))

	if err != nil {
		containerError(w, http.StatusNotFound, err)
		return
	}

	var items []containerContainer

	if err := json.Unmarshal(data, &items); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	if len(items) == 0 {
		containerError(w, http.StatusNotFound, errors.New("container not found"))
		return
	}

	containerJSON(w, containerInspect(items[0]))
}

func (h *containerHandler) handleContainerLogs(w http.ResponseWriter, r *http.Request) {
	args := []string{"logs"}

	if r.URL.Query().Get("follow") == "true" {
		args = append(args, "--follow")
	}

	if tail := r.URL.Query().Get("tail"); tail != "" && tail != "all" {
		args = append(args, "-n", tail)
	}

	args = append(args, r.PathValue("id"))

	var stderr bytes.Buffer

	cmd := exec.CommandContext(r.Context(), h.path, args...)
	cmd.Stderr = &stderr

	stdout, err := cmd.StdoutPipe()

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	if err := cmd.Start(); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	flusher, _ := w.(http.Flusher)

	written := false

	buf := make([]byte, 32*1024)

	for {
		n, err := stdout.Read(buf)

		if n > 0 {
			if !written {
				w.Header().Set("Content-Type", "application/octet-stream")
				written = true
			}

			w.Write(buf[:n])

			if flusher != nil {
				flusher.Flush()
			}
		}

		if err != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil && !written {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			err = errors.New(strings.TrimPrefix(msg, "Error: "))
		}

		containerError(w, http.StatusInternalServerError, err)
	}
}

func (h *containerHandler) handleContainerStart(w http.ResponseWriter, r *http.Request) {
	if _, err := h.run(r.Context(), "start", r.PathValue("id")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *containerHandler) handleContainerStop(w http.ResponseWriter, r *http.Request) {
	if _, err := h.run(r.Context(), "stop", r.PathValue("id")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *containerHandler) handleContainerRestart(w http.ResponseWriter, r *http.Request) {
	if _, err := h.run(r.Context(), "stop", r.PathValue("id")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	if _, err := h.run(r.Context(), "start", r.PathValue("id")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *containerHandler) handleContainerDelete(w http.ResponseWriter, r *http.Request) {
	args := []string{"delete"}

	if r.URL.Query().Get("force") == "true" {
		args = append(args, "--force")
	}

	args = append(args, r.PathValue("id"))

	if _, err := h.run(r.Context(), args...); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *containerHandler) imageList(ctx context.Context) ([]containerImage, error) {
	data, err := h.run(ctx, "image", "list", "--format", "json")

	if err != nil {
		return nil, err
	}

	var items []containerImage

	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (h *containerHandler) handleImageList(w http.ResponseWriter, r *http.Request) {
	items, err := h.imageList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	result := make([]map[string]any, 0)

	for _, i := range items {
		result = append(result, map[string]any{
			"Id":          i.Descriptor.Digest,
			"RepoTags":    []string{i.Reference},
			"RepoDigests": []string{},
			"Size":        i.Descriptor.Size,
			"Labels":      map[string]string{},
			"Containers":  -1,
		})
	}

	containerJSON(w, result)
}

func (h *containerHandler) handleImageDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.PathValue("id"), "sha256:")

	items, err := h.imageList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	names := make([]string, 0)

	for _, i := range items {
		if strings.TrimPrefix(i.Descriptor.Digest, "sha256:") == id || i.Reference == id {
			names = append(names, i.Reference)
		}
	}

	if len(names) == 0 {
		names = append(names, id)
	}

	if _, err := h.run(r.Context(), append([]string{"image", "delete"}, names...)...); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	containerJSON(w, []map[string]any{})
}

func containerVolumeInfo(v containerVolume) map[string]any {
	labels := v.Labels

	if labels == nil {
		labels = map[string]string{}
	}

	result := map[string]any{
		"Name":       v.Name,
		"Driver":     v.Driver,
		"Mountpoint": v.Source,
		"Labels":     labels,
		"Scope":      "local",
	}

	if v.CreatedAt > 0 {
		result["CreatedAt"] = appleEpoch(v.CreatedAt).Format(time.RFC3339Nano)
	}

	return result
}

func (h *containerHandler) volumeList(ctx context.Context) ([]containerVolume, error) {
	data, err := h.run(ctx, "volume", "list", "--format", "json")

	if err != nil {
		return nil, err
	}

	var items []containerVolume

	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (h *containerHandler) handleVolumeList(w http.ResponseWriter, r *http.Request) {
	items, err := h.volumeList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	volumes := make([]map[string]any, 0)

	for _, v := range items {
		volumes = append(volumes, containerVolumeInfo(v))
	}

	containerJSON(w, map[string]any{
		"Volumes":  volumes,
		"Warnings": []string{},
	})
}

func (h *containerHandler) handleVolumeInspect(w http.ResponseWriter, r *http.Request) {
	items, err := h.volumeList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	for _, v := range items {
		if v.Name == r.PathValue("name") {
			containerJSON(w, containerVolumeInfo(v))
			return
		}
	}

	containerError(w, http.StatusNotFound, errors.New("volume not found"))
}

func (h *containerHandler) handleVolumeDelete(w http.ResponseWriter, r *http.Request) {
	if _, err := h.run(r.Context(), "volume", "delete", r.PathValue("name")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func containerNetworkInfo(n containerNetwork) map[string]any {
	labels := n.Config.Labels

	if labels == nil {
		labels = map[string]string{}
	}

	ipam := make([]map[string]any, 0)

	if n.Status.Address != "" {
		ipam = append(ipam, map[string]any{
			"Subnet":  n.Status.Address,
			"Gateway": n.Status.Gateway,
		})
	}

	return map[string]any{
		"Name":   n.ID,
		"Id":     n.ID,
		"Scope":  "local",
		"Driver": n.Config.Mode,
		"Labels": labels,

		"IPAM": map[string]any{
			"Driver": "default",
			"Config": ipam,
		},
	}
}

func (h *containerHandler) networkList(ctx context.Context) ([]containerNetwork, error) {
	data, err := h.run(ctx, "network", "list", "--format", "json")

	if err != nil {
		return nil, err
	}

	var items []containerNetwork

	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (h *containerHandler) handleNetworkList(w http.ResponseWriter, r *http.Request) {
	items, err := h.networkList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	result := make([]map[string]any, 0)

	for _, n := range items {
		result = append(result, containerNetworkInfo(n))
	}

	containerJSON(w, result)
}

func (h *containerHandler) handleNetworkInspect(w http.ResponseWriter, r *http.Request) {
	items, err := h.networkList(r.Context())

	if err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	for _, n := range items {
		if n.ID == r.PathValue("id") || n.Config.ID == r.PathValue("id") {
			containerJSON(w, containerNetworkInfo(n))
			return
		}
	}

	containerError(w, http.StatusNotFound, errors.New("network not found"))
}

func (h *containerHandler) handleNetworkDelete(w http.ResponseWriter, r *http.Request) {
	if _, err := h.run(r.Context(), "network", "delete", r.PathValue("id")); err != nil {
		containerError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
