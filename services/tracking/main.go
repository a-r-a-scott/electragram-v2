package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	dbpkg "github.com/a-r-a-scott/electragram-v2/services/tracking/internal/db"
	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/handler"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// ── Database ──────────────────────────────────────────────────────────────
	dbClient, err := dbpkg.New(mustEnv("DATABASE_URL"))
	if err != nil {
		log.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbClient.Close()

	// Add tracking columns to message_recipients if they don't exist yet.
	// Runs on every cold start; idempotent (ADD COLUMN IF NOT EXISTS).
	if err := dbClient.Migrate(context.Background()); err != nil {
		log.Error("migration failed", "error", err)
		os.Exit(1)
	}

	// ── Handler ───────────────────────────────────────────────────────────────
	secret := []byte(mustEnv("TRACKING_HMAC_SECRET"))
	baseURL := envOrDefault("BASE_URL", "https://electragram.io")

	h := handler.New(dbClient, secret, baseURL, log)

	lambda.Start(func(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
		return h.Handle(ctx, req)
	})
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Default().Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
