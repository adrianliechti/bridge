package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/adrianliechti/bridge/pkg/config"
)

type contextKey string

const authInfoKey contextKey = "auth_info"

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

func BearerTokenFromContext(ctx context.Context) string {
	if authInfo := AuthInfoFromContext(ctx); authInfo != nil {
		return authInfo.Bearer
	}
	return ""
}

func extractBearerToken(r *http.Request) string {
	if token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return token
	}

	return ""
}
