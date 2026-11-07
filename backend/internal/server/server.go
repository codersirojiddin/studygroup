// Package server wires stores, handlers and middleware into the HTTP router.
package server

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/chat"
	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/profiles"
	"github.com/study-online/backend/internal/realtime"
	"github.com/study-online/backend/internal/rooms"
	"github.com/study-online/backend/internal/sessions"
	"github.com/study-online/backend/internal/todos"
	"github.com/study-online/backend/internal/users"
	"github.com/study-online/backend/internal/ws"
)

type Options struct {
	DB *pgxpool.Pool
	// Authenticate verifies the caller and stores an auth.Identity in the
	// request context (auth.Verifier.RequireAuth in production).
	Authenticate func(http.Handler) http.Handler
	Tickets      *ws.TicketStore
	AppURL       string
}

// New returns the API handler, with CORS applied, and the realtime hub.
func New(o Options) (http.Handler, *realtime.Hub) {
	userStore := users.NewStore(o.DB)
	roomStore := rooms.NewStore(o.DB)
	sessionStore := sessions.NewStore(o.DB)
	chatStore := chat.NewStore(o.DB)

	hub := realtime.NewHub(realtime.Deps{
		IsMember: func(ctx context.Context, roomID, userID string) (bool, error) {
			_, err := roomStore.Role(ctx, roomID, userID)
			if err == rooms.ErrNotMember {
				return false, nil
			}
			return err == nil, err
		},
		ActiveStatus: sessionStore.ActiveStatus,
		SaveChat:     chatStore.Save,
	})

	roomH := &rooms.Handlers{Store: roomStore, Notify: hub}
	sessionH := &sessions.Handlers{Store: sessionStore, Notify: hub}
	chatH := &chat.Handlers{Store: chatStore, Rooms: roomStore, Notify: hub}
	todoH := &todos.Handlers{Store: todos.NewStore(o.DB)}
	profileH := &profiles.Handlers{Users: userStore, Sessions: sessionStore}
	wsH := &ws.Handler{Tickets: o.Tickets, Users: userStore, Hub: hub, AppOrigin: o.AppURL}

	// protected wraps a handler with authentication and app-user loading.
	protected := func(h http.HandlerFunc) http.Handler {
		return o.Authenticate(userStore.Require(h))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := o.DB.Ping(r.Context()); err != nil {
			httpx.Error(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.Handle("GET /api/me", protected(func(w http.ResponseWriter, r *http.Request) {
		u, _ := users.FromContext(r.Context())
		httpx.JSON(w, http.StatusOK, u)
	}))

	mux.Handle("GET /api/rooms", protected(roomH.List))
	mux.Handle("POST /api/rooms", protected(roomH.Create))
	mux.Handle("POST /api/rooms/join", protected(roomH.JoinByCode))
	mux.Handle("GET /api/rooms/{id}", protected(roomH.Get))
	mux.Handle("PATCH /api/rooms/{id}", protected(roomH.Update))
	mux.Handle("DELETE /api/rooms/{id}", protected(roomH.Delete))
	mux.Handle("POST /api/rooms/{id}/join", protected(roomH.Join))
	mux.Handle("POST /api/rooms/{id}/leave", protected(roomH.Leave))
	mux.Handle("POST /api/rooms/{id}/invite", protected(roomH.RegenerateInvite))
	mux.Handle("POST /api/rooms/{id}/timer", protected(roomH.ControlTimer))
	mux.Handle("GET /api/rooms/{id}/leaderboard", protected(roomH.Leaderboard))
	mux.Handle("GET /api/rooms/{id}/messages", protected(chatH.History))
	mux.Handle("DELETE /api/rooms/{id}/messages/{msgId}", protected(chatH.Delete))
	mux.Handle("PATCH /api/rooms/{id}/members/{userId}", protected(roomH.SetRole))
	mux.Handle("DELETE /api/rooms/{id}/members/{userId}", protected(roomH.RemoveMember))

	mux.Handle("POST /api/sessions", protected(sessionH.Start))
	mux.Handle("POST /api/sessions/stop", protected(sessionH.Stop))
	mux.Handle("GET /api/sessions/active", protected(sessionH.Active))
	mux.Handle("GET /api/sessions/stats", protected(sessionH.Stats))

	mux.Handle("PUT /api/me/goal", protected(userStore.SetGoal))
	mux.Handle("PATCH /api/me/profile", protected(userStore.SetProfile))
	mux.Handle("GET /api/users/check", protected(userStore.CheckUsername))
	mux.Handle("GET /api/users/search", protected(userStore.Search))
	// Public profiles are readable without signing in.
	mux.HandleFunc("GET /api/profiles/{username}", profileH.Get)
	mux.Handle("GET /api/todos", protected(todoH.List))
	mux.Handle("POST /api/todos", protected(todoH.Create))
	mux.Handle("PATCH /api/todos/{id}", protected(todoH.Update))
	mux.Handle("DELETE /api/todos/{id}", protected(todoH.Delete))

	mux.Handle("POST /api/ws/ticket", protected(wsH.IssueTicket))
	mux.HandleFunc("GET /ws", wsH.Connect)

	return httpx.CORS(o.AppURL, mux), hub
}
