// Command api runs the HTTP and WebSocket server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/study-online/backend/internal/auth"
	"github.com/study-online/backend/internal/config"
	"github.com/study-online/backend/internal/db"
	"github.com/study-online/backend/internal/server"
	"github.com/study-online/backend/internal/ws"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	verifier, err := auth.NewVerifier(ctx, cfg.NeonAuthURL)
	if err != nil {
		return err
	}

	tickets := ws.NewTicketStore()
	go tickets.Sweep(time.Minute, ctx.Done())

	handler, _ := server.New(server.Options{
		DB:           pool,
		Authenticate: verifier.RequireAuth,
		Tickets:      tickets,
		AppURL:       cfg.AppURL,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	slog.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
