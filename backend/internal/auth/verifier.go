// Package auth validates Neon Auth JWT access tokens.
//
// Neon Auth signs tokens with EdDSA (Ed25519) and publishes its keys at
// <NEON_AUTH_URL>/.well-known/jwks.json. The issuer and audience are the
// origin of the Neon Auth URL. See https://neon.com/docs/auth/guides/plugins/jwt
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Claims are the Neon Auth token claims the backend relies on.
type Claims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
	Name          string `json:"name"`
	Role          string `json:"role"`
	Banned        bool   `json:"banned"`
	jwt.RegisteredClaims
}

type Verifier struct {
	jwks   keyfunc.Keyfunc
	parser *jwt.Parser
}

// NewVerifier fetches the JWKS and keeps it refreshed in the background until ctx is done.
func NewVerifier(ctx context.Context, neonAuthURL string) (*Verifier, error) {
	u, err := url.Parse(neonAuthURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, fmt.Errorf("NEON_AUTH_URL must be an https URL, got %q", neonAuthURL)
	}
	origin := u.Scheme + "://" + u.Host

	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{neonAuthURL + "/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("load Neon Auth JWKS: %w", err)
	}
	return newVerifier(origin, jwks), nil
}

func newVerifier(origin string, jwks keyfunc.Keyfunc) *Verifier {
	return &Verifier{
		jwks: jwks,
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{"EdDSA"}),
			jwt.WithIssuer(origin),
			jwt.WithAudience(origin),
			jwt.WithExpirationRequired(),
			jwt.WithIssuedAt(),
			jwt.WithLeeway(30*time.Second),
		),
	}
}

var ErrInvalidToken = errors.New("invalid token")

// Verify checks the signature, issuer, audience and expiry, and returns the claims.
func (v *Verifier) Verify(token string) (*Claims, error) {
	claims := &Claims{}
	if _, err := v.parser.ParseWithClaims(token, claims, v.jwks.Keyfunc); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("%w: missing sub", ErrInvalidToken)
	}
	if claims.Banned {
		return nil, fmt.Errorf("%w: user is banned", ErrInvalidToken)
	}
	return claims, nil
}
