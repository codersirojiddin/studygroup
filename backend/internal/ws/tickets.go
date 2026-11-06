// Package ws authenticates and serves WebSocket connections.
//
// Browsers cannot set an Authorization header on a WebSocket handshake, and
// putting a JWT in the URL would leak it into logs. Instead the client calls
// an authenticated endpoint to get a short-lived, single-use ticket, then
// connects with ?ticket=<value>.
package ws

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"sync"
	"time"
)

const TicketTTL = 30 * time.Second

type ticket struct {
	authUserID string
	expires    time.Time
}

// TicketStore keeps tickets in memory. It works for a single API instance;
// run several instances behind a load balancer only with sticky routing or a
// shared store.
type TicketStore struct {
	mu      sync.Mutex
	tickets map[[32]byte]ticket // keyed by SHA-256 of the ticket value
}

func NewTicketStore() *TicketStore {
	return &TicketStore{tickets: make(map[[32]byte]ticket)}
}

// Issue creates a ticket bound to the authenticated user.
func (s *TicketStore) Issue(authUserID string) (string, time.Time) {
	buf := make([]byte, 32)
	rand.Read(buf) // never returns an error on supported platforms
	value := base64.RawURLEncoding.EncodeToString(buf)
	expires := time.Now().Add(TicketTTL)

	s.mu.Lock()
	s.tickets[sha256.Sum256([]byte(value))] = ticket{authUserID: authUserID, expires: expires}
	s.mu.Unlock()
	return value, expires
}

// Redeem consumes a ticket and returns its user. A ticket works at most once.
func (s *TicketStore) Redeem(value string) (string, bool) {
	key := sha256.Sum256([]byte(value))
	s.mu.Lock()
	t, ok := s.tickets[key]
	delete(s.tickets, key)
	s.mu.Unlock()
	if !ok || time.Now().After(t.expires) {
		return "", false
	}
	return t.authUserID, true
}

// Sweep removes expired tickets every interval until stop is closed.
func (s *TicketStore) Sweep(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case now := <-t.C:
			s.mu.Lock()
			for k, v := range s.tickets {
				if now.After(v.expires) {
					delete(s.tickets, k)
				}
			}
			s.mu.Unlock()
		}
	}
}
