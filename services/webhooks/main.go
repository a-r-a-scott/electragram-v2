package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/handler"
	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/sqs"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// ── SQS publisher (stdlib Sig V4, no external SDK) ────────────────────────
	publisher := sqs.New(envOrDefault("AWS_REGION", "us-east-1"))

	// ── Token resolver ────────────────────────────────────────────────────────
	// Single-tenant mode: one webhook token → one Twilio auth token.
	// For multi-tenant deployments, replace with a resolver that reads a map
	// from Secrets Manager or calls the Identity Service.
	resolver := handler.NewMapTokenResolver(map[string]string{
		mustEnv("TWILIO_WEBHOOK_TOKEN"): mustEnv("TWILIO_AUTH_TOKEN"),
	})

	// ── Handler ───────────────────────────────────────────────────────────────
	h := handler.New(
		resolver,
		mustEnv("TWILIO_WEBHOOK_BASE_URL"),
		publisher,
		mustEnv("CHAT_INBOUND_QUEUE_URL"),
		mustEnv("DELIVERY_STATUS_QUEUE_URL"),
		log,
	)

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
