package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/coder/websocket"

	"github.com/study-online/backend/internal/httpx"
	"github.com/study-online/backend/internal/realtime"
	"github.com/study-online/backend/internal/users"
)

type Handler struct {
	Tickets   *TicketStore
	Users     *users.Store
	Hub       *realtime.Hub
	AppOrigin string // e.g. https://app.example.com
}

// IssueTicket handles POST /api/ws/ticket. It must sit behind auth middleware.
func (h *Handler) IssueTicket(w http.ResponseWriter, r *http.Request) {
	u, ok := users.FromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	value, expires := h.Tickets.Issue(u.AuthUserID)
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, http.StatusOK, map[string]any{"ticket": value, "expiresAt": expires})
}

// incoming is any client message:
//
//	{"type":"join","roomId":"..."}  {"type":"leave"}
//	{"type":"chat","text":"..."}    {"type":"ping"}
type incoming struct {
	Type   string `json:"type"`
	RoomID string `json:"roomId"`
	Text   string `json:"text"`
}

const (
	writeTimeout = 10 * time.Second
	pingInterval = 30 * time.Second
)

// Connect handles GET /ws?ticket=... and upgrades the connection.
func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	authUserID, ok := h.Tickets.Redeem(r.URL.Query().Get("ticket"))
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "invalid or expired ticket")
		return
	}
	u, err := h.Users.ByAuthUserID(r.Context(), authUserID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unknown user")
		return
	}

	origin, _ := url.Parse(h.AppOrigin)
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{origin.Host},
	})
	if err != nil {
		return // Accept already wrote the error response
	}
	defer conn.CloseNow()
	conn.SetReadLimit(8 << 10)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := realtime.NewClient(u.ID, u.DisplayName, cancel)
	defer h.Hub.Unregister(client)
	go writeLoop(ctx, conn, client)

	trySend(client, map[string]any{"type": "welcome", "userId": u.ID})
	slog.Debug("ws connected", "user", u.ID)

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var msg incoming
		if err := json.Unmarshal(data, &msg); err != nil {
			sendError(client, "invalid message")
			continue
		}
		switch msg.Type {
		case "join":
			if !httpx.IsUUID(msg.RoomID) {
				sendError(client, "invalid roomId")
				continue
			}
			if err := h.Hub.Join(ctx, client, msg.RoomID); err != nil {
				sendError(client, publicError(err))
			}
		case "leave":
			h.Hub.Leave(client)
		case "chat":
			if err := h.Hub.Chat(ctx, client, msg.Text); err != nil {
				sendError(client, publicError(err))
			}
		case "ping":
			trySend(client, map[string]string{"type": "pong"})
		default:
			sendError(client, "unknown message type")
		}
	}
}

// writeLoop is the connection's only writer; it also keeps the connection alive.
func writeLoop(ctx context.Context, conn *websocket.Conn, c *realtime.Client) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.Send:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				c.Close()
				return
			}
		case <-ticker.C:
			pctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				c.Close()
				return
			}
		}
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func sendError(c *realtime.Client, msg string) {
	trySend(c, map[string]string{"type": "error", "message": msg})
}

// trySend queues a message unless the client's buffer is full.
func trySend(c *realtime.Client, v any) {
	select {
	case c.Send <- mustJSON(v):
	default:
	}
}

// publicError hides internal errors (e.g. database failures) from clients.
func publicError(err error) string {
	if realtime.IsClientError(err) {
		return err.Error()
	}
	slog.Error("ws", "err", err)
	return "something went wrong"
}
