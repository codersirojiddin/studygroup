// Package config loads backend configuration from environment variables.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	// DatabaseURL is Neon's pooled connection string, used for application traffic.
	DatabaseURL string
	// DirectURL is Neon's direct (non-pooled) connection string, used for migrations.
	DirectURL string
	// NeonAuthURL is the Neon Auth base URL (Console > Auth > Configuration).
	NeonAuthURL string
	// AppURL is the frontend origin, used for CORS and WebSocket origin checks.
	AppURL string
	Port   string
}

// LoadDotEnv sets variables from a local .env file, if present, without
// overriding anything already set in the real environment.
func LoadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		if _, set := os.LookupEnv(k); !set {
			os.Setenv(k, v)
		}
	}
}

// Load reads the configuration needed by the API server.
func Load() (*Config, error) {
	LoadDotEnv(".env")
	c := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		DirectURL:   os.Getenv("DIRECT_URL"),
		NeonAuthURL: strings.TrimRight(os.Getenv("NEON_AUTH_URL"), "/"),
		AppURL:      strings.TrimRight(os.Getenv("NEXT_PUBLIC_APP_URL"), "/"),
		Port:        os.Getenv("PORT"),
	}
	if c.Port == "" {
		c.Port = "8080"
	}

	var missing []string
	for name, v := range map[string]string{
		"DATABASE_URL":        c.DatabaseURL,
		"NEON_AUTH_URL":       c.NeonAuthURL,
		"NEXT_PUBLIC_APP_URL": c.AppURL,
	} {
		if v == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	if err := requireSSL("DATABASE_URL", c.DatabaseURL); err != nil {
		return nil, err
	}
	return c, nil
}

// requireSSL rejects connection strings that would allow an unencrypted connection.
func requireSSL(name, dsn string) error {
	u, err := url.Parse(dsn)
	if err != nil {
		return fmt.Errorf("%s is not a valid URL: %w", name, err)
	}
	switch u.Query().Get("sslmode") {
	case "require", "verify-ca", "verify-full":
		return nil
	default:
		return fmt.Errorf("%s must set sslmode=require (or verify-full)", name)
	}
}

// RequireSSL is exported for the migration command, which only needs DIRECT_URL.
func RequireSSL(name, dsn string) error { return requireSSL(name, dsn) }
