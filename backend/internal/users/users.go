// Package users maps Neon Auth identities to application user rows.
package users

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/auth"
	"github.com/study-online/backend/internal/httpx"
)

type User struct {
	ID          string `json:"id"`
	AuthUserID  string `json:"-"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	// DailyGoalMinutes is the user's study target per day.
	DailyGoalMinutes int       `json:"dailyGoalMinutes"`
	CreatedAt        time.Time `json:"createdAt"`
	// Username is the public handle; nil until the user claims one.
	Username *string `json:"username"`
	Bio      string  `json:"bio"`
	// ProfilePublic controls whether /u/{username} and search show this user.
	ProfilePublic bool `json:"profilePublic"`
	// Socials maps a platform ("instagram", "twitter", "youtube", "tiktok",
	// "telegram") to the user's handle there. Never nil.
	Socials map[string]string `json:"socials"`
}

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

const userCols = `id::text, auth_user_id, email, display_name, daily_goal_minutes, created_at,
	username, bio, profile_public, socials`

func scan(row pgx.Row) (*User, error) {
	u := &User{}
	if err := row.Scan(&u.ID, &u.AuthUserID, &u.Email, &u.DisplayName, &u.DailyGoalMinutes, &u.CreatedAt,
		&u.Username, &u.Bio, &u.ProfilePublic, &u.Socials); err != nil {
		return nil, err
	}
	return u, nil
}

// SetGoal handles PUT /api/me/goal {"minutes": 10..1440}.
func (s *Store) SetGoal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Minutes int `json:"minutes"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	if in.Minutes < 10 || in.Minutes > 1440 {
		httpx.Error(w, http.StatusBadRequest, "goal must be between 10 minutes and 24 hours")
		return
	}
	cur, _ := FromContext(r.Context())
	u, err := scan(s.db.QueryRow(r.Context(), `
		UPDATE users SET daily_goal_minutes = $2, updated_at = now() WHERE id = $1 RETURNING `+userCols,
		cur.ID, in.Minutes))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not save goal")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

// displayName picks the name shown to other users from the token claims.
func displayName(c *auth.Claims) string {
	name := strings.TrimSpace(c.Name)
	if name == "" {
		name = c.Email
	}
	if r := []rune(name); len(r) > 100 {
		name = string(r[:100])
	}
	return name
}

// Ensure returns the application user for a verified identity, creating it on
// first sight. Neon Auth owns the profile, so email and name are refreshed
// from the token whenever they change there (Account settings).
func (s *Store) Ensure(ctx context.Context, id auth.Identity) (*User, error) {
	return scan(s.db.QueryRow(ctx, `
		INSERT INTO users (auth_user_id, email, display_name)
		VALUES ($1, $2, $3)
		ON CONFLICT (auth_user_id) DO UPDATE
			SET email = EXCLUDED.email,
			    display_name = EXCLUDED.display_name,
			    updated_at = CASE WHEN (users.email, users.display_name)
			                           IS DISTINCT FROM (EXCLUDED.email, EXCLUDED.display_name)
			                      THEN now() ELSE users.updated_at END
		RETURNING `+userCols,
		id.AuthUserID, id.Claims.Email, displayName(id.Claims)))
}

// ByAuthUserID looks up an existing user without creating one.
func (s *Store) ByAuthUserID(ctx context.Context, authUserID string) (*User, error) {
	u, err := scan(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE auth_user_id = $1`, authUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

var ErrNotFound = errors.New("user not found")

// WithUser stores u in ctx, as Require does. Exposed for tests.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

type ctxKey struct{}

// FromContext returns the user loaded by Require.
func FromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(ctxKey{}).(*User)
	return u, ok
}

// Require must run after auth.RequireAuth. It loads (or creates) the
// application user so handlers can authorize against app-level data.
func (s *Store) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.FromContext(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		u, err := s.Ensure(r.Context(), id)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not load user")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	})
}
