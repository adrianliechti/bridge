package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
)

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
