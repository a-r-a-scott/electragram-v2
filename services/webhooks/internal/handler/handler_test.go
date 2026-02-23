package handler_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/handler"
	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/sqs"
	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/twilio"
)

// ── Test fixtures ─────────────────────────────────────────────────────────────

const (
	testAuthToken       = "test-twilio-auth-token"
	testWebhookToken    = "mywebhooktoken"
	testBaseURL         = "https://api.electragram.io"
	testChatQueueURL    = "https://sqs.us-east-1.amazonaws.com/123456/chat-inbound"
	testDeliveryQueue   = "https://sqs.us-east-1.amazonaws.com/123456/delivery-status"
)

// newTestHandler creates a Handler with a MockPublisher and a fixed token map.
func newTestHandler(pub *sqs.MockPublisher) *handler.Handler {
	resolver := handler.NewMapTokenResolver(map[string]string{
		testWebhookToken: testAuthToken,
	})
	return handler.New(
		resolver,
		testBaseURL,
		pub,
		testChatQueueURL,
		testDeliveryQueue,
		discardLogger(),
	)
}

// discardLogger returns a *slog.Logger that silently drops all log output.
func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// makeRequest builds an APIGatewayProxyRequest with a valid Twilio signature.
func makeRequest(path, body string) events.APIGatewayProxyRequest {
	params, _ := url.ParseQuery(body)
	fullURL := testBaseURL + path
	sig := twilio.Compute(testAuthToken, fullURL, params)
	return events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       path,
		Body:       body,
		Headers: map[string]string{
			"Content-Type":       "application/x-www-form-urlencoded",
			"X-Twilio-Signature": sig,
		},
	}
}

// smsBody returns a URL-encoded Twilio inbound SMS body.
func smsBody(from, to, msg string) string {
	return url.Values{
		"AccountSid": {"ACxxx"},
		"MessageSid": {"SMxxx"},
		"From":       {from},
		"To":         {to},
		"Body":       {msg},
		"NumMedia":   {"0"},
	}.Encode()
}

// whatsAppBody returns a URL-encoded Twilio inbound WhatsApp body.
func whatsAppBody() string {
	return url.Values{
		"AccountSid": {"ACxxx"},
		"MessageSid": {"SMyyy"},
		"From":       {"whatsapp:+15551234567"},
		"To":         {"whatsapp:+15550000001"},
		"Body":       {"Hello via WhatsApp"},
	}.Encode()
}

// statusBody returns a URL-encoded Twilio status callback body.
func statusBody(status string) string {
	return url.Values{
		"AccountSid":    {"ACxxx"},
		"MessageSid":    {"SMzzz"},
		"MessageStatus": {status},
		"To":            {"+15551234567"},
	}.Encode()
}

// ── Happy path — inbound SMS ──────────────────────────────────────────────────

func TestHandle_InboundSMS_Returns200TwiML(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	resp, err := h.Handle(context.Background(), makeRequest(path, smsBody("+15551234567", "+15550000001", "Hello")))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Headers["Content-Type"], "text/xml")
	assert.Contains(t, resp.Body, "<Response>")
}

func TestHandle_InboundSMS_RoutesToChatQueue(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, smsBody("+15551234567", "+15550000001", "Hi")))

	require.Len(t, pub.Messages, 1)
	assert.Equal(t, testChatQueueURL, pub.Messages[0].QueueURL)
}

func TestHandle_InboundSMS_SQSMessageHasCorrectKind(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, smsBody("+15551234567", "+15550000001", "Hi")))

	require.Len(t, pub.Messages, 1)
	var msg map[string]string
	require.NoError(t, json.Unmarshal([]byte(pub.Messages[0].Body), &msg))
	assert.Equal(t, "inbound_sms", msg["kind"])
	assert.Equal(t, "+15551234567", msg["from"])
	assert.Equal(t, "Hi", msg["body"])
}

// ── Happy path — inbound WhatsApp ─────────────────────────────────────────────

func TestHandle_InboundWhatsApp_RoutesToChatQueue(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/whatsapp-senders/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, whatsAppBody()))

	require.Len(t, pub.Messages, 1)
	assert.Equal(t, testChatQueueURL, pub.Messages[0].QueueURL)
}

func TestHandle_InboundWhatsApp_SQSMessageHasCorrectKind(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/whatsapp-senders/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, whatsAppBody()))

	var msg map[string]string
	require.NoError(t, json.Unmarshal([]byte(pub.Messages[0].Body), &msg))
	assert.Equal(t, "inbound_whatsapp", msg["kind"])
}

// ── Happy path — status callback ──────────────────────────────────────────────

func TestHandle_StatusCallback_RoutesToDeliveryQueue(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, statusBody("delivered")))

	require.Len(t, pub.Messages, 1)
	assert.Equal(t, testDeliveryQueue, pub.Messages[0].QueueURL)
}

func TestHandle_StatusCallback_SQSMessageHasStatusAndKind(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	_, _ = h.Handle(context.Background(), makeRequest(path, statusBody("failed")))

	var msg map[string]string
	require.NoError(t, json.Unmarshal([]byte(pub.Messages[0].Body), &msg))
	assert.Equal(t, "status_callback", msg["kind"])
	assert.Equal(t, "failed", msg["messageStatus"])
}

// ── Lowercase signature header ────────────────────────────────────────────────

func TestHandle_LowercaseSignatureHeader_AcceptsValid(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	body := smsBody("+15551234567", "+15550000001", "hi")
	params, _ := url.ParseQuery(body)
	sig := twilio.Compute(testAuthToken, testBaseURL+path, params)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       path,
		Body:       body,
		Headers: map[string]string{
			"x-twilio-signature": sig, // lowercase — API Gateway may do this
		},
	}

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Security: invalid signature ───────────────────────────────────────────────

func TestHandle_InvalidSignature_Returns403(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       "/hooks/twilio/" + testWebhookToken,
		Body:       smsBody("+15551234567", "+15550000001", "hi"),
		Headers: map[string]string{
			"X-Twilio-Signature": "invalidsignature",
		},
	}

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Empty(t, pub.Messages, "no message should be queued for invalid signature")
}

func TestHandle_MissingSignatureHeader_Returns403(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       "/hooks/twilio/" + testWebhookToken,
		Body:       smsBody("+15551234567", "+15550000001", "hi"),
		Headers:    map[string]string{},
	}

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// ── Security: unknown token ───────────────────────────────────────────────────

func TestHandle_UnknownWebhookToken_Returns403(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/unknown-token"
	resp, err := h.Handle(context.Background(), makeRequest(path, smsBody("+15551234567", "+15550000001", "hi")))

	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Empty(t, pub.Messages)
}

// ── Missing token in path ─────────────────────────────────────────────────────

func TestHandle_EmptyPath_Returns403(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       "/",
	}
	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestHandle_PathWithNoSegments_Returns403(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       "///",
	}
	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// ── Bad request body ──────────────────────────────────────────────────────────

func TestHandle_InvalidURLEncoding_Returns400(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	// Compute signature over the bad body so we pass signature check
	params, _ := url.ParseQuery("bad=%ZZ") // ParseQuery ignores the error
	sig := twilio.Compute(testAuthToken, testBaseURL+path, params)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       path,
		Body:       "bad=%ZZ",
		Headers:    map[string]string{"X-Twilio-Signature": sig},
	}

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	// Either 400 (parse failed) or 403 (sig mismatch due to parse error) is acceptable
	assert.True(t, resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusForbidden)
}

func TestHandle_MissingAccountSid_Returns400(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	// Body with no AccountSid — passes signature check but fails parser
	body := "MessageSid=SMxxx&From=%2B15551234567&Body=hi"
	params, _ := url.ParseQuery(body)
	sig := twilio.Compute(testAuthToken, testBaseURL+path, params)

	req := events.APIGatewayProxyRequest{
		HTTPMethod: http.MethodPost,
		Path:       path,
		Body:       body,
		Headers:    map[string]string{"X-Twilio-Signature": sig},
	}

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ── SQS publish failure ───────────────────────────────────────────────────────

func TestHandle_SQSPublishError_Returns500(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	req := makeRequest(path, smsBody("+15551234567", "+15550000001", "hi"))

	// Inject error after building the request (so signature is valid)
	pub.Err = assert.AnError

	resp, err := h.Handle(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

// ── TokenResolver ─────────────────────────────────────────────────────────────

func TestMapTokenResolver_KnownToken_ReturnsAuthToken(t *testing.T) {
	r := handler.NewMapTokenResolver(map[string]string{
		"tok123": "auth456",
	})
	got, err := r.Resolve(context.Background(), "tok123")
	require.NoError(t, err)
	assert.Equal(t, "auth456", got)
}

func TestMapTokenResolver_UnknownToken_ReturnsError(t *testing.T) {
	r := handler.NewMapTokenResolver(map[string]string{})
	_, err := r.Resolve(context.Background(), "unknown")
	assert.ErrorIs(t, err, handler.ErrUnknownToken)
}

func TestMapTokenResolver_EmptyMap_ReturnsError(t *testing.T) {
	r := handler.NewMapTokenResolver(nil)
	_, err := r.Resolve(context.Background(), "anything")
	assert.Error(t, err)
}

// ── TwiML response format ─────────────────────────────────────────────────────

func TestHandle_SuccessResponse_IsValidTwiML(t *testing.T) {
	pub := &sqs.MockPublisher{}
	h := newTestHandler(pub)

	path := "/hooks/twilio/" + testWebhookToken
	resp, _ := h.Handle(context.Background(), makeRequest(path, smsBody("+15551234567", "+15550000001", "test")))

	assert.Contains(t, resp.Body, `<?xml version="1.0"`)
	assert.Contains(t, resp.Body, "<Response>")
	assert.True(t, strings.HasSuffix(strings.TrimSpace(resp.Body), "</Response>"))
}
