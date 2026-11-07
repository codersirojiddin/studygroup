package sessions

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/realtime"
	"github.com/study-online/backend/internal/users"
)

// Notifier publishes study status changes (implemented by realtime.Hub).
type Notifier interface {
	SetStatus(userID string, st *realtime.Status)
}

type Handlers struct {
	Store  *Store
	Notify Notifier
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrAlreadyActive), errors.Is(err, ErrNoActive), errors.Is(err, ErrNotFocusing):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrBadSource):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrNotMember):
		httpx.Error(w, http.StatusForbidden, err.Error())
	default:
		slog.Error("sessions", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}

// Start handles POST /api/sessions
// {"roomId"?: uuid, "topic"?: string, "source"?: "manual"|"pomodoro"}.
// source "pomodoro" needs roomId and a room timer in a focus phase.
func (h *Handlers) Start(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RoomID string `json:"roomId"`
		Topic  string `json:"topic"`
		Source string `json:"source"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	in.Topic = strings.TrimSpace(in.Topic)
	if utf8.RuneCountInString(in.Topic) > 100 {
		httpx.Error(w, http.StatusBadRequest, "topic must be at most 100 characters")
		return
	}
	if in.RoomID != "" && !httpx.IsUUID(in.RoomID) {
		httpx.Error(w, http.StatusBadRequest, "invalid roomId")
		return
	}
	u, _ := users.FromContext(r.Context())
	s, err := h.Store.Start(r.Context(), u.ID, in.RoomID, in.Topic, in.Source)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.SetStatus(u.ID, ToStatus(s))
	httpx.JSON(w, http.StatusCreated, s)
}

// Stop handles POST /api/sessions/stop[?source=pomodoro]. With source, only a
// session started that way is stopped.
func (h *Handlers) Stop(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	if source != "" && source != SourceManual && source != SourcePomodoro {
		httpx.Error(w, http.StatusBadRequest, ErrBadSource.Error())
		return
	}
	u, _ := users.FromContext(r.Context())
	s, err := h.Store.Stop(r.Context(), u.ID, source)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.SetStatus(u.ID, nil)
	httpx.JSON(w, http.StatusOK, s)
}

// Active handles GET /api/sessions/active; the body is null when nothing is running.
func (h *Handlers) Active(w http.ResponseWriter, r *http.Request) {
	u, _ := users.FromContext(r.Context())
	s, err := h.Store.Active(r.Context(), u.ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

// Stats handles GET /api/sessions/stats?tz=Asia/Tashkent.
func (h *Handlers) Stats(w http.ResponseWriter, r *http.Request) {
	loc, ok := httpx.TimeZone(w, r)
	if !ok {
		return
	}
	u, _ := users.FromContext(r.Context())
	stats, err := h.Store.Stats(r.Context(), u.ID, loc, time.Now())
	if err != nil {
		writeErr(w, err)
		return
	}
	recent, err := h.Store.Recent(r.Context(), u.ID, 10)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"stats": stats, "recent": recent})
}
