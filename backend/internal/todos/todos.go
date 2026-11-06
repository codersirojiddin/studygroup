// Package todos is a personal task list for study sessions.
package todos

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/users"
)

// MaxOpen limits open tasks per user so the list stays usable.
const MaxOpen = 100

var (
	ErrNotFound = errors.New("task not found")
	ErrTooMany  = errors.New("you have too many open tasks; finish or delete some first")
)

type Todo struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Done      bool       `json:"done"`
	DoneAt    *time.Time `json:"doneAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

const cols = `id::text, title, done, done_at, created_at`

func scan(row pgx.Row) (Todo, error) {
	var t Todo
	err := row.Scan(&t.ID, &t.Title, &t.Done, &t.DoneAt, &t.CreatedAt)
	return t, err
}

// List returns open tasks (oldest first) and tasks completed since doneSince (newest first).
func (s *Store) List(ctx context.Context, userID string, doneSince time.Time) ([]Todo, error) {
	rows, err := s.db.Query(ctx, `
		(SELECT `+cols+` FROM todos WHERE user_id = $1 AND NOT done ORDER BY created_at)
		UNION ALL
		(SELECT `+cols+` FROM todos WHERE user_id = $1 AND done AND done_at >= $2 ORDER BY done_at DESC LIMIT 50)`,
		userID, doneSince)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Todo, error) { return scan(row) })
}

func (s *Store) Create(ctx context.Context, userID, title string) (Todo, error) {
	var t Todo
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		// Serialize per user so two quick adds can't both pass the limit.
		if _, err := tx.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, userID); err != nil {
			return err
		}
		var open int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM todos WHERE user_id = $1 AND NOT done`, userID).Scan(&open); err != nil {
			return err
		}
		if open >= MaxOpen {
			return ErrTooMany
		}
		var err error
		t, err = scan(tx.QueryRow(ctx, `INSERT INTO todos (user_id, title) VALUES ($1, $2) RETURNING `+cols, userID, title))
		return err
	})
	return t, err
}

// Update changes the title and/or done state of the user's own task.
func (s *Store) Update(ctx context.Context, userID, id string, title *string, done *bool) (Todo, error) {
	t, err := scan(s.db.QueryRow(ctx, `
		UPDATE todos SET
			title = coalesce($3, title),
			done = coalesce($4, done),
			done_at = CASE WHEN $4::boolean IS NULL THEN done_at
			               WHEN $4 THEN coalesce(done_at, now()) ELSE NULL END
		WHERE id = $1 AND user_id = $2
		RETURNING `+cols, id, userID, title, done))
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

func (s *Store) Delete(ctx context.Context, userID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM todos WHERE id = $1 AND user_id = $2`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

type Handlers struct{ Store *Store }

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrTooMany):
		httpx.Error(w, http.StatusConflict, err.Error())
	default:
		slog.Error("todos", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}

func cleanTitle(w http.ResponseWriter, s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" || utf8.RuneCountInString(s) > 200 {
		httpx.Error(w, http.StatusBadRequest, "task must be 1-200 characters")
		return "", false
	}
	return s, true
}

// List handles GET /api/todos?tz=Area/City: open tasks plus those done today.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	loc, ok := httpx.TimeZone(w, r)
	if !ok {
		return
	}
	now := time.Now().In(loc)
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	u, _ := users.FromContext(r.Context())
	list, err := h.Store.List(r.Context(), u.ID, startOfDay)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// Create handles POST /api/todos {"title": "..."}.
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title string `json:"title"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	title, ok := cleanTitle(w, in.Title)
	if !ok {
		return
	}
	u, _ := users.FromContext(r.Context())
	t, err := h.Store.Create(r.Context(), u.ID, title)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

// Update handles PATCH /api/todos/{id} {"title"?: "...", "done"?: bool}.
func (h *Handlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Title *string `json:"title"`
		Done  *bool   `json:"done"`
	}
	if !httpx.Decode(w, r, &in) {
		return
	}
	if in.Title != nil {
		title, ok := cleanTitle(w, *in.Title)
		if !ok {
			return
		}
		in.Title = &title
	}
	u, _ := users.FromContext(r.Context())
	t, err := h.Store.Update(r.Context(), u.ID, id, in.Title, in.Done)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

// Delete handles DELETE /api/todos/{id}.
func (h *Handlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	u, _ := users.FromContext(r.Context())
	if err := h.Store.Delete(r.Context(), u.ID, id); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
