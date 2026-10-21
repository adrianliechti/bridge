package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/adrianliechti/bridge/pkg/config"
)

func TestSameOriginMiddleware(t *testing.T) {
	for _, tc := range []struct {
		name, method, origin, site string
		want                       int
	}{
		{"native client", "POST", "", "", http.StatusNoContent},
		{"same origin", "POST", "http://localhost:8888", "same-origin", http.StatusNoContent},
		{"webview without fetch metadata", "GET", "http://localhost:8888", "", http.StatusNoContent},
		{"foreign websocket", "GET", "https://example.com", "", http.StatusForbidden},
		{"foreign mutation", "POST", "https://example.com", "", http.StatusForbidden},
		{"another local port", "GET", "http://localhost:9999", "", http.StatusForbidden},
		{"wrong scheme", "GET", "https://localhost:8888", "", http.StatusForbidden},
		{"opaque origin", "GET", "null", "", http.StatusForbidden},
		{"malformed origin", "GET", "://broken", "", http.StatusForbidden},
		{"origin with path", "GET", "http://localhost:8888/path", "", http.StatusForbidden},
		{"cross site without origin", "GET", "", "cross-site", http.StatusForbidden},
		{"same site is not same origin", "POST", "", "same-site", http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := sameOriginMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			r := httptest.NewRequest(tc.method, "http://localhost:8888/contexts/test/shell/app", nil)
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Sec-Fetch-Site", tc.site)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
		})
	}
}

func TestServerRejectsCrossOriginRequestsBeforeRouting(t *testing.T) {
	srv, err := New(&config.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"/config.json",
		"/contexts/test/shell/app",
		"/contexts/test/api/v1/namespaces/default/pods/app/exec",
		"/openai/v1/chat/completions",
	} {
		t.Run(path, func(t *testing.T) {
			r := httptest.NewRequest("GET", "http://localhost:8888"+path, nil)
			r.Header.Set("Origin", "https://example.com")
			w := httptest.NewRecorder()
			srv.ServeHTTP(w, r)
			if w.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403", w.Code)
			}
		})
	}
}
