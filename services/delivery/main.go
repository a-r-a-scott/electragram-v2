package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	dbpkg "github.com/a-r-a-scott/electragram-v2/services/delivery/internal/db"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/provider"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/worker"
)

// dbAdapter bridges *dbpkg.Client to the worker.DBWriter interface.
type dbAdapter struct{ client *dbpkg.Client }

func (a *dbAdapter) UpdateRecipient(ctx context.Context, recipientID, status, externalID, failureReason string) error {
	return a.client.UpdateRecipient(ctx, dbpkg.RecipientUpdate{
		RecipientID:   recipientID,
		Status:        status,
		ExternalID:    externalID,
		FailureReason: failureReason,
	})
}

func (a *dbAdapter) UpdateDispatchJob(ctx context.Context, recipientID, status string, attempts int) error {
	return a.client.UpdateDispatchJob(ctx, recipientID, status, attempts)
}

func (a *dbAdapter) IncrMessageCounter(ctx context.Context, messageID, column string, delta int) error {
	return a.client.IncrMessageCounter(ctx, messageID, column, delta)
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// ── Database ──────────────────────────────────────────────────────────────
	dsn := mustEnv("DATABASE_URL")
	dbClient, err := dbpkg.New(dsn)
	if err != nil {
		log.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbClient.Close()

	// ── Providers ─────────────────────────────────────────────────────────────
	emailProvider := provider.NewSendGridProvider(
		mustEnv("SENDGRID_API_KEY"),
		envOrDefault("FROM_EMAIL", "noreply@electragram.io"),
		envOrDefault("FROM_NAME", "Electragram"),
	)

	smsProvider := provider.NewTwilioSMSProvider(
		mustEnv("TWILIO_ACCOUNT_SID"),
		mustEnv("TWILIO_AUTH_TOKEN"),
		mustEnv("TWILIO_FROM_NUMBER"),
	)

	waProvider := provider.NewTwilioWhatsAppProvider(
		mustEnv("TWILIO_ACCOUNT_SID"),
		mustEnv("TWILIO_AUTH_TOKEN"),
		envOrDefault("TWILIO_WHATSAPP_FROM", os.Getenv("TWILIO_FROM_NUMBER")),
	)

	registry := provider.NewRegistry(map[string]provider.Provider{
		"email":    emailProvider,
		"sms":      smsProvider,
		"whatsapp": waProvider,
	})

	// ── DB writer adapter ─────────────────────────────────────────────────────
	dbWriter := &dbAdapter{client: dbClient}

	w := worker.New(registry, dbWriter, log)

	lambda.Start(func(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
		return w.ProcessBatch(ctx, event)
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
