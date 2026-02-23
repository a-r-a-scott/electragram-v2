// Package handler implements the Lambda handler for all tracking endpoints.
//
//   GET  /track/open/{token}.gif     — 1×1 transparent GIF; async record open
//   GET  /track/go/{token}           — 302 redirect; async record click
//   GET  /track/unsubscribe/{token}  — render confirmation page
//   POST /track/unsubscribe/{token}  — confirm and record unsubscribe
//
// Open and click writes are fire-and-forget goroutines so the Lambda response
// is returned immediately. Unsubscribe writes are synchronous (user is waiting
// for the confirmation page).
package handler

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/aws/aws-lambda-go/events"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/token"
)

// transparentGIF is the 1×1 transparent pixel returned for open tracking.
var transparentGIF, _ = base64.StdEncoding.DecodeString(
	"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
)

// DBWriter abstracts the tracking database writes so the handler can be tested
// without a real PostgreSQL connection.
type DBWriter interface {
	RecordOpen(ctx context.Context, recipientID, messageID string) error
	RecordClick(ctx context.Context, recipientID, messageID string) error
	RecordUnsubscribe(ctx context.Context, recipientID, messageID string) error
}

// Handler is the Lambda handler for all tracking endpoints.
type Handler struct {
	db        DBWriter
	secret    []byte
	baseURL   string // fallback redirect URL when a click token has no URL field
	log       *slog.Logger
	execAsync func(fn func()) // injectable — replaced with sync fn in unit tests
}

// New creates a Handler with real async goroutine dispatch.
func New(db DBWriter, secret []byte, baseURL string, log *slog.Logger) *Handler {
	return &Handler{
		db:        db,
		secret:    secret,
		baseURL:   baseURL,
		log:       log,
		execAsync: func(fn func()) { go fn() },
	}
}

// Handle is the top-level Lambda dispatch function.
func (h *Handler) Handle(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := req.Path
	method := req.HTTPMethod

	switch {
	case strings.HasPrefix(path, "/track/open/"):
		return h.handleOpen(path)

	case strings.HasPrefix(path, "/track/go/"):
		return h.handleClick(path)

	case strings.HasPrefix(path, "/track/unsubscribe/") && method == http.MethodPost:
		return h.handleUnsubscribeConfirm(ctx, path)

	case strings.HasPrefix(path, "/track/unsubscribe/"):
		return h.handleUnsubscribePage(path)

	default:
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound}, nil
	}
}

// handleOpen returns the tracking pixel immediately and records the event
// asynchronously so the email client receives a response in < 10ms.
func (h *Handler) handleOpen(path string) (events.APIGatewayProxyResponse, error) {
	raw := strings.TrimPrefix(path, "/track/open/")
	raw = strings.TrimSuffix(raw, ".gif") // strip optional file extension

	tok, err := token.Verify(raw, h.secret)
	if err != nil || tok.Kind != domain.KindOpen {
		h.log.Warn("invalid open token", "path", path)
		// Always return the pixel — never expose token errors to email clients.
		return pixelResponse(), nil
	}

	recipientID := tok.RecipientID
	messageID := tok.MessageID
	h.execAsync(func() {
		if err := h.db.RecordOpen(context.Background(), recipientID, messageID); err != nil {
			h.log.Error("record open failed", "recipientId", recipientID, "error", err)
		}
	})

	return pixelResponse(), nil
}

// handleClick issues the redirect immediately and records the click asynchronously.
func (h *Handler) handleClick(path string) (events.APIGatewayProxyResponse, error) {
	raw := strings.TrimPrefix(path, "/track/go/")

	tok, err := token.Verify(raw, h.secret)
	if err != nil || tok.Kind != domain.KindClick {
		h.log.Warn("invalid click token", "path", path)
		// Graceful degradation: redirect to base URL rather than returning an error.
		return redirectResponse(h.baseURL), nil
	}

	dest := tok.URL
	if dest == "" {
		dest = h.baseURL
	}

	recipientID := tok.RecipientID
	messageID := tok.MessageID
	h.execAsync(func() {
		if err := h.db.RecordClick(context.Background(), recipientID, messageID); err != nil {
			h.log.Error("record click failed", "recipientId", recipientID, "error", err)
		}
	})

	return redirectResponse(dest), nil
}

// handleUnsubscribePage renders a confirmation form (GET).
func (h *Handler) handleUnsubscribePage(path string) (events.APIGatewayProxyResponse, error) {
	raw := strings.TrimPrefix(path, "/track/unsubscribe/")

	if _, err := token.Verify(raw, h.secret); err != nil {
		return htmlResponse(http.StatusBadRequest, unsubscribeErrorPage()), nil
	}
	return htmlResponse(http.StatusOK, unsubscribeConfirmPage(raw)), nil
}

// handleUnsubscribeConfirm processes the POST and writes the unsubscribe record.
func (h *Handler) handleUnsubscribeConfirm(ctx context.Context, path string) (events.APIGatewayProxyResponse, error) {
	raw := strings.TrimPrefix(path, "/track/unsubscribe/")

	tok, err := token.Verify(raw, h.secret)
	if err != nil || tok.Kind != domain.KindUnsubscribe {
		return htmlResponse(http.StatusBadRequest, unsubscribeErrorPage()), nil
	}

	if err := h.db.RecordUnsubscribe(ctx, tok.RecipientID, tok.MessageID); err != nil {
		h.log.Error("record unsubscribe failed",
			"recipientId", tok.RecipientID,
			"error", err,
		)
		return htmlResponse(http.StatusInternalServerError, unsubscribeErrorPage()), nil
	}

	return htmlResponse(http.StatusOK, unsubscribeDonePage()), nil
}

// ── Response helpers ──────────────────────────────────────────────────────────

func pixelResponse() events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":  "image/gif",
			"Cache-Control": "no-cache, no-store, must-revalidate",
			"Pragma":        "no-cache",
		},
		Body:            base64.StdEncoding.EncodeToString(transparentGIF),
		IsBase64Encoded: true,
	}
}

func redirectResponse(url string) events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusFound,
		Headers:    map[string]string{"Location": url},
	}
}

func htmlResponse(status int, body string) events.APIGatewayProxyResponse {
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Headers:    map[string]string{"Content-Type": "text/html; charset=utf-8"},
		Body:       body,
	}
}

// ── HTML pages ────────────────────────────────────────────────────────────────

func unsubscribeConfirmPage(rawToken string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribe</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; }
    h1   { font-size: 1.5rem; margin-bottom: .75rem; }
    p    { color: #555; margin-bottom: 1.5rem; }
    button {
      background: #111; color: #fff; border: none;
      padding: .75rem 2rem; border-radius: .5rem;
      cursor: pointer; font-size: 1rem;
    }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <h1>Unsubscribe</h1>
  <p>Click below to confirm you no longer wish to receive these emails.</p>
  <form method="POST" action="/track/unsubscribe/%s">
    <button type="submit">Confirm unsubscribe</button>
  </form>
</body>
</html>`, rawToken)
}

func unsubscribeDonePage() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; }
    h1   { font-size: 1.5rem; margin-bottom: .75rem; }
    p    { color: #555; }
  </style>
</head>
<body>
  <h1>You've been unsubscribed</h1>
  <p>You will no longer receive these emails.</p>
</body>
</html>`
}

func unsubscribeErrorPage() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link expired</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; }
    h1   { font-size: 1.5rem; margin-bottom: .75rem; }
    p    { color: #555; }
  </style>
</head>
<body>
  <h1>Link expired</h1>
  <p>This unsubscribe link is invalid or has expired. Please contact support if you need assistance.</p>
</body>
</html>`
}
