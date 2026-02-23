// Package handler implements the Lambda handler for Twilio webhook ingestion.
//
// Supported paths (all POST):
//
//	/hooks/twilio/{webhookToken}                  — inbound SMS or status callback
//	/hooks/twilio/whatsapp-senders/{webhookToken} — inbound WhatsApp or status callback
//
// Processing pipeline:
//  1. Extract the webhook token from the path's last segment.
//  2. Resolve the Twilio auth token for that webhook registration.
//  3. Validate the X-Twilio-Signature header (HMAC-SHA1).
//  4. Parse the URL-encoded form body into a WebhookEvent.
//  5. Route to the correct SQS queue (chat-inbound or delivery-status).
//  6. Return an empty TwiML <Response/> — Twilio requires a 200 within 15 s.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/aws/aws-lambda-go/events"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/parser"
	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/sqs"
	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/twilio"
)

const twiMLEmpty = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

// ErrUnknownToken is returned by TokenResolver when the webhook token is not
// registered in this deployment.
var ErrUnknownToken = errors.New("unknown webhook token")

// TokenResolver maps a webhook URL token to the corresponding Twilio auth token
// used for X-Twilio-Signature validation.
//
// In production this is typically backed by a static map populated from AWS
// Secrets Manager at cold start. In a multi-tenant deployment it would call
// the Identity Service to look up the account's auth token.
type TokenResolver interface {
	Resolve(ctx context.Context, webhookToken string) (authToken string, err error)
}

// MapTokenResolver resolves tokens from an in-memory map.
type MapTokenResolver struct {
	m map[string]string // webhookToken → twilioAuthToken
}

// NewMapTokenResolver creates a MapTokenResolver from the provided map.
func NewMapTokenResolver(m map[string]string) *MapTokenResolver {
	return &MapTokenResolver{m: m}
}

// Resolve returns the Twilio auth token for the given webhook token, or
// ErrUnknownToken if the token is not in the map.
func (r *MapTokenResolver) Resolve(_ context.Context, webhookToken string) (string, error) {
	if t, ok := r.m[webhookToken]; ok {
		return t, nil
	}
	return "", ErrUnknownToken
}

// Handler is the Lambda handler for all /hooks/* paths.
type Handler struct {
	resolver         TokenResolver
	baseURL          string // e.g. "https://api.electragram.io" — no trailing slash
	publisher        sqs.Publisher
	chatQueueURL     string
	deliveryQueueURL string
	log              *slog.Logger
}

// New creates a Handler.
func New(
	resolver TokenResolver,
	baseURL string,
	publisher sqs.Publisher,
	chatQueueURL string,
	deliveryQueueURL string,
	log *slog.Logger,
) *Handler {
	return &Handler{
		resolver:         resolver,
		baseURL:          strings.TrimRight(baseURL, "/"),
		publisher:        publisher,
		chatQueueURL:     chatQueueURL,
		deliveryQueueURL: deliveryQueueURL,
		log:              log,
	}
}

// Handle is the top-level Lambda entry point.
func (h *Handler) Handle(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// ── 1. Extract webhook token ──────────────────────────────────────────────
	webhookToken := lastPathSegment(req.Path)
	if webhookToken == "" {
		return forbidden("missing webhook token"), nil
	}

	// ── 2. Resolve Twilio auth token ──────────────────────────────────────────
	authToken, err := h.resolver.Resolve(ctx, webhookToken)
	if err != nil {
		h.log.Warn("unknown webhook token", "token", webhookToken, "path", req.Path)
		return forbidden("unknown webhook token"), nil
	}

	// ── 3. Parse POST params ──────────────────────────────────────────────────
	params, err := url.ParseQuery(req.Body)
	if err != nil {
		h.log.Warn("unparseable webhook body", "error", err)
		return badRequest("invalid request body"), nil
	}

	// ── 4. Validate X-Twilio-Signature ────────────────────────────────────────
	// API Gateway may lowercase header names; check both forms.
	sig := req.Headers["X-Twilio-Signature"]
	if sig == "" {
		sig = req.Headers["x-twilio-signature"]
	}

	fullURL := h.baseURL + req.Path
	if !twilio.Validate(authToken, fullURL, params, sig) {
		h.log.Warn("invalid Twilio signature",
			"path", req.Path,
			"url", fullURL,
		)
		return forbidden("invalid signature"), nil
	}

	// ── 5. Parse into WebhookEvent ────────────────────────────────────────────
	ev, err := parser.Parse(req.Body)
	if err != nil {
		h.log.Warn("webhook body parse failed", "error", err)
		return badRequest("unparseable webhook body"), nil
	}

	// ── 6. Route to SQS ───────────────────────────────────────────────────────
	if err := h.route(ctx, ev); err != nil {
		h.log.Error("webhook routing failed", "kind", ev.Kind, "error", err)
		return serverError(), nil
	}

	h.log.Info("webhook routed",
		"kind", ev.Kind,
		"from", ev.From,
		"messageSid", ev.MessageSID,
	)

	return twiMLResponse(), nil
}

// route serialises the event and publishes it to the appropriate SQS queue.
func (h *Handler) route(ctx context.Context, ev parser.WebhookEvent) error {
	msg := sqsMessage{
		Kind:          string(ev.Kind),
		AccountSID:    ev.AccountSID,
		MessageSID:    ev.MessageSID,
		From:          ev.From,
		To:            ev.To,
		Body:          ev.Body,
		MessageStatus: ev.MessageStatus,
		NumMedia:      ev.NumMedia,
	}
	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal sqs message: %w", err)
	}

	switch ev.Kind {
	case parser.KindInboundSMS, parser.KindInboundWhatsApp:
		return h.publisher.Publish(ctx, h.chatQueueURL, string(body))
	case parser.KindStatusCallback:
		return h.publisher.Publish(ctx, h.deliveryQueueURL, string(body))
	default:
		return fmt.Errorf("unroutable event kind: %q", ev.Kind)
	}
}

// sqsMessage is the canonical JSON structure written to all SQS queues.
type sqsMessage struct {
	Kind          string `json:"kind"`
	AccountSID    string `json:"accountSid"`
	MessageSID    string `json:"messageSid,omitempty"`
	From          string `json:"from,omitempty"`
	To            string `json:"to,omitempty"`
	Body          string `json:"body,omitempty"`
	MessageStatus string `json:"messageStatus,omitempty"`
	NumMedia      string `json:"numMedia,omitempty"`
}

// ── Response helpers ──────────────────────────────────────────────────────────

func twiMLResponse() events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "text/xml"},
		Body:       twiMLEmpty,
	}
}

func forbidden(msg string) events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{StatusCode: http.StatusForbidden, Body: msg}
}

func badRequest(msg string) events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: msg}
}

func serverError() events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: "internal error"}
}

// lastPathSegment returns the last non-empty segment of a slash-separated path.
// e.g. "/hooks/twilio/abc123" → "abc123"
func lastPathSegment(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] != "" {
			return parts[i]
		}
	}
	return ""
}
