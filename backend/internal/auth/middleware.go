package auth

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/study-online/backend/internal/httpx"
)

type ctxKey struct{}

// Identity is the authenticated caller. AuthUserID always comes from the
// verified token's sub claim, never from request input.
type Identity struct {
	AuthUserID string
	Claims     *Claims
}

// WithIdentity stores id in ctx, as RequireAuth does. Exposed for tests.
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// FromContext returns the identity set by RequireAuth.
func FromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxKey{}).(Identity)
	return id, ok
}

// RequireAuth rejects requests without a valid "Authorization: Bearer <jwt>" header.
func (v *Verifier) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			httpx.Error(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := v.Verify(strings.TrimSpace(raw))
		if err != nil {
			slog.Debug("token rejected", "err", err)
			httpx.Error(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, Identity{AuthUserID: claims.Subject, Claims: claims})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
