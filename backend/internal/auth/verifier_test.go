package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

const origin = "https://ep-test.neonauth.example.com"

func setup(t *testing.T) (*Verifier, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	set := fmt.Sprintf(`{"keys":[{"kty":"OKP","crv":"Ed25519","alg":"EdDSA","use":"sig","kid":"k1","x":%q}]}`,
		base64.RawURLEncoding.EncodeToString(pub))
	kf, err := keyfunc.NewJWKSetJSON([]byte(set))
	if err != nil {
		t.Fatal(err)
	}
	return newVerifier(origin, kf), priv
}

func sign(t *testing.T, key ed25519.PrivateKey, kid string, c Claims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, c)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func valid() Claims {
	now := time.Now()
	return Claims{
		Email: "a@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user-123",
			Issuer:    origin,
			Audience:  jwt.ClaimStrings{origin},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
		},
	}
}

func TestVerify(t *testing.T) {
	v, key := setup(t)
	_, otherKey, _ := ed25519.GenerateKey(rand.Reader)

	got, err := v.Verify(sign(t, key, "k1", valid()))
	if err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if got.Subject != "user-123" {
		t.Fatalf("sub = %q", got.Subject)
	}

	cases := map[string]func() string{
		"expired": func() string {
			c := valid()
			c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
			return sign(t, key, "k1", c)
		},
		"no exp": func() string {
			c := valid()
			c.ExpiresAt = nil
			return sign(t, key, "k1", c)
		},
		"wrong issuer": func() string {
			c := valid()
			c.Issuer = "https://evil.example.com"
			return sign(t, key, "k1", c)
		},
		"wrong audience": func() string {
			c := valid()
			c.Audience = jwt.ClaimStrings{"https://evil.example.com"}
			return sign(t, key, "k1", c)
		},
		"missing sub": func() string {
			c := valid()
			c.Subject = ""
			return sign(t, key, "k1", c)
		},
		"banned": func() string {
			c := valid()
			c.Banned = true
			return sign(t, key, "k1", c)
		},
		"foreign key": func() string { return sign(t, otherKey, "k1", valid()) },
		"unknown kid": func() string { return sign(t, key, "nope", valid()) },
		"alg none": func() string {
			s, _ := jwt.NewWithClaims(jwt.SigningMethodNone, valid()).SignedString(jwt.UnsafeAllowNoneSignatureType)
			return s
		},
		"garbage": func() string { return "not.a.jwt" },
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := v.Verify(tok()); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}
