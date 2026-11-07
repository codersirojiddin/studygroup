package users

import (
	"errors"
	"testing"
)

func TestNormalizeUsername(t *testing.T) {
	cases := []struct {
		in   string
		want string
		err  error
	}{
		{"Zoe_K", "zoe_k", nil},
		{"  @Sirojiddin  ", "sirojiddin", nil},
		{"abc", "abc", nil},
		{"ab", "", ErrUsernameInvalid},
		{"has space", "", ErrUsernameInvalid},
		{"dash-name", "", ErrUsernameInvalid},
		{"юзер_name", "", ErrUsernameInvalid},
		{"abcdefghijklmnopqrstu", "", ErrUsernameInvalid},     // 21 chars
		{"abcdefghijklmnopqrst", "abcdefghijklmnopqrst", nil}, // 20 chars
		{"Admin", "", ErrUsernameReserved},
		{"settings", "", ErrUsernameReserved},
	}
	for _, c := range cases {
		got, err := NormalizeUsername(c.in)
		if got != c.want || !errors.Is(err, c.err) {
			t.Errorf("NormalizeUsername(%q) = %q, %v; want %q, %v", c.in, got, err, c.want, c.err)
		}
	}
}

func TestLikeEscape(t *testing.T) {
	if got := likeEscape(`a_b%c\d`); got != `a\_b\%c\\d` {
		t.Errorf("likeEscape = %q", got)
	}
}
