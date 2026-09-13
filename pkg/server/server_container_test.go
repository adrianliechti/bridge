package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"runtime"
	"testing"
)

// captured from `container list --format json` (container CLI 1.1.0)
const containerListV1Sample = `[{"configuration":{"capAdd":[],"capDrop":[],"creationDate":"2026-07-21T13:53:21Z","dns":{"nameservers":[],"options":[],"searchDomains":[]},"id":"89d194f8-99af-429a-995e-3c6b86085bba","image":{"descriptor":{"digest":"sha256:3131b4cc82a783df6c9df078f86e01819a13594b865c2cad47bd1bca2b7063bb","mediaType":"application/vnd.oci.image.index.v1+json","size":6694},"reference":"docker.io/library/ubuntu:latest"},"initProcess":{"arguments":[],"environment":["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],"executable":"/bin/bash","rlimits":[],"supplementalGroups":[],"terminal":true,"user":{"id":{"gid":0,"uid":0}},"workingDirectory":"/"},"labels":{},"mounts":[{"destination":"/data","options":[],"source":"/volumes/demo/volume.img","type":{"volume":{"cache":{"on":{}},"format":"ext4","name":"demo","sync":{"fsync":{}}}}},{"destination":"/host","options":[],"source":"/private/tmp","type":{"virtiofs":{}}}],"networks":[{"network":"default","options":{"hostname":"89d194f8-99af-429a-995e-3c6b86085bba","mtu":1280}}],"platform":{"architecture":"arm64","os":"linux"},"publishedPorts":[],"publishedSockets":[],"readOnly":false,"resources":{"cpuOverhead":1,"cpus":4,"memoryInBytes":1073741824},"rosetta":false,"runtimeHandler":"container-runtime-linux","ssh":false,"sysctls":{},"useInit":false,"virtualization":false},"id":"89d194f8-99af-429a-995e-3c6b86085bba","status":{"networks":[{"hostname":"89d194f8-99af-429a-995e-3c6b86085bba","ipv4Address":"192.168.64.3/24","ipv4Gateway":"192.168.64.1","ipv6Address":"fdb6:ba63:b7cb:ee5c:f861:5eff:fef2:f47e/64","macAddress":"fa:61:5e:f2:f4:7e","mtu":1280,"network":"default","variant":"reserved"}],"startedDate":"2026-07-21T13:53:22Z","state":"running"}}]`

func TestContainerListV1Payload(t *testing.T) {
	var items []containerContainer

	if err := json.Unmarshal([]byte(containerListV1Sample), &items); err != nil {
		t.Fatalf("unmarshal container list: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("got %d containers, want 1", len(items))
	}

	summary := containerSummary(items[0])

	if got := summary["Id"]; got != "89d194f8-99af-429a-995e-3c6b86085bba" {
		t.Errorf("Id = %v", got)
	}

	if got := summary["State"]; got != "running" {
		t.Errorf("State = %v, want running", got)
	}

	if got := summary["Status"]; got != "Up" {
		t.Errorf("Status = %v, want Up", got)
	}

	if got := summary["Image"]; got != "docker.io/library/ubuntu:latest" {
		t.Errorf("Image = %v", got)
	}

	networks := summary["NetworkSettings"].(map[string]any)["Networks"].(map[string]any)
	network := networks["default"].(map[string]any)

	if got := network["IPAddress"]; got != "192.168.64.3" {
		t.Errorf("IPAddress = %v, want 192.168.64.3", got)
	}

	if got := network["Gateway"]; got != "192.168.64.1" {
		t.Errorf("Gateway = %v, want 192.168.64.1", got)
	}

	mounts := summary["Mounts"].([]map[string]any)

	if len(mounts) != 2 {
		t.Fatalf("got %d mounts, want 2", len(mounts))
	}

	if got := mounts[0]["Type"]; got != "volume" {
		t.Errorf("mount 0 Type = %v, want volume", got)
	}

	if got := mounts[0]["Name"]; got != "demo" {
		t.Errorf("mount 0 Name = %v, want demo", got)
	}

	if got := mounts[1]["Type"]; got != "bind" {
		t.Errorf("mount 1 Type = %v, want bind", got)
	}
}

func TestContainerImageV1Payload(t *testing.T) {
	data := []byte(`[{"configuration":{"creationDate":"2026-07-13T16:22:14Z","descriptor":{"digest":"sha256:index","size":6694},"name":"docker.io/library/ubuntu:latest"},"id":"index","variants":[{"platform":{"architecture":"other","os":"linux"},"size":99999999},{"platform":{"architecture":"` + runtime.GOARCH + `","os":"linux"},"size":40711604}]}]`)

	var items []containerImage

	if err := json.Unmarshal(data, &items); err != nil {
		t.Fatalf("unmarshal image list: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("got %d images, want 1", len(items))
	}

	info := containerImageInfo(items[0])

	if got := info["Size"]; got != int64(40711604) {
		t.Errorf("Size = %v, want 40711604", got)
	}

	if got := info["Created"]; got != int64(1783959734) {
		t.Errorf("Created = %v, want 1783959734", got)
	}
}

func TestContainerImageSizeFallbacks(t *testing.T) {
	var image containerImage
	image.Configuration.Descriptor.Size = 6694

	t.Run("other architecture", func(t *testing.T) {
		image.Variants = nil
		image.Variants = append(image.Variants, struct {
			Size     int64 `json:"size"`
			Platform struct {
				Architecture string `json:"architecture"`
			} `json:"platform"`
		}{Size: 123456})

		if got := containerImageInfo(image)["Size"]; got != int64(123456) {
			t.Errorf("Size = %v, want 123456", got)
		}
	})

	t.Run("descriptor", func(t *testing.T) {
		image.Variants = nil

		if got := containerImageInfo(image)["Size"]; got != int64(6694) {
			t.Errorf("Size = %v, want 6694", got)
		}
	})
}

func TestContainerVolumeV1Payload(t *testing.T) {
	data := []byte(`[{"configuration":{"creationDate":"2026-07-21T13:56:03Z","driver":"local","labels":{"example":"value"},"name":"demo","source":"/volumes/demo/volume.img"},"id":"demo"}]`)

	var items []containerVolume

	if err := json.Unmarshal(data, &items); err != nil {
		t.Fatalf("unmarshal volume list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d volumes, want 1", len(items))
	}

	info := containerVolumeInfo(items[0])

	if got := info["Name"]; got != "demo" {
		t.Errorf("Name = %v, want demo", got)
	}

	if got := info["CreatedAt"]; got != "2026-07-21T13:56:03Z" {
		t.Errorf("CreatedAt = %v, want 2026-07-21T13:56:03Z", got)
	}
}

func TestContainerNetworkV1Payload(t *testing.T) {
	data := []byte(`[{"configuration":{"labels":{"com.apple.container.resource.role":"builtin"},"mode":"nat","name":"default"},"id":"default","status":{"ipv4Gateway":"192.168.65.1","ipv4Subnet":"192.168.65.0/24"}}]`)

	var items []containerNetwork

	if err := json.Unmarshal(data, &items); err != nil {
		t.Fatalf("unmarshal network list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d networks, want 1", len(items))
	}

	info := containerNetworkInfo(items[0])

	if got := info["Name"]; got != "default" {
		t.Errorf("Name = %v, want default", got)
	}

	config := info["IPAM"].(map[string]any)["Config"].([]map[string]any)

	if got := config[0]["Subnet"]; got != "192.168.65.0/24" {
		t.Errorf("Subnet = %v, want 192.168.65.0/24", got)
	}

	if got := config[0]["Gateway"]; got != "192.168.65.1" {
		t.Errorf("Gateway = %v, want 192.168.65.1", got)
	}
}

func TestContainerMountsPreservesTmpfsType(t *testing.T) {
	data := []byte(`{
		"configuration": {
			"mounts": [{
				"source": "tmpfs",
				"destination": "/tmp",
				"options": ["ro"],
				"type": {"tmpfs": {}}
			}]
		}
	}`)

	var container containerContainer

	if err := json.Unmarshal(data, &container); err != nil {
		t.Fatalf("unmarshal container: %v", err)
	}

	mounts := containerMounts(container)

	if len(mounts) != 1 {
		t.Fatalf("got %d mounts, want 1", len(mounts))
	}

	if got := mounts[0]["Type"]; got != "tmpfs" {
		t.Errorf("Type = %v, want tmpfs", got)
	}

	if got := mounts[0]["Source"]; got != "" {
		t.Errorf("Source = %v, want empty string", got)
	}

	if got := mounts[0]["RW"]; got != false {
		t.Errorf("RW = %v, want false", got)
	}
}

func TestDecodeContainerInspectClassifiesErrors(t *testing.T) {
	t.Run("invalid JSON is internal", func(t *testing.T) {
		_, err := decodeContainerInspect([]byte(`{`))

		if !errors.Is(err, errInvalidContainerInspect) {
			t.Fatalf("error = %v, want invalid inspect response", err)
		}

		if got := containerInspectErrorStatus(err); got != http.StatusInternalServerError {
			t.Errorf("status = %d, want %d", got, http.StatusInternalServerError)
		}
	})

	t.Run("empty result is not found", func(t *testing.T) {
		_, err := decodeContainerInspect([]byte(`[]`))

		if !errors.Is(err, errContainerNotFound) {
			t.Fatalf("error = %v, want container not found", err)
		}

		if got := containerInspectErrorStatus(err); got != http.StatusNotFound {
			t.Errorf("status = %d, want %d", got, http.StatusNotFound)
		}
	})
}
