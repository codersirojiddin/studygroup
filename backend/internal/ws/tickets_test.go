package ws

import (
	"testing"
	"time"
)

func TestTicketSingleUse(t *testing.T) {
	s := NewTicketStore()
	tk, _ := s.Issue("user-1")

	if u, ok := s.Redeem(tk); !ok || u != "user-1" {
		t.Fatalf("first redeem = %q, %v", u, ok)
	}
	if _, ok := s.Redeem(tk); ok {
		t.Fatal("ticket redeemed twice")
	}
	if _, ok := s.Redeem("bogus"); ok {
		t.Fatal("unknown ticket accepted")
	}
}

func TestTicketExpiry(t *testing.T) {
	s := NewTicketStore()
	tk, _ := s.Issue("user-1")
	for k, v := range s.tickets {
		v.expires = time.Now().Add(-time.Second)
		s.tickets[k] = v
	}
	if _, ok := s.Redeem(tk); ok {
		t.Fatal("expired ticket accepted")
	}
}
