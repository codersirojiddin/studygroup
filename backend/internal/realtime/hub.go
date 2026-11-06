// Package realtime tracks who is connected to which room and fans out
// presence, study status and chat messages over WebSockets.
//
// State is in memory, so it is per API instance (see ws.TicketStore).
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"sync"
	"time"
)

// Status is a user's running study session.
type Status struct {
	RoomID string // "" for a session not tied to a room
	Since  time.Time
	Topic  string
}

// Deps are the database lookups the hub needs; injected to avoid import cycles.
type Deps struct {
	// IsMember reports whether the user belongs to the room.
	IsMember func(ctx context.Context, roomID, userID string) (bool, error)
	// ActiveStatus returns the user's running session, or nil.
	ActiveStatus func(ctx context.Context, userID string) (*Status, error)
	// SaveChat stores a chat message and returns its id and timestamp.
	SaveChat func(ctx context.Context, roomID, userID, text string) (string, time.Time, error)
}

type Hub struct {
	deps Deps

	mu      sync.Mutex
	rooms   map[string]map[*Client]struct{} // roomID -> clients
	studied map[string]*Status              // userID -> running session, for connected users
}

func NewHub(deps Deps) *Hub {
	return &Hub{deps: deps, rooms: map[string]map[*Client]struct{}{}, studied: map[string]*Status{}}
}

// Client is one WebSocket connection. Send is drained by the connection's writer.
type Client struct {
	UserID      string
	DisplayName string
	Send        chan []byte
	Close       func() // closes the underlying connection

	room     string // guarded by Hub.mu
	lastChat time.Time
}

const sendBuffer = 64

func NewClient(userID, displayName string, closeFn func()) *Client {
	return &Client{UserID: userID, DisplayName: displayName, Send: make(chan []byte, sendBuffer), Close: closeFn}
}

// Outgoing message shapes.
type presenceMember struct {
	UserID      string     `json:"userId"`
	DisplayName string     `json:"displayName"`
	Studying    bool       `json:"studying"`
	Since       *time.Time `json:"since,omitempty"`
	Topic       string     `json:"topic,omitempty"`
}

func encode(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// deliver queues a message without blocking. A client too slow to keep up is disconnected.
func (h *Hub) deliver(c *Client, msg []byte) {
	select {
	case c.Send <- msg:
	default:
		slog.Warn("ws client too slow, dropping", "user", c.UserID)
		go c.Close()
	}
}

// broadcastLocked sends msg to every client in the room. Caller holds h.mu.
func (h *Hub) broadcastLocked(roomID string, msg []byte) {
	for c := range h.rooms[roomID] {
		h.deliver(c, msg)
	}
}

// presenceLocked builds the room's presence list, one entry per user. Caller holds h.mu.
func (h *Hub) presenceLocked(roomID string) []byte {
	seen := map[string]bool{}
	members := []presenceMember{}
	for c := range h.rooms[roomID] {
		if seen[c.UserID] {
			continue // same user in several tabs
		}
		seen[c.UserID] = true
		m := presenceMember{UserID: c.UserID, DisplayName: c.DisplayName}
		if st := h.studied[c.UserID]; st != nil && st.RoomID == roomID {
			since := st.Since
			m.Studying, m.Since, m.Topic = true, &since, st.Topic
		}
		members = append(members, m)
	}
	sort.Slice(members, func(i, j int) bool { return members[i].DisplayName < members[j].DisplayName })
	return encode(map[string]any{"type": "presence", "roomId": roomID, "members": members})
}

// leaveLocked removes c from its current room and updates that room's presence. Caller holds h.mu.
func (h *Hub) leaveLocked(c *Client) {
	if c.room == "" {
		return
	}
	old := c.room
	delete(h.rooms[old], c)
	if len(h.rooms[old]) == 0 {
		delete(h.rooms, old)
	} else {
		h.broadcastLocked(old, h.presenceLocked(old))
	}
	c.room = ""
}

// Join moves the client into roomID after checking membership.
func (h *Hub) Join(ctx context.Context, c *Client, roomID string) error {
	ok, err := h.deps.IsMember(ctx, roomID, c.UserID)
	if err != nil {
		return err
	}
	if !ok {
		return errNotMember
	}
	status, err := h.deps.ActiveStatus(ctx, c.UserID)
	if err != nil {
		return err
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	h.leaveLocked(c)
	h.studied[c.UserID] = status
	if h.rooms[roomID] == nil {
		h.rooms[roomID] = map[*Client]struct{}{}
	}
	h.rooms[roomID][c] = struct{}{}
	c.room = roomID
	h.broadcastLocked(roomID, h.presenceLocked(roomID))
	return nil
}

// Leave removes the client from its room, if any.
func (h *Hub) Leave(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.leaveLocked(c)
}

// Unregister forgets a disconnected client.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.leaveLocked(c)
	if !h.userConnectedLocked(c.UserID) {
		delete(h.studied, c.UserID)
	}
}

func (h *Hub) userConnectedLocked(userID string) bool {
	for _, clients := range h.rooms {
		for c := range clients {
			if c.UserID == userID {
				return true
			}
		}
	}
	return false
}

const (
	maxChatLen   = 500
	chatInterval = 300 * time.Millisecond
)

// Chat stores a message and broadcasts it to the client's current room.
func (h *Hub) Chat(ctx context.Context, c *Client, text string) error {
	if text == "" || len([]rune(text)) > maxChatLen {
		return errBadChat
	}

	// Validate and rate-limit under the lock, but don't hold it during the database write.
	h.mu.Lock()
	roomID := c.room
	now := time.Now()
	switch {
	case roomID == "":
		h.mu.Unlock()
		return errNoRoom
	case now.Sub(c.lastChat) < chatInterval:
		h.mu.Unlock()
		return errTooFast
	}
	c.lastChat = now
	h.mu.Unlock()

	id, at, err := h.deps.SaveChat(ctx, roomID, c.UserID, text)
	if err != nil {
		return err
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(roomID, encode(map[string]any{
		"type": "chat", "id": id, "roomId": roomID, "userId": c.UserID, "displayName": c.DisplayName,
		"text": text, "sentAt": at.UTC(),
	}))
	return nil
}

// ChatDeleted tells the room to hide a removed message.
func (h *Hub) ChatDeleted(roomID, msgID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(roomID, encode(map[string]any{"type": "chat_deleted", "roomId": roomID, "id": msgID}))
}

// SetStatus records that a user started (st != nil) or stopped (st == nil)
// studying and refreshes presence in every room they are connected to.
func (h *Hub) SetStatus(userID string, st *Status) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.userConnectedLocked(userID) {
		return
	}
	h.studied[userID] = st
	for roomID, clients := range h.rooms {
		for c := range clients {
			if c.UserID == userID {
				h.broadcastLocked(roomID, h.presenceLocked(roomID))
				break
			}
		}
	}
}

// RefreshStatus reloads a user's running session from the database and
// publishes it. Used after changes that may end a session as a side effect.
func (h *Hub) RefreshStatus(ctx context.Context, userID string) {
	st, err := h.deps.ActiveStatus(ctx, userID)
	if err != nil {
		slog.Error("refresh study status", "user", userID, "err", err)
		return
	}
	h.SetStatus(userID, st)
}

// TimerChanged sends the room's new Pomodoro state with the server time, so
// clients can correct for their own clock skew.
func (h *Hub) TimerChanged(roomID string, timer any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(roomID, encode(map[string]any{
		"type": "timer", "roomId": roomID, "timer": timer, "serverNow": time.Now().UTC(),
	}))
}

// MembersChanged tells clients in the room to reload the member list.
func (h *Hub) MembersChanged(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(roomID, encode(map[string]any{"type": "members_changed", "roomId": roomID}))
}

// RoomUpdated tells clients the room's settings changed.
func (h *Hub) RoomUpdated(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(roomID, encode(map[string]any{"type": "room_updated", "roomId": roomID}))
}

// RemoveUser disconnects a user's clients from the room (kicked or left) and notifies them.
func (h *Hub) RemoveUser(roomID, userID, reason string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	msg := encode(map[string]any{"type": reason, "roomId": roomID})
	for c := range h.rooms[roomID] {
		if c.UserID == userID {
			h.deliver(c, msg)
			h.leaveLocked(c)
		}
	}
	h.broadcastLocked(roomID, encode(map[string]any{"type": "members_changed", "roomId": roomID}))
}

// CloseRoom notifies everyone in a deleted room and empties it.
func (h *Hub) CloseRoom(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	msg := encode(map[string]any{"type": "room_deleted", "roomId": roomID})
	for c := range h.rooms[roomID] {
		h.deliver(c, msg)
		c.room = ""
	}
	delete(h.rooms, roomID)
}

// IsClientError reports whether err is safe to show to the client.
func IsClientError(err error) bool {
	_, ok := err.(hubError)
	return ok
}

type hubError string

func (e hubError) Error() string { return string(e) }

const (
	errNotMember hubError = "you are not a member of this room"
	errNoRoom    hubError = "join a room first"
	errBadChat   hubError = "message must be 1-500 characters"
	errTooFast   hubError = "you are sending messages too fast"
)
