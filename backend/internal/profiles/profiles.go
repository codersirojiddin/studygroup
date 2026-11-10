// Package profiles serves public user profiles.
package profiles

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/sessions"
	"github.com/study-online/backend/internal/users"
)

type Handlers struct {
	Users    *users.Store
	Sessions *sessions.Store
}

// Profile is the public view of a user. It never includes email or topics.
type Profile struct {
	Username    string            `json:"username"`
	DisplayName string            `json:"displayName"`
	Bio         string            `json:"bio"`
	Socials     map[string]string `json:"socials"`
	JoinedAt    time.Time         `json:"joinedAt"`
	Activity    sessions.Activity `json:"activity"`
}

// Get handles GET /api/profiles/{username}?tz=Asia/Tashkent. It needs no
// sign-in. Private and unknown profiles are indistinguishable (both 404).
func (h *Handlers) Get(w http.ResponseWriter, r *http.Request) {
	name, err := users.NormalizeUsername(r.PathValue("username"))
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "profile not found")
		return
	}
	loc, ok := httpx.TimeZone(w, r)
	if !ok {
		return
	}
	u, err := h.Users.ByUsername(r.Context(), name)
	if errors.Is(err, users.ErrNotFound) || (err == nil && !u.ProfilePublic) {
		httpx.Error(w, http.StatusNotFound, "profile not found")
		return
	}
	if err != nil {
		slog.Error("profiles", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	act, err := h.Sessions.Activity(r.Context(), u.ID, loc, time.Now())
	if err != nil {
		slog.Error("profiles", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httpx.JSON(w, http.StatusOK, Profile{
		Username:    *u.Username,
		DisplayName: u.DisplayName,
		Bio:         u.Bio,
		Socials:     u.Socials,
		JoinedAt:    u.CreatedAt,
		Activity:    *act,
	})
}
