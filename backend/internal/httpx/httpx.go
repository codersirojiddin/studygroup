// Package httpx holds small HTTP helpers shared by handlers and middleware.
package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"
	_ "time/tzdata" // IANA zones on hosts without a zoneinfo database (e.g. Windows)
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// IsUUID reports whether s is a canonical UUID string.
func IsUUID(s string) bool { return uuidRe.MatchString(s) }

// PathUUID reads a UUID path parameter, writing a 404 and returning false if invalid.
func PathUUID(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	v := r.PathValue(name)
	if !IsUUID(v) {
		Error(w, http.StatusNotFound, "not found")
		return "", false
	}
	return v, true
}

// TimeZone reads the ?tz= IANA zone (default UTC), writing a 400 if unknown.
func TimeZone(w http.ResponseWriter, r *http.Request) (*time.Location, bool) {
	tz := r.URL.Query().Get("tz")
	if tz == "" {
		return time.UTC, true
	}
	loc, err := time.LoadLocation(tz)
	if err != nil || tz == "Local" {
		Error(w, http.StatusBadRequest, "unknown time zone")
		return nil, false
	}
	return loc, true
}

// Decode reads a JSON body of at most 64 KiB into v, writing a 400 on failure.
func Decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			Error(w, http.StatusRequestEntityTooLarge, "request body too large")
		} else {
			Error(w, http.StatusBadRequest, "invalid JSON body")
		}
		return false
	}
	return true
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// CORS allows the frontend origin to call the API with a bearer token.
func CORS(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") == allowedOrigin {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", allowedOrigin)
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Max-Age", "600")
			h.Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
