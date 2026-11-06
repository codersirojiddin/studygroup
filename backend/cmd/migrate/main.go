// Command migrate applies or reverts SQL migrations over Neon's direct
// (non-pooled) connection, DIRECT_URL. Advisory locks and DDL need a real
// session, which the pooled endpoint does not guarantee.
//
//	go run ./cmd/migrate up          apply all pending migrations
//	go run ./cmd/migrate down        revert the latest migration
//	go run ./cmd/migrate status      list applied and pending migrations
package main

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/study-online/backend/internal/config"
	"github.com/study-online/backend/migrations"
)

// lockID is an arbitrary constant so concurrent runs serialize.
const lockID = 7261584031

type migration struct {
	version string // e.g. "0001_init"
	up      string
	down    string
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate up|down|status")
		os.Exit(2)
	}
	if err := run(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
}

func run(cmd string) error {
	config.LoadDotEnv(".env")
	dsn := os.Getenv("DIRECT_URL")
	if dsn == "" {
		return fmt.Errorf("DIRECT_URL is not set")
	}
	if err := config.RequireSSL("DIRECT_URL", dsn); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lockID); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, lockID)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    text PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}

	all, err := load()
	if err != nil {
		return err
	}
	applied, err := appliedVersions(ctx, conn)
	if err != nil {
		return err
	}

	switch cmd {
	case "up":
		n := 0
		for _, m := range all {
			if applied[m.version] {
				continue
			}
			if err := apply(ctx, conn, m.version, m.up, true); err != nil {
				return err
			}
			fmt.Println("applied", m.version)
			n++
		}
		if n == 0 {
			fmt.Println("no pending migrations")
		}
	case "down":
		for i := len(all) - 1; i >= 0; i-- {
			if m := all[i]; applied[m.version] {
				if m.down == "" {
					return fmt.Errorf("%s has no down migration", m.version)
				}
				if err := apply(ctx, conn, m.version, m.down, false); err != nil {
					return err
				}
				fmt.Println("reverted", m.version)
				return nil
			}
		}
		fmt.Println("nothing to revert")
	case "status":
		for _, m := range all {
			state := "pending"
			if applied[m.version] {
				state = "applied"
			}
			fmt.Printf("%-8s %s\n", state, m.version)
		}
	default:
		return fmt.Errorf("unknown command %q", cmd)
	}
	return nil
}

// apply runs one migration and records it in the same transaction.
func apply(ctx context.Context, conn *pgx.Conn, version, sql string, up bool) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, sql); err != nil {
		return fmt.Errorf("%s: %w", version, err)
	}
	record := `INSERT INTO schema_migrations (version) VALUES ($1)`
	if !up {
		record = `DELETE FROM schema_migrations WHERE version = $1`
	}
	if _, err := tx.Exec(ctx, record, version); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func appliedVersions(ctx context.Context, conn *pgx.Conn) (map[string]bool, error) {
	rows, err := conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	versions, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(versions))
	for _, v := range versions {
		out[v] = true
	}
	return out, nil
}

// load reads NNNN_name.up.sql / NNNN_name.down.sql pairs, sorted by version.
func load() ([]migration, error) {
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		return nil, err
	}
	byVersion := map[string]*migration{}
	for _, e := range entries {
		name := e.Name()
		var version, dir string
		switch {
		case strings.HasSuffix(name, ".up.sql"):
			version, dir = strings.TrimSuffix(name, ".up.sql"), "up"
		case strings.HasSuffix(name, ".down.sql"):
			version, dir = strings.TrimSuffix(name, ".down.sql"), "down"
		default:
			continue
		}
		body, err := fs.ReadFile(migrations.FS, name)
		if err != nil {
			return nil, err
		}
		m := byVersion[version]
		if m == nil {
			m = &migration{version: version}
			byVersion[version] = m
		}
		if dir == "up" {
			m.up = string(body)
		} else {
			m.down = string(body)
		}
	}

	out := make([]migration, 0, len(byVersion))
	for _, m := range byVersion {
		if m.up == "" {
			return nil, fmt.Errorf("%s has no up migration", m.version)
		}
		out = append(out, *m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}
