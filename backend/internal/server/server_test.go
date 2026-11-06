package server_test

// Integration tests against a real Postgres. Each run creates a private
// schema, applies the migrations there, and drops it afterwards, so the
// application's own tables are never touched.
//
// Uses TEST_DATABASE_URL, falling back to DIRECT_URL from backend/.env.
// Skipped when neither is set.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/auth"
	"github.com/study-online/backend/internal/config"
	"github.com/study-online/backend/internal/server"
	"github.com/study-online/backend/internal/ws"
	"github.com/study-online/backend/migrations"
)

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	config.LoadDotEnv("../../.env")
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DIRECT_URL")
	}
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (or DIRECT_URL) to run integration tests")
	}
	ctx := context.Background()

	b := make([]byte, 4)
	rand.Read(b)
	schema := "itest_" + hex.EncodeToString(b)

	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("drop test schema %s: %v", schema, err)
		}
		admin.Close(context.Background())
	})

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Neon's proxy drops startup parameters, so set the schema per connection.
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, "SET search_path TO "+schema)
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	names, _ := fs.Glob(migrations.FS, "*.up.sql")
	sort.Strings(names)
	for _, n := range names {
		sql, _ := fs.ReadFile(migrations.FS, n)
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("migration %s: %v", n, err)
		}
	}
	return pool
}

// fakeAuth trusts an X-Test-Sub header in place of a verified JWT.
func fakeAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sub := r.Header.Get("X-Test-Sub")
		if sub == "" {
			http.Error(w, `{"error":"missing"}`, http.StatusUnauthorized)
			return
		}
		name := r.Header.Get("X-Test-Name")
		if name == "" {
			name = sub
		}
		id := auth.Identity{AuthUserID: sub, Claims: &auth.Claims{Email: sub + "@example.com", Name: name}}
		next.ServeHTTP(w, r.WithContext(auth.WithIdentity(r.Context(), id)))
	})
}

type api struct {
	t   *testing.T
	url string
}

// do sends a request as user sub and decodes the JSON response into out (if non-nil).
func (a api) do(sub, method, path string, body any, out any) int {
	a.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, a.url+path, &buf)
	req.Header.Set("X-Test-Sub", sub)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		a.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil && res.StatusCode < 300 && res.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			a.t.Fatalf("%s %s: decode: %v", method, path, err)
		}
	}
	return res.StatusCode
}

func (a api) expect(want int, sub, method, path string, body any, out any) {
	a.t.Helper()
	if got := a.do(sub, method, path, body, out); got != want {
		a.t.Fatalf("%s %s as %s: status %d, want %d", method, path, sub, got, want)
	}
}

type room struct {
	ID          string `json:"id"`
	MemberCount int    `json:"memberCount"`
	MyRole      string `json:"myRole"`
	InviteCode  string `json:"inviteCode"`
}

type me struct {
	ID string `json:"id"`
}

func setup(t *testing.T) (api, string) {
	pool := testDB(t)
	handler, _ := server.New(server.Options{
		DB: pool, Authenticate: fakeAuth, Tickets: ws.NewTicketStore(), AppURL: "http://localhost:3000",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return api{t: t, url: srv.URL}, srv.URL
}

func TestRoomsAndPermissions(t *testing.T) {
	a, _ := setup(t)

	var alice, bob, dave me
	a.expect(200, "alice", "GET", "/api/me", nil, &alice)
	a.expect(200, "bob", "GET", "/api/me", nil, &bob)
	a.expect(200, "dave", "GET", "/api/me", nil, &dave)

	// Validation.
	a.expect(400, "alice", "POST", "/api/rooms", map[string]any{"name": "  "}, nil)
	a.expect(400, "alice", "POST", "/api/rooms", map[string]any{"name": "x", "visibility": "secret"}, nil)
	a.expect(400, "alice", "POST", "/api/rooms", map[string]any{"name": "x", "extra": 1}, nil)

	var pub room
	a.expect(201, "alice", "POST", "/api/rooms", map[string]any{"name": "Math", "maxMembers": 3}, &pub)
	if pub.MyRole != "owner" || pub.MemberCount != 1 || pub.InviteCode == "" {
		t.Fatalf("created room = %+v", pub)
	}

	// Bob sees it in the public list, without the invite code.
	var list struct{ Mine, Public []room }
	a.expect(200, "bob", "GET", "/api/rooms", nil, &list)
	if len(list.Public) != 1 || list.Public[0].InviteCode != "" || len(list.Mine) != 0 {
		t.Fatalf("bob's list = %+v", list)
	}
	a.expect(200, "bob", "POST", "/api/rooms/"+pub.ID+"/join", nil, nil)
	a.expect(200, "bob", "POST", "/api/rooms/"+pub.ID+"/join", nil, nil) // idempotent

	// Private room: invisible without the code.
	var priv room
	a.expect(201, "alice", "POST", "/api/rooms", map[string]any{"name": "Secret", "visibility": "private"}, &priv)
	a.expect(404, "bob", "GET", "/api/rooms/"+priv.ID, nil, nil)
	a.expect(404, "bob", "POST", "/api/rooms/"+priv.ID+"/join", nil, nil)
	a.expect(400, "bob", "POST", "/api/rooms/join", map[string]string{"code": "wrong"}, nil)
	a.expect(200, "bob", "POST", "/api/rooms/join", map[string]string{"code": priv.InviteCode}, nil)

	// Regenerating the code invalidates the old one.
	var inv struct{ InviteCode string }
	a.expect(200, "alice", "POST", "/api/rooms/"+priv.ID+"/invite", nil, &inv)
	a.expect(400, "dave", "POST", "/api/rooms/join", map[string]string{"code": priv.InviteCode}, nil)
	a.expect(403, "bob", "POST", "/api/rooms/"+priv.ID+"/invite", nil, nil) // plain member

	// Capacity: alice, bob, dave fill the 3 seats.
	a.expect(200, "dave", "POST", "/api/rooms/"+pub.ID+"/join", nil, nil)
	a.expect(409, "erin", "POST", "/api/rooms/"+pub.ID+"/join", nil, nil)
	a.expect(409, "alice", "PATCH", "/api/rooms/"+pub.ID, map[string]any{"name": "Math", "maxMembers": 2}, nil)

	// Roles.
	a.expect(403, "bob", "DELETE", "/api/rooms/"+pub.ID, nil, nil)
	a.expect(403, "bob", "PATCH", "/api/rooms/"+pub.ID, map[string]any{"name": "Hacked"}, nil)
	a.expect(403, "bob", "DELETE", "/api/rooms/"+pub.ID+"/members/"+dave.ID, nil, nil)
	a.expect(204, "alice", "PATCH", "/api/rooms/"+pub.ID+"/members/"+bob.ID, map[string]string{"role": "moderator"}, nil)
	a.expect(403, "bob", "PATCH", "/api/rooms/"+pub.ID+"/members/"+dave.ID, map[string]string{"role": "moderator"}, nil)
	a.expect(403, "alice", "PATCH", "/api/rooms/"+pub.ID+"/members/"+alice.ID, map[string]string{"role": "member"}, nil)
	a.expect(403, "bob", "DELETE", "/api/rooms/"+pub.ID+"/members/"+alice.ID, nil, nil)
	a.expect(200, "bob", "PATCH", "/api/rooms/"+pub.ID, map[string]any{"name": "Math 2", "maxMembers": 3}, nil)
	a.expect(204, "bob", "DELETE", "/api/rooms/"+pub.ID+"/members/"+dave.ID, nil, nil)
	a.expect(404, "dave", "POST", "/api/rooms/"+pub.ID+"/leave", nil, nil)

	var detail struct {
		Room    room
		Members []struct{ UserID, Role string }
	}
	a.expect(200, "bob", "GET", "/api/rooms/"+pub.ID, nil, &detail)
	if len(detail.Members) != 2 || detail.Members[0].Role != "owner" || detail.Members[1].Role != "moderator" {
		t.Fatalf("members = %+v", detail.Members)
	}

	// Leaving and deleting.
	a.expect(409, "alice", "POST", "/api/rooms/"+pub.ID+"/leave", nil, nil)
	a.expect(204, "bob", "POST", "/api/rooms/"+pub.ID+"/leave", nil, nil)
	a.expect(204, "alice", "DELETE", "/api/rooms/"+pub.ID, nil, nil)
	a.expect(404, "alice", "GET", "/api/rooms/"+pub.ID, nil, nil)
	a.expect(404, "alice", "GET", "/api/rooms/not-a-uuid", nil, nil)
}

func TestSessions(t *testing.T) {
	a, _ := setup(t)

	var r, other room
	a.expect(201, "alice", "POST", "/api/rooms", map[string]any{"name": "Physics"}, &r)
	a.expect(201, "bob", "POST", "/api/rooms", map[string]any{"name": "Bob's"}, &other)

	var active *struct{ ID string }
	a.expect(200, "alice", "GET", "/api/sessions/active", nil, &active)
	if active != nil {
		t.Fatal("expected no active session")
	}

	a.expect(403, "alice", "POST", "/api/sessions", map[string]string{"roomId": other.ID}, nil)
	a.expect(400, "alice", "POST", "/api/sessions", map[string]string{"topic": strings.Repeat("x", 101)}, nil)
	a.expect(201, "alice", "POST", "/api/sessions", map[string]string{"roomId": r.ID, "topic": "Kinematics"}, nil)
	a.expect(409, "alice", "POST", "/api/sessions", map[string]string{}, nil)
	a.expect(200, "alice", "GET", "/api/sessions/active", nil, &active)
	if active == nil {
		t.Fatal("expected an active session")
	}
	a.expect(200, "alice", "POST", "/api/sessions/stop", nil, nil)
	a.expect(409, "alice", "POST", "/api/sessions/stop", nil, nil)

	// A room-less session works too.
	a.expect(201, "alice", "POST", "/api/sessions", map[string]string{}, nil)
	a.expect(200, "alice", "POST", "/api/sessions/stop", nil, nil)

	var stats struct {
		Stats struct {
			SessionCount int
			StreakDays   int
			Last7Days    []struct{ Date string }
		}
		Recent []struct{ Topic string }
	}
	a.expect(400, "alice", "GET", "/api/sessions/stats?tz=Mars/Base", nil, nil)
	a.expect(200, "alice", "GET", "/api/sessions/stats?tz=Asia/Tashkent", nil, &stats)
	if stats.Stats.SessionCount != 2 || stats.Stats.StreakDays != 1 || len(stats.Stats.Last7Days) != 7 {
		t.Fatalf("stats = %+v", stats.Stats)
	}
	if len(stats.Recent) != 2 || stats.Recent[1].Topic != "Kinematics" {
		t.Fatalf("recent = %+v", stats.Recent)
	}

	// Bob doesn't see Alice's sessions.
	a.expect(200, "bob", "GET", "/api/sessions/stats", nil, &stats)
	if stats.Stats.SessionCount != 0 {
		t.Fatalf("bob stats = %+v", stats.Stats)
	}
}

type wsConn struct {
	t *testing.T
	c *websocket.Conn
}

func dial(t *testing.T, a api, base, sub string) wsConn {
	t.Helper()
	var tk struct{ Ticket string }
	a.expect(200, sub, "POST", "/api/ws/ticket", nil, &tk)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws?ticket=" + tk.Ticket
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.CloseNow() })

	// The same ticket must not work twice.
	if _, _, err := websocket.Dial(ctx, url, nil); err == nil {
		t.Fatal("ticket reused")
	}
	w := wsConn{t, c}
	w.until("welcome", nil)
	return w
}

func (w wsConn) send(v any) {
	w.t.Helper()
	b, _ := json.Marshal(v)
	if err := w.c.Write(context.Background(), websocket.MessageText, b); err != nil {
		w.t.Fatal(err)
	}
}

// until reads messages until one of the given type satisfies match (nil matches any).
func (w wsConn) until(typ string, match func(map[string]any) bool) map[string]any {
	w.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for {
		_, data, err := w.c.Read(ctx)
		if err != nil {
			w.t.Fatalf("waiting for %q: %v", typ, err)
		}
		var m map[string]any
		json.Unmarshal(data, &m)
		if m["type"] == typ && (match == nil || match(m)) {
			return m
		}
	}
}

func presenceHas(userID string, studying bool) func(map[string]any) bool {
	return func(m map[string]any) bool {
		for _, raw := range m["members"].([]any) {
			p := raw.(map[string]any)
			if p["userId"] == userID && p["studying"] == studying {
				return true
			}
		}
		return false
	}
}

func TestRealtime(t *testing.T) {
	a, base := setup(t)

	var alice, bob me
	a.expect(200, "alice", "GET", "/api/me", nil, &alice)
	a.expect(200, "bob", "GET", "/api/me", nil, &bob)
	var r room
	a.expect(201, "alice", "POST", "/api/rooms", map[string]any{"name": "Live"}, &r)

	wa := dial(t, a, base, "alice")
	wb := dial(t, a, base, "bob")

	// Bob can't join a room he isn't a member of.
	wb.send(map[string]string{"type": "join", "roomId": r.ID})
	if msg := wb.until("error", nil); !strings.Contains(fmt.Sprint(msg["message"]), "not a member") {
		t.Fatalf("error = %v", msg)
	}

	a.expect(200, "bob", "POST", "/api/rooms/"+r.ID+"/join", nil, nil)
	wa.send(map[string]string{"type": "join", "roomId": r.ID})
	wa.until("presence", presenceHas(alice.ID, false))
	wb.send(map[string]string{"type": "join", "roomId": r.ID})
	wa.until("presence", presenceHas(bob.ID, false))

	// Starting a session over REST flips Bob to studying for everyone in the room.
	a.expect(201, "bob", "POST", "/api/sessions", map[string]string{"roomId": r.ID, "topic": "Waves"}, nil)
	wa.until("presence", presenceHas(bob.ID, true))
	a.expect(200, "bob", "POST", "/api/sessions/stop", nil, nil)
	wa.until("presence", presenceHas(bob.ID, false))

	// Chat reaches the other member.
	wb.send(map[string]string{"type": "chat", "text": "hi alice"})
	if msg := wa.until("chat", nil); msg["text"] != "hi alice" || msg["userId"] != bob.ID {
		t.Fatalf("chat = %v", msg)
	}
	wb.send(map[string]string{"type": "chat", "text": strings.Repeat("x", 501)})
	wb.until("error", nil)

	// Kicking notifies the kicked user and drops them from presence.
	a.expect(204, "alice", "DELETE", "/api/rooms/"+r.ID+"/members/"+bob.ID, nil, nil)
	wb.until("kicked", nil)
	wa.until("presence", func(m map[string]any) bool { return !presenceHas(bob.ID, false)(m) })

	// Shared timer: only owners/moderators control it, and changes reach the room.
	a.expect(200, "bob", "POST", "/api/rooms/"+r.ID+"/join", nil, nil)
	wb2 := dial(t, a, base, "bob")
	wb2.send(map[string]string{"type": "join", "roomId": r.ID})
	wa.until("presence", presenceHas(bob.ID, false))
	a.expect(403, "bob", "POST", "/api/rooms/"+r.ID+"/timer", map[string]any{"action": "start", "focusMinutes": 25, "breakMinutes": 5}, nil)
	a.expect(400, "alice", "POST", "/api/rooms/"+r.ID+"/timer", map[string]any{"action": "start", "focusMinutes": 0, "breakMinutes": 5}, nil)
	a.expect(409, "alice", "POST", "/api/rooms/"+r.ID+"/timer", map[string]any{"action": "resume"}, nil)
	a.expect(200, "alice", "POST", "/api/rooms/"+r.ID+"/timer", map[string]any{"action": "start", "focusMinutes": 50, "breakMinutes": 10}, nil)
	msg := wb2.until("timer", nil)
	if tm := msg["timer"].(map[string]any); tm["running"] != true || tm["focusSeconds"] != float64(3000) {
		t.Fatalf("timer = %v", tm)
	}
	a.expect(200, "alice", "POST", "/api/rooms/"+r.ID+"/timer", map[string]any{"action": "pause"}, nil)
	wb2.until("timer", func(m map[string]any) bool { return m["timer"].(map[string]any)["running"] == false })
	var detail struct{ Timer struct{ PausedMs int64 } }
	a.expect(200, "bob", "GET", "/api/rooms/"+r.ID, nil, &detail)
	if detail.Timer.PausedMs <= 0 {
		t.Fatalf("GET timer = %+v", detail.Timer)
	}

	// Deleting the room notifies whoever is still in it.
	a.expect(204, "alice", "DELETE", "/api/rooms/"+r.ID, nil, nil)
	wa.until("room_deleted", nil)
}

func TestNameSyncsFromNeonAuth(t *testing.T) {
	a, _ := setup(t)
	get := func(name string) string {
		req, _ := http.NewRequest("GET", a.url+"/api/me", nil)
		req.Header.Set("X-Test-Sub", "zoe")
		if name != "" {
			req.Header.Set("X-Test-Name", name)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var u struct{ DisplayName string }
		json.NewDecoder(res.Body).Decode(&u)
		return u.DisplayName
	}
	if got := get("Zoe"); got != "Zoe" {
		t.Fatalf("first sight: %q", got)
	}
	// Renamed in Neon Auth account settings: the next token carries the new name.
	if got := get("Zoe Karimova"); got != "Zoe Karimova" {
		t.Fatalf("after rename: %q", got)
	}
}

func TestLeaderboardChatGoalsTodos(t *testing.T) {
	a, base := setup(t)

	var alice, bob me
	a.expect(200, "alice", "GET", "/api/me", nil, &alice)
	a.expect(200, "bob", "GET", "/api/me", nil, &bob)
	var r room
	a.expect(201, "alice", "POST", "/api/rooms", map[string]any{"name": "Board"}, &r)
	a.expect(200, "bob", "POST", "/api/rooms/"+r.ID+"/join", nil, nil)

	// Leaderboard: members only; everyone listed, studiers first.
	a.expect(201, "bob", "POST", "/api/sessions", map[string]string{"roomId": r.ID}, nil)
	time.Sleep(1100 * time.Millisecond)
	a.expect(200, "bob", "POST", "/api/sessions/stop", nil, nil)
	var board struct {
		Entries []struct {
			UserID  string
			Seconds int64
		}
	}
	a.expect(404, "carol", "GET", "/api/rooms/"+r.ID+"/leaderboard", nil, nil)
	a.expect(400, "alice", "GET", "/api/rooms/"+r.ID+"/leaderboard?tz=Nowhere", nil, nil)
	a.expect(200, "alice", "GET", "/api/rooms/"+r.ID+"/leaderboard?tz=Asia/Tashkent", nil, &board)
	if len(board.Entries) != 2 || board.Entries[0].UserID != bob.ID || board.Entries[0].Seconds < 1 || board.Entries[1].Seconds != 0 {
		t.Fatalf("leaderboard = %+v", board.Entries)
	}

	// Chat is saved, readable by members, deletable by author or moderators.
	wa := dial(t, a, base, "alice")
	wb := dial(t, a, base, "bob")
	wa.send(map[string]string{"type": "join", "roomId": r.ID})
	wb.send(map[string]string{"type": "join", "roomId": r.ID})
	wa.until("presence", presenceHas(bob.ID, false))
	wb.send(map[string]string{"type": "chat", "text": "first"})
	msg := wa.until("chat", nil)
	msgID, _ := msg["id"].(string)
	if msgID == "" {
		t.Fatalf("chat message without id: %v", msg)
	}
	time.Sleep(350 * time.Millisecond) // rate limit
	wa.send(map[string]string{"type": "chat", "text": "second"})
	wb.until("chat", func(m map[string]any) bool { return m["text"] == "second" })

	var hist struct {
		Messages []struct{ ID, Text, UserID string }
	}
	a.expect(404, "carol", "GET", "/api/rooms/"+r.ID+"/messages", nil, nil)
	a.expect(200, "bob", "GET", "/api/rooms/"+r.ID+"/messages", nil, &hist)
	if len(hist.Messages) != 2 || hist.Messages[0].Text != "first" || hist.Messages[1].Text != "second" {
		t.Fatalf("history = %+v", hist.Messages)
	}
	secondID := hist.Messages[1].ID
	a.expect(403, "bob", "DELETE", "/api/rooms/"+r.ID+"/messages/"+secondID, nil, nil) // alice's message
	a.expect(204, "bob", "DELETE", "/api/rooms/"+r.ID+"/messages/"+msgID, nil, nil)    // own message
	wa.until("chat_deleted", func(m map[string]any) bool { return m["id"] == msgID })
	a.expect(204, "alice", "DELETE", "/api/rooms/"+r.ID+"/messages/"+secondID, nil, nil) // owner
	a.expect(404, "alice", "DELETE", "/api/rooms/"+r.ID+"/messages/"+secondID, nil, nil)
	a.expect(200, "bob", "GET", "/api/rooms/"+r.ID+"/messages", nil, &hist)
	if len(hist.Messages) != 0 {
		t.Fatalf("deleted messages still listed: %+v", hist.Messages)
	}

	// Daily goal.
	var u struct{ DailyGoalMinutes int }
	a.expect(200, "alice", "GET", "/api/me", nil, &u)
	if u.DailyGoalMinutes != 120 {
		t.Fatalf("default goal = %d", u.DailyGoalMinutes)
	}
	a.expect(400, "alice", "PUT", "/api/me/goal", map[string]int{"minutes": 5}, nil)
	a.expect(200, "alice", "PUT", "/api/me/goal", map[string]int{"minutes": 180}, &u)
	if u.DailyGoalMinutes != 180 {
		t.Fatalf("goal = %d", u.DailyGoalMinutes)
	}

	// To-dos are private to their owner.
	type todo struct {
		ID    string
		Title string
		Done  bool
	}
	var t1, t2 todo
	a.expect(400, "alice", "POST", "/api/todos", map[string]string{"title": "  "}, nil)
	a.expect(201, "alice", "POST", "/api/todos", map[string]string{"title": "Read chapter 3"}, &t1)
	a.expect(201, "alice", "POST", "/api/todos", map[string]string{"title": "Practice test"}, &t2)
	a.expect(200, "alice", "PATCH", "/api/todos/"+t1.ID, map[string]bool{"done": true}, &t1)
	if !t1.Done {
		t.Fatal("todo not marked done")
	}
	a.expect(404, "bob", "PATCH", "/api/todos/"+t2.ID, map[string]bool{"done": true}, nil)
	a.expect(404, "bob", "DELETE", "/api/todos/"+t2.ID, nil, nil)

	var list []todo
	a.expect(200, "alice", "GET", "/api/todos?tz=Asia/Tashkent", nil, &list)
	if len(list) != 2 || list[0].ID != t2.ID || !list[1].Done {
		t.Fatalf("todos = %+v", list)
	}
	a.expect(200, "bob", "GET", "/api/todos", nil, &list)
	if len(list) != 0 {
		t.Fatalf("bob sees alice's todos: %+v", list)
	}
	a.expect(200, "alice", "PATCH", "/api/todos/"+t1.ID, map[string]any{"done": false, "title": "Re-read chapter 3"}, &t1)
	if t1.Done || t1.Title != "Re-read chapter 3" {
		t.Fatalf("updated = %+v", t1)
	}
	a.expect(204, "alice", "DELETE", "/api/todos/"+t1.ID, nil, nil)
}
