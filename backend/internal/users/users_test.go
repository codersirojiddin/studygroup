package users

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/study-online/backend/internal/auth"
)

func TestDisplayName(t *testing.T) {
	cases := []struct{ name, email, want string }{
		{"Zoe", "z@example.com", "Zoe"},
		{"  Zoe K  ", "z@example.com", "Zoe K"},
		{"   ", "z@example.com", "z@example.com"},
		{"", "z@example.com", "z@example.com"},
	}
	for _, c := range cases {
		if got := displayName(&auth.Claims{Name: c.name, Email: c.email}); got != c.want {
			t.Errorf("displayName(%q) = %q, want %q", c.name, got, c.want)
		}
	}
	long := displayName(&auth.Claims{Name: strings.Repeat("ш", 150)})
	if n := utf8.RuneCountInString(long); n != 100 {
		t.Errorf("long name kept %d runes, want 100", n)
	}
}
