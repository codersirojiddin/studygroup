// Package rooms manages study rooms and their memberships.
package rooms

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound         = errors.New("room not found")
	ErrNotMember        = errors.New("not a member of this room")
	ErrFull             = errors.New("room is full")
	ErrBadInviteCode    = errors.New("invalid invite code")
	ErrOwnerCannotLeave = errors.New("the owner cannot leave; delete the room instead")
	ErrMaxBelowMembers  = errors.New("max members is below the current member count")
)

type Room struct {
	ID          string    `json:"id"`
	OwnerID     string    `json:"ownerId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Visibility  string    `json:"visibility"`
	MaxMembers  int       `json:"maxMembers"`
	MemberCount int       `json:"memberCount"`
	MyRole      string    `json:"myRole,omitempty"`     // empty when the caller is not a member
	InviteCode  string    `json:"inviteCode,omitempty"` // only shown to owners and moderators
	CreatedAt   time.Time `json:"createdAt"`
}

type Member struct {
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joinedAt"`
}

// Settings are the user-editable room fields.
type Settings struct {
	Name        string
	Description string
	Visibility  string
	MaxMembers  int
}

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// roomSelect returns rooms with the member count and the role of user $1.
const roomSelect = `
	SELECT r.id::text, r.owner_id::text, r.name, r.description, r.visibility, r.max_members,
	       (SELECT count(*) FROM room_members m WHERE m.room_id = r.id)::int,
	       coalesce(me.role, ''), r.invite_code, r.created_at
	FROM rooms r
	LEFT JOIN room_members me ON me.room_id = r.id AND me.user_id = $1`

func scanRoom(row pgx.Row) (*Room, error) {
	r := &Room{}
	err := row.Scan(&r.ID, &r.OwnerID, &r.Name, &r.Description, &r.Visibility, &r.MaxMembers,
		&r.MemberCount, &r.MyRole, &r.InviteCode, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	if !CanEdit(r.MyRole) {
		r.InviteCode = ""
	}
	return r, nil
}

func collectRooms(rows pgx.Rows) ([]Room, error) {
	defer rows.Close()
	out := []Room{}
	for rows.Next() {
		r, err := scanRoom(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// Create makes a room owned by ownerID and adds the owner as a member.
func (s *Store) Create(ctx context.Context, ownerID string, in Settings) (*Room, error) {
	var room *Room
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO rooms (owner_id, name, description, visibility, max_members)
			VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
			ownerID, in.Name, in.Description, in.Visibility, in.MaxMembers).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`,
			id, ownerID); err != nil {
			return err
		}
		var err error
		room, err = scanRoom(tx.QueryRow(ctx, roomSelect+` WHERE r.id = $2`, ownerID, id))
		return err
	})
	return room, err
}

// ListMine returns rooms the user belongs to, most recently joined first.
func (s *Store) ListMine(ctx context.Context, userID string) ([]Room, error) {
	rows, err := s.db.Query(ctx, roomSelect+` WHERE me.user_id IS NOT NULL ORDER BY me.joined_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	return collectRooms(rows)
}

// ListPublic returns public rooms the user has not joined, newest first.
func (s *Store) ListPublic(ctx context.Context, userID string, limit int) ([]Room, error) {
	rows, err := s.db.Query(ctx, roomSelect+`
		WHERE r.visibility = 'public' AND me.user_id IS NULL
		ORDER BY r.created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	return collectRooms(rows)
}

// Get returns a room visible to the user: any room they belong to, or a public room.
// Private rooms the user is not in are reported as not found.
func (s *Store) Get(ctx context.Context, roomID, userID string) (*Room, error) {
	r, err := scanRoom(s.db.QueryRow(ctx, roomSelect+` WHERE r.id = $2`, userID, roomID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if r.MyRole == "" && r.Visibility != "public" {
		return nil, ErrNotFound
	}
	return r, nil
}

// Role returns the user's role in the room, or ErrNotMember.
func (s *Store) Role(ctx context.Context, roomID, userID string) (string, error) {
	var role string
	err := s.db.QueryRow(ctx, `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
		roomID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotMember
	}
	return role, err
}

// Members lists the room's members, owner first, then moderators, then by join time.
func (s *Store) Members(ctx context.Context, roomID string) ([]Member, error) {
	rows, err := s.db.Query(ctx, `
		SELECT u.id::text, u.display_name, m.role, m.joined_at
		FROM room_members m JOIN users u ON u.id = m.user_id
		WHERE m.room_id = $1
		ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, m.joined_at`, roomID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Member, error) {
		var m Member
		err := row.Scan(&m.UserID, &m.DisplayName, &m.Role, &m.JoinedAt)
		return m, err
	})
}

// Update changes room settings. The new max may not drop below the current member count.
func (s *Store) Update(ctx context.Context, roomID, userID string, in Settings) (*Room, error) {
	var room *Room
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var count int
		if err := tx.QueryRow(ctx, `
			SELECT (SELECT count(*) FROM room_members WHERE room_id = r.id)::int
			FROM rooms r WHERE r.id = $1 FOR UPDATE`, roomID).Scan(&count); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if in.MaxMembers < count {
			return ErrMaxBelowMembers
		}
		if _, err := tx.Exec(ctx, `
			UPDATE rooms SET name = $2, description = $3, visibility = $4, max_members = $5, updated_at = now()
			WHERE id = $1`, roomID, in.Name, in.Description, in.Visibility, in.MaxMembers); err != nil {
			return err
		}
		var err error
		room, err = scanRoom(tx.QueryRow(ctx, roomSelect+` WHERE r.id = $2`, userID, roomID))
		return err
	})
	return room, err
}

// RegenerateInviteCode replaces the room's invite code, invalidating the old one.
func (s *Store) RegenerateInviteCode(ctx context.Context, roomID string) (string, error) {
	var code string
	err := s.db.QueryRow(ctx, `
		UPDATE rooms SET invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), updated_at = now()
		WHERE id = $1 RETURNING invite_code`, roomID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return code, err
}

// Delete removes the room; memberships cascade and sessions keep their history with room_id NULL.
func (s *Store) Delete(ctx context.Context, roomID string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM rooms WHERE id = $1`, roomID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// Join adds the user to the room. Public rooms need no code; private rooms
// need the current invite code. Joining twice is a no-op.
func (s *Store) Join(ctx context.Context, roomID, userID, code string) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var visibility, inviteCode string
		var maxMembers int
		// Lock the room row so concurrent joins can't exceed max_members.
		err := tx.QueryRow(ctx, `SELECT visibility, invite_code, max_members FROM rooms WHERE id = $1 FOR UPDATE`,
			roomID).Scan(&visibility, &inviteCode, &maxMembers)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		var already bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)`,
			roomID, userID).Scan(&already); err != nil || already {
			return err
		}
		if visibility != "public" && code != inviteCode {
			// Don't reveal that a private room exists to someone without the code.
			if code == "" {
				return ErrNotFound
			}
			return ErrBadInviteCode
		}

		var count int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM room_members WHERE room_id = $1`, roomID).Scan(&count); err != nil {
			return err
		}
		if count >= maxMembers {
			return ErrFull
		}
		_, err = tx.Exec(ctx, `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'member')`, roomID, userID)
		return err
	})
}

// RoomIDByInviteCode resolves an invite code to its room.
func (s *Store) RoomIDByInviteCode(ctx context.Context, code string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id::text FROM rooms WHERE invite_code = $1`, code).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBadInviteCode
	}
	return id, err
}

// RemoveMember deletes a membership (used for both leaving and kicking).
// Active study sessions in the room are ended so stats stay accurate.
func (s *Store) RemoveMember(ctx context.Context, roomID, userID string) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, roomID, userID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotMember
		}
		_, err = tx.Exec(ctx, `
			UPDATE study_sessions SET ended_at = now()
			WHERE user_id = $1 AND room_id = $2 AND ended_at IS NULL`, userID, roomID)
		return err
	})
}

// SetRole changes a member's role.
func (s *Store) SetRole(ctx context.Context, roomID, userID, role string) error {
	tag, err := s.db.Exec(ctx, `UPDATE room_members SET role = $3 WHERE room_id = $1 AND user_id = $2`,
		roomID, userID, role)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotMember
	}
	return err
}
