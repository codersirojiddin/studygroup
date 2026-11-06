package rooms

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/users"
)

// Notifier pushes room changes to connected clients (implemented by realtime.Hub).
type Notifier interface {
	MembersChanged(roomID string)
	RoomUpdated(roomID string)
	RemoveUser(roomID, userID, reason string)
	CloseRoom(roomID string)
	RefreshStatus(ctx context.Context, userID string)
	TimerChanged(roomID string, timer any)
}

type Handlers struct {
	Store  *Store
	Notify Notifier
}

type settingsInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"`
	MaxMembers  int    `json:"maxMembers"`
}

// validate normalizes the input and returns a user-facing error message, or "".
func (in *settingsInput) validate() (Settings, string) {
	s := Settings{
		Name:        strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description),
		Visibility:  in.Visibility,
		MaxMembers:  in.MaxMembers,
	}
	if s.Visibility == "" {
		s.Visibility = "public"
	}
	if s.MaxMembers == 0 {
		s.MaxMembers = 20
	}
	switch {
	case s.Name == "" || utf8.RuneCountInString(s.Name) > 100:
		return s, "name must be 1-100 characters"
	case utf8.RuneCountInString(s.Description) > 1000:
		return s, "description must be at most 1000 characters"
	case s.Visibility != "public" && s.Visibility != "private":
		return s, "visibility must be public or private"
	case s.MaxMembers < 2 || s.MaxMembers > 100:
		return s, "maxMembers must be between 2 and 100"
	}
	return s, ""
}

func me(r *http.Request) *users.User {
	u, _ := users.FromContext(r.Context())
	return u
}

// writeErr maps store errors to HTTP responses.
func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrNotMember):
		httpx.Error(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrFull), errors.Is(err, ErrOwnerCannotLeave), errors.Is(err, ErrMaxBelowMembers):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrBadInviteCode):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		slog.Error("rooms", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}

// requireRole loads the caller's role in the room and checks it with allowed.
func (h *Handlers) requireRole(w http.ResponseWriter, r *http.Request, roomID string, allowed func(string) bool) (string, bool) {
	role, err := h.Store.Role(r.Context(), roomID, me(r).ID)
	if errors.Is(err, ErrNotMember) {
		// Hide whether the room exists from non-members.
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return "", false
	}
	if err != nil {
		writeErr(w, err)
		return "", false
	}
	if !allowed(role) {
		httpx.Error(w, http.StatusForbidden, "you don't have permission to do that")
		return "", false
	}
	return role, true
}

// List handles GET /api/rooms.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	mine, err := h.Store.ListMine(r.Context(), me(r).ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	public, err := h.Store.ListPublic(r.Context(), me(r).ID, 50)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"mine": mine, "public": public})
}

// Create handles POST /api/rooms.
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	var in settingsInput
	if !httpx.Decode(w, r, &in) {
		return
	}
	s, msg := in.validate()
	if msg != "" {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	room, err := h.Store.Create(r.Context(), me(r).ID, s)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, room)
}

// Get handles GET /api/rooms/{id}. Members see the member list; others see a preview.
func (h *Handlers) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	room, err := h.Store.Get(r.Context(), id, me(r).ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	resp := map[string]any{"room": room, "members": []Member{}, "serverNow": time.Now().UTC()}
	if room.MyRole != "" {
		members, err := h.Store.Members(r.Context(), id)
		if err != nil {
			writeErr(w, err)
			return
		}
		timer, err := h.Store.GetTimer(r.Context(), id)
		if err != nil {
			writeErr(w, err)
			return
		}
		resp["members"] = members
		resp["timer"] = timer
	}
	httpx.JSON(w, http.StatusOK, resp)
}

// Update handles PATCH /api/rooms/{id} (owner or moderator).
func (h *Handlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	var in settingsInput
	if !httpx.Decode(w, r, &in) {
		return
	}
	s, msg := in.validate()
	if msg != "" {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	if _, ok := h.requireRole(w, r, id, CanEdit); !ok {
		return
	}
	room, err := h.Store.Update(r.Context(), id, me(r).ID, s)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.RoomUpdated(id)
	httpx.JSON(w, http.StatusOK, room)
}

// Delete handles DELETE /api/rooms/{id} (owner only).
func (h *Handlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	if _, ok := h.requireRole(w, r, id, CanDelete); !ok {
		return
	}
	if err := h.Store.Delete(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.CloseRoom(id)
	w.WriteHeader(http.StatusNoContent)
}

// RegenerateInvite handles POST /api/rooms/{id}/invite (owner or moderator).
func (h *Handlers) RegenerateInvite(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	if _, ok := h.requireRole(w, r, id, CanEdit); !ok {
		return
	}
	code, err := h.Store.RegenerateInviteCode(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"inviteCode": code})
}

// Join handles POST /api/rooms/{id}/join for public rooms.
func (h *Handlers) Join(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	h.join(w, r, id, "")
}

// JoinByCode handles POST /api/rooms/join {"code": "..."}.
func (h *Handlers) JoinByCode(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	code := strings.ToLower(strings.TrimSpace(in.Code))
	if code == "" || len(code) > 32 {
		httpx.Error(w, http.StatusBadRequest, ErrBadInviteCode.Error())
		return
	}
	id, err := h.Store.RoomIDByInviteCode(r.Context(), code)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.join(w, r, id, code)
}

func (h *Handlers) join(w http.ResponseWriter, r *http.Request, roomID, code string) {
	if err := h.Store.Join(r.Context(), roomID, me(r).ID, code); err != nil {
		writeErr(w, err)
		return
	}
	room, err := h.Store.Get(r.Context(), roomID, me(r).ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.MembersChanged(roomID)
	httpx.JSON(w, http.StatusOK, room)
}

// Leave handles POST /api/rooms/{id}/leave.
func (h *Handlers) Leave(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	role, ok := h.requireRole(w, r, id, func(string) bool { return true })
	if !ok {
		return
	}
	if role == RoleOwner {
		writeErr(w, ErrOwnerCannotLeave)
		return
	}
	if err := h.Store.RemoveMember(r.Context(), id, me(r).ID); err != nil {
		writeErr(w, err)
		return
	}
	h.afterRemoval(r.Context(), id, me(r).ID, "left")
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember handles DELETE /api/rooms/{id}/members/{userId}.
func (h *Handlers) RemoveMember(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	target, ok := httpx.PathUUID(w, r, "userId")
	if !ok {
		return
	}
	actorRole, ok := h.requireRole(w, r, id, CanEdit)
	if !ok {
		return
	}
	targetRole, err := h.Store.Role(r.Context(), id, target)
	if err != nil {
		writeErr(w, err)
		return
	}
	if !CanRemove(actorRole, targetRole, target == me(r).ID) {
		httpx.Error(w, http.StatusForbidden, "you can't remove this member")
		return
	}
	if err := h.Store.RemoveMember(r.Context(), id, target); err != nil {
		writeErr(w, err)
		return
	}
	h.afterRemoval(r.Context(), id, target, "kicked")
	w.WriteHeader(http.StatusNoContent)
}

// afterRemoval notifies the room; RemoveMember also ended any session there.
func (h *Handlers) afterRemoval(ctx context.Context, roomID, userID, reason string) {
	h.Notify.RemoveUser(roomID, userID, reason)
	h.Notify.RefreshStatus(ctx, userID)
}

// SetRole handles PATCH /api/rooms/{id}/members/{userId} {"role": "moderator"|"member"}.
func (h *Handlers) SetRole(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	target, ok := httpx.PathUUID(w, r, "userId")
	if !ok {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	actorRole, ok := h.requireRole(w, r, id, func(string) bool { return true })
	if !ok {
		return
	}
	targetRole, err := h.Store.Role(r.Context(), id, target)
	if err != nil {
		writeErr(w, err)
		return
	}
	if !CanSetRole(actorRole, targetRole, in.Role, target == me(r).ID) {
		httpx.Error(w, http.StatusForbidden, "you can't change this member's role")
		return
	}
	if err := h.Store.SetRole(r.Context(), id, target, in.Role); err != nil {
		writeErr(w, err)
		return
	}
	h.Notify.MembersChanged(id)
	w.WriteHeader(http.StatusNoContent)
}

// ControlTimer handles POST /api/rooms/{id}/timer
// {"action": "start"|"pause"|"resume"|"skip"|"reset", "focusMinutes"?, "breakMinutes"?}.
// Owners and moderators run the shared timer; everyone in the room sees it.
func (h *Handlers) ControlTimer(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Action       string `json:"action"`
		FocusMinutes int    `json:"focusMinutes"`
		BreakMinutes int    `json:"breakMinutes"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	if _, ok := h.requireRole(w, r, id, CanEdit); !ok {
		return
	}
	timer, err := h.Store.ControlTimer(r.Context(), id, me(r).ID, TimerAction{
		Action: in.Action, FocusSeconds: in.FocusMinutes * 60, BreakSeconds: in.BreakMinutes * 60,
	})
	switch {
	case errors.Is(err, ErrBadTimerAction):
		httpx.Error(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, ErrBadDuration):
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		writeErr(w, err)
		return
	}
	h.Notify.TimerChanged(id, timer)
	httpx.JSON(w, http.StatusOK, map[string]any{"timer": timer, "serverNow": time.Now().UTC()})
}
