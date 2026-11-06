// Package chat stores room chat messages and serves their history.
package chat

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/rooms"
	"github.com/study-online/backend/internal/users"
)

type Message struct {
	ID          string    `json:"id"`
	RoomID      string    `json:"roomId"`
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Text        string    `json:"text"`
	SentAt      time.Time `json:"sentAt"`
}

var ErrNotFound = errors.New("message not found")

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// Save stores a message and returns its id and timestamp.
func (s *Store) Save(ctx context.Context, roomID, userID, body string) (string, time.Time, error) {
	var id string
	var at time.Time
	err := s.db.QueryRow(ctx, `
		INSERT INTO chat_messages (room_id, user_id, body) VALUES ($1, $2, $3)
		RETURNING id::text, created_at`, roomID, userID, body).Scan(&id, &at)
	return id, at, err
}

// History returns up to limit non-deleted messages older than before, oldest first.
func (s *Store) History(ctx context.Context, roomID string, before time.Time, limit int) ([]Message, error) {
	rows, err := s.db.Query(ctx, `
		SELECT * FROM (
			SELECT m.id::text, m.room_id::text, m.user_id::text, u.display_name, m.body, m.created_at
			FROM chat_messages m JOIN users u ON u.id = m.user_id
			WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.created_at < $2
			ORDER BY m.created_at DESC LIMIT $3
		) recent ORDER BY created_at`, roomID, before, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Message, error) {
		var m Message
		err := row.Scan(&m.ID, &m.RoomID, &m.UserID, &m.DisplayName, &m.Text, &m.SentAt)
		return m, err
	})
}

// Author returns who wrote a live message in the room.
func (s *Store) Author(ctx context.Context, roomID, msgID string) (string, error) {
	var author string
	err := s.db.QueryRow(ctx, `
		SELECT user_id::text FROM chat_messages WHERE id = $1 AND room_id = $2 AND deleted_at IS NULL`,
		msgID, roomID).Scan(&author)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return author, err
}

// Delete soft-deletes a message, recording who removed it.
func (s *Store) Delete(ctx context.Context, msgID, byUserID string) error {
	_, err := s.db.Exec(ctx, `UPDATE chat_messages SET deleted_at = now(), deleted_by = $2 WHERE id = $1`, msgID, byUserID)
	return err
}

// Notifier tells connected clients a message was removed (implemented by realtime.Hub).
type Notifier interface {
	ChatDeleted(roomID, msgID string)
}

type Handlers struct {
	Store  *Store
	Rooms  *rooms.Store
	Notify Notifier
}

// History handles GET /api/rooms/{id}/messages?before=RFC3339&limit=50 (members only).
func (h *Handlers) History(w http.ResponseWriter, r *http.Request) {
	roomID, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	u, _ := users.FromContext(r.Context())
	if _, err := h.Rooms.Role(r.Context(), roomID, u.ID); err != nil {
		notMember(w, err)
		return
	}

	before := time.Now().Add(time.Minute)
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "before must be an RFC 3339 timestamp")
			return
		}
		before = t
	}
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			httpx.Error(w, http.StatusBadRequest, "limit must be 1-100")
			return
		}
		limit = n
	}

	msgs, err := h.Store.History(r.Context(), roomID, before, limit)
	if err != nil {
		internal(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": msgs, "hasMore": len(msgs) == limit})
}

// Delete handles DELETE /api/rooms/{id}/messages/{msgId}.
// Authors delete their own messages; owners and moderators delete any.
func (h *Handlers) Delete(w http.ResponseWriter, r *http.Request) {
	roomID, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	msgID, ok := httpx.PathUUID(w, r, "msgId")
	if !ok {
		return
	}
	u, _ := users.FromContext(r.Context())
	role, err := h.Rooms.Role(r.Context(), roomID, u.ID)
	if err != nil {
		notMember(w, err)
		return
	}
	author, err := h.Store.Author(r.Context(), roomID, msgID)
	if errors.Is(err, ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	if author != u.ID && !rooms.CanEdit(role) {
		httpx.Error(w, http.StatusForbidden, "you can only delete your own messages")
		return
	}
	if err := h.Store.Delete(r.Context(), msgID, u.ID); err != nil {
		internal(w, err)
		return
	}
	h.Notify.ChatDeleted(roomID, msgID)
	w.WriteHeader(http.StatusNoContent)
}

func notMember(w http.ResponseWriter, err error) {
	if errors.Is(err, rooms.ErrNotMember) {
		httpx.Error(w, http.StatusNotFound, rooms.ErrNotFound.Error())
		return
	}
	internal(w, err)
}

func internal(w http.ResponseWriter, err error) {
	slog.Error("chat", "err", err)
	httpx.Error(w, http.StatusInternalServerError, "internal error")
}
