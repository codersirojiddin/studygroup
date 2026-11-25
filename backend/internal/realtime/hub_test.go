package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func testHub() *Hub {
	return NewHub(Deps{
		IsMember:     func(context.Context, string, string) (bool, error) { return true, nil },
		ActiveStatus: func(context.Context, string) (*Status, error) { return nil, nil },
		SaveChat: func(context.Context, string, string, string) (string, time.Time, error) {
			return "id", time.Now(), nil
		},
	})
}

func join(t *testing.T, h *Hub, user, room string) *Client {
	t.Helper()
	c := NewClient(user, "User "+user, func() {})
	if err := h.Join(context.Background(), c, room); err != nil {
		t.Fatalf("join: %v", err)
	}
	return c
}

// drain returns the next queued message of the given type, skipping others (presence updates).
func drain(t *testing.T, c *Client, typ string) map[string]any {
	t.Helper()
	for {
		select {
		case raw := <-c.Send:
			var m map[string]any
			if err := json.Unmarshal(raw, &m); err != nil {
				t.Fatal(err)
			}
			if m["type"] == typ {
				return m
			}
		default:
			return nil
		}
	}
}

func TestReactDeliversToEveryoneInTheRoom(t *testing.T) {
	h := testHub()
	alice := join(t, h, "alice", "r1")
	bob := join(t, h, "bob", "r1")
	carol := join(t, h, "carol", "r1")

	if err := h.React(alice, "bob", "fire"); err != nil {
		t.Fatalf("React: %v", err)
	}
	for name, c := range map[string]*Client{"alice": alice, "bob": bob, "carol": carol} {
		m := drain(t, c, "reaction")
		if m == nil {
			t.Fatalf("%s got no reaction", name)
		}
		if m["from"] != "alice" || m["to"] != "bob" || m["emoji"] != "fire" || m["fromName"] != "User alice" {
			t.Errorf("%s got %v", name, m)
		}
	}
}

func TestReactRules(t *testing.T) {
	h := testHub()
	alice := join(t, h, "alice", "r1")
	join(t, h, "bob", "r1")
	join(t, h, "dave", "r2") // another room

	cases := []struct {
		name  string
		to    string
		emoji string
		want  error
	}{
		{"unknown emoji", "bob", "<script>", errBadReaction},
		{"self", "alice", "fire", errSelfReaction},
		{"not in this room", "dave", "fire", errNotHere},
		{"nobody", "ghost", "fire", errNotHere},
	}
	for _, c := range cases {
		if err := h.React(alice, c.to, c.emoji); err != c.want {
			t.Errorf("%s: got %v, want %v", c.name, err, c.want)
		}
	}

	lonely := NewClient("zed", "Zed", func() {})
	if err := h.React(lonely, "bob", "fire"); err != errNoRoom {
		t.Errorf("no room: got %v", err)
	}
}

func TestReactIsRateLimited(t *testing.T) {
	h := testHub()
	alice := join(t, h, "alice", "r1")
	join(t, h, "bob", "r1")

	if err := h.React(alice, "bob", "clap"); err != nil {
		t.Fatal(err)
	}
	if err := h.React(alice, "bob", "clap"); err != errTooFast {
		t.Fatalf("second react straight away: got %v, want errTooFast", err)
	}
	time.Sleep(reactInterval + 20*time.Millisecond)
	if err := h.React(alice, "bob", "clap"); err != nil {
		t.Fatalf("after the interval: %v", err)
	}
}
