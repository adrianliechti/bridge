package server

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/adrianliechti/bridge/pkg/config"
)

type contextKey string

const authInfoKey contextKey = "auth_info"

// These endpoints use local credentials, so foreign web pages must not be
// able to invoke them. Check GET requests too: WebSocket upgrades can execute
// commands, and some proxied APIs have side effects even for GET requests.
func sameOriginMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" || site == "same-site" {
			http.Error(w, "cross-origin request denied", http.StatusForbidden)
			return
		}

		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			scheme := "http"
			if r.TLS != nil {
				scheme = "https"
			}
			if err != nil || u.Scheme != scheme || !strings.EqualFold(u.Host, r.Host) ||
				u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
				http.Error(w, "cross-origin request denied", http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func BearerTokenMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		if token := extractBearerToken(r); token != "" {
			authInfo := &config.AuthInfo{
				Bearer: token,
			}

			ctx = context.WithValue(ctx, authInfoKey, authInfo)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func AuthInfoFromContext(ctx context.Context) *config.AuthInfo {
	authInfo, _ := ctx.Value(authInfoKey).(*config.AuthInfo)
	return authInfo
}

func extractBearerToken(r *http.Request) string {
	if token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return token
	}

	return ""
}
