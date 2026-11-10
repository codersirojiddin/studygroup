package users

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/study-online/backend/internal/httpx"
)

const maxBioRunes = 160

var (
	ErrUsernameInvalid  = errors.New("username must be 3-20 characters: lowercase letters, numbers and underscores")
	ErrUsernameReserved = errors.New("that username is reserved")
	ErrUsernameTaken    = errors.New("that username is taken")
)

var usernameRe = regexp.MustCompile(`^[a-z0-9_]{3,20}$`)

// reserved handles would collide with routes or look official.
var reserved = map[string]bool{
	"about": true, "account": true, "admin": true, "administrator": true, "api": true,
	"app": true, "auth": true, "billing": true, "blog": true, "dashboard": true,
	"help": true, "home": true, "login": true, "logout": true, "me": true,
	"mod": true, "moderator": true, "null": true, "official": true, "privacy": true,
	"profile": true, "profiles": true, "root": true, "room": true, "rooms": true,
	"search": true, "settings": true, "signin": true, "signout": true, "signup": true,
	"staff": true, "study": true, "studyonline": true, "support": true, "system": true,
	"terms": true, "u": true, "undefined": true, "user": true, "users": true, "www": true,
}

// NormalizeUsername lowercases and validates a handle. A leading "@" is dropped.
func NormalizeUsername(s string) (string, error) {
	s = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(s)), "@")
	if !usernameRe.MatchString(s) {
		return "", ErrUsernameInvalid
	}
	if reserved[s] {
		return "", ErrUsernameReserved
	}
	return s, nil
}

// ByUsername looks up a user by handle (already normalized).
func (s *Store) ByUsername(ctx context.Context, username string) (*User, error) {
	u, err := scan(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE username = $1`, username))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

// SetProfile handles PATCH /api/me/profile. Every field is optional; omitted
// fields stay unchanged:
// {"username"?: string, "bio"?: string, "profilePublic"?: bool, "socials"?: {platform: handle-or-link}}.
// When socials is sent it replaces all links; an empty value removes that link.
func (s *Store) SetProfile(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username      *string           `json:"username"`
		Bio           *string           `json:"bio"`
		ProfilePublic *bool             `json:"profilePublic"`
		Socials       map[string]string `json:"socials"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	if in.Username != nil {
		name, err := NormalizeUsername(*in.Username)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		in.Username = &name
	}
	if in.Bio != nil {
		bio := strings.TrimSpace(*in.Bio)
		if utf8.RuneCountInString(bio) > maxBioRunes {
			httpx.Error(w, http.StatusBadRequest, "bio must be at most 160 characters")
			return
		}
		in.Bio = &bio
	}

	var socials any // stays nil (= unchanged) unless the client sent socials
	if in.Socials != nil {
		norm, err := NormalizeSocials(in.Socials)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		b, err := json.Marshal(norm)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not save profile")
			return
		}
		socials = string(b)
	}

	cur, _ := FromContext(r.Context())
	u, err := scan(s.db.QueryRow(r.Context(), `
		UPDATE users SET
			username       = coalesce($2::text, username),
			bio            = coalesce($3::text, bio),
			profile_public = coalesce($4::boolean, profile_public),
			socials        = coalesce($5::jsonb, socials),
			updated_at     = now()
		WHERE id = $1 RETURNING `+userCols,
		cur.ID, in.Username, in.Bio, in.ProfilePublic, socials))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		httpx.Error(w, http.StatusConflict, ErrUsernameTaken.Error())
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not save profile")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

// CheckUsername handles GET /api/users/check?username=abc and tells the
// sign-up form whether the handle can be claimed by the caller.
func (s *Store) CheckUsername(w http.ResponseWriter, r *http.Request) {
	name, err := NormalizeUsername(r.URL.Query().Get("username"))
	if err != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"available": false, "reason": err.Error()})
		return
	}
	cur, _ := FromContext(r.Context())
	var taken bool
	if err := s.db.QueryRow(r.Context(),
		`SELECT EXISTS (SELECT 1 FROM users WHERE username = $1 AND id <> $2)`, name, cur.ID).Scan(&taken); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not check username")
		return
	}
	out := map[string]any{"username": name, "available": !taken}
	if taken {
		out["reason"] = ErrUsernameTaken.Error()
	}
	httpx.JSON(w, http.StatusOK, out)
}

// Summary is one search hit.
type Summary struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

// likeEscape makes s safe to use as a literal prefix in LIKE.
func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// Search handles GET /api/users/search?q=abc: prefix match on handle or
// display name, public profiles only, at most 8 hits.
func (s *Store) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))), "@")
	out := []Summary{}
	if n := utf8.RuneCountInString(q); n < 2 || n > 50 {
		httpx.JSON(w, http.StatusOK, out)
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT username, display_name FROM users
		WHERE profile_public AND username IS NOT NULL
		  AND (username LIKE $1::text || '%' OR lower(display_name) LIKE $1::text || '%')
		ORDER BY (username = $2::text) DESC, username
		LIMIT 8`, likeEscape(q), q)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "search failed")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var h Summary
		if err := rows.Scan(&h.Username, &h.DisplayName); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "search failed")
			return
		}
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "search failed")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}
