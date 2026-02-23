// White-box tests for the tracking handler.
// Package handler (not handler_test) grants access to the unexported execAsync
// field, which is replaced with a synchronous executor to prevent test races.
package handler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/token"
)

// ── Test doubles ──────────────────────────────────────────────────────────────

type mockDB struct {
	mu         sync.Mutex
	openCalls  [][]string // [[recipientID, messageID], ...]
	clickCalls [][]string
	unsubCalls [][]string
	openErr    error
	clickErr   error
	unsubErr   error
}

func (m *mockDB) RecordOpen(_ context.Context, recipientID, messageID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.openCalls = append(m.openCalls, []string{recipientID, messageID})
	return m.openErr
}

func (m *mockDB) RecordClick(_ context.Context, recipientID, messageID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clickCalls = append(m.clickCalls, []string{recipientID, messageID})
	return m.clickErr
}

func (m *mockDB) RecordUnsubscribe(_ context.Context, recipientID, messageID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.unsubCalls = append(m.unsubCalls, []string{recipientID, messageID})
	return m.unsubErr
}

// ── Helpers ───────────────────────────────────────────────────────────────────

var (
	testSecret  = []byte("test-handler-secret")
	testBaseURL = "https://electragram.io"
)

// discardLogger returns a slog.Logger that throws away all output.
func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// newTestHandler creates a Handler with a synchronous execAsync so DB writes
// complete before the handler returns, making assertions race-free.
func newTestHandler(db *mockDB) *Handler {
	h := New(db, testSecret, testBaseURL, discardLogger())
	h.execAsync = func(fn func()) { fn() }
	return h
}

func makeRequest(method, path string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{HTTPMethod: method, Path: path}
}

// signToken signs a TrackingToken with testSecret and fails the test on error.
func signToken(t *testing.T, tok domain.TrackingToken) string {
	t.Helper()
	signed, err := token.Sign(tok, testSecret)
	require.NoError(t, err)
	return signed
}

// ── Open pixel ────────────────────────────────────────────────────────────────

func TestHandleOpen_ValidToken_Returns200GIF(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_001", MessageID: "msg_001", Kind: domain.KindOpen})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "image/gif", resp.Headers["Content-Type"])
	assert.True(t, resp.IsBase64Encoded)
	assert.NotEmpty(t, resp.Body)
}

func TestHandleOpen_ValidToken_RecordsOpenInDB(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_001", MessageID: "msg_001", Kind: domain.KindOpen})
	_, _ = h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed))

	require.Len(t, db.openCalls, 1)
	assert.Equal(t, "rcp_001", db.openCalls[0][0])
	assert.Equal(t, "msg_001", db.openCalls[0][1])
}

func TestHandleOpen_WithGifExtension_StillRecordsOpen(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	// Email clients often append .gif to image URLs
	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_002", MessageID: "msg_002", Kind: domain.KindOpen})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed+".gif"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "image/gif", resp.Headers["Content-Type"])
	require.Len(t, db.openCalls, 1, "DB should be called even with .gif suffix")
}

func TestHandleOpen_InvalidToken_StillReturnsPixel(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/open/invalid-token"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "image/gif", resp.Headers["Content-Type"])
	assert.Empty(t, db.openCalls, "invalid token must not trigger DB write")
}

func TestHandleOpen_WrongKind_StillReturnsPixelNoDBWrite(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	// Click token presented to open endpoint
	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_003", MessageID: "msg_003", Kind: domain.KindClick})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Empty(t, db.openCalls)
}

func TestHandleOpen_DBError_Does_Not_Change_Response(t *testing.T) {
	db := &mockDB{openErr: errors.New("db connection lost")}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_004", MessageID: "msg_004", Kind: domain.KindOpen})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestHandleOpen_NoCacheHeaders_Set(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_005", MessageID: "msg_005", Kind: domain.KindOpen})
	resp, _ := h.Handle(context.Background(), makeRequest("GET", "/track/open/"+signed))

	assert.Contains(t, resp.Headers["Cache-Control"], "no-cache")
}

// ── Click redirect ────────────────────────────────────────────────────────────

func TestHandleClick_ValidToken_RedirectsToDestination(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	dest := "https://example.com/landing?ref=email"
	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_010", MessageID: "msg_010", Kind: domain.KindClick, URL: dest})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/go/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, dest, resp.Headers["Location"])
}

func TestHandleClick_ValidToken_RecordsClickInDB(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_011", MessageID: "msg_011", Kind: domain.KindClick, URL: "https://example.com"})
	_, _ = h.Handle(context.Background(), makeRequest("GET", "/track/go/"+signed))

	require.Len(t, db.clickCalls, 1)
	assert.Equal(t, "rcp_011", db.clickCalls[0][0])
	assert.Equal(t, "msg_011", db.clickCalls[0][1])
}

func TestHandleClick_ValidToken_NoURL_UsesBaseURL(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_012", MessageID: "msg_012", Kind: domain.KindClick})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/go/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, testBaseURL, resp.Headers["Location"])
}

func TestHandleClick_InvalidToken_RedirectsToBaseURL(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/go/not-a-valid-token"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, testBaseURL, resp.Headers["Location"])
	assert.Empty(t, db.clickCalls)
}

func TestHandleClick_WrongKind_RedirectsToBaseURL(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_013", MessageID: "msg_013", Kind: domain.KindOpen})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/go/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, testBaseURL, resp.Headers["Location"])
	assert.Empty(t, db.clickCalls)
}

func TestHandleClick_DBError_Does_Not_Change_Response(t *testing.T) {
	db := &mockDB{clickErr: errors.New("timeout")}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_014", MessageID: "msg_014", Kind: domain.KindClick, URL: "https://example.com"})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/go/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
}

// ── Unsubscribe page (GET) ────────────────────────────────────────────────────

func TestHandleUnsubscribePage_ValidToken_Returns200WithForm(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_020", MessageID: "msg_020", Kind: domain.KindUnsubscribe})
	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/unsubscribe/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Headers["Content-Type"], "text/html")
	assert.Contains(t, resp.Body, "Unsubscribe")
	assert.Contains(t, resp.Body, `method="POST"`)
}

func TestHandleUnsubscribePage_FormActionContainsToken(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_021", MessageID: "msg_021", Kind: domain.KindUnsubscribe})
	resp, _ := h.Handle(context.Background(), makeRequest("GET", "/track/unsubscribe/"+signed))

	assert.Contains(t, resp.Body, signed, "form action must embed the signed token")
}

func TestHandleUnsubscribePage_InvalidToken_Returns400(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("GET", "/track/unsubscribe/bad-token"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ── Unsubscribe confirm (POST) ────────────────────────────────────────────────

func TestHandleUnsubscribeConfirm_ValidToken_Returns200(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_030", MessageID: "msg_030", Kind: domain.KindUnsubscribe})
	resp, err := h.Handle(context.Background(), makeRequest("POST", "/track/unsubscribe/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Body, "unsubscribed")
}

func TestHandleUnsubscribeConfirm_ValidToken_RecordsUnsubInDB(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_031", MessageID: "msg_031", Kind: domain.KindUnsubscribe})
	_, _ = h.Handle(context.Background(), makeRequest("POST", "/track/unsubscribe/"+signed))

	require.Len(t, db.unsubCalls, 1)
	assert.Equal(t, "rcp_031", db.unsubCalls[0][0])
	assert.Equal(t, "msg_031", db.unsubCalls[0][1])
}

func TestHandleUnsubscribeConfirm_InvalidToken_Returns400(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("POST", "/track/unsubscribe/invalid"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Empty(t, db.unsubCalls)
}

func TestHandleUnsubscribeConfirm_WrongKind_Returns400(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	// Click kind token on unsubscribe endpoint
	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_032", MessageID: "msg_032", Kind: domain.KindClick})
	resp, err := h.Handle(context.Background(), makeRequest("POST", "/track/unsubscribe/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Empty(t, db.unsubCalls)
}

func TestHandleUnsubscribeConfirm_DBError_Returns500(t *testing.T) {
	db := &mockDB{unsubErr: errors.New("db unavailable")}
	h := newTestHandler(db)

	signed := signToken(t, domain.TrackingToken{RecipientID: "rcp_033", MessageID: "msg_033", Kind: domain.KindUnsubscribe})
	resp, err := h.Handle(context.Background(), makeRequest("POST", "/track/unsubscribe/"+signed))

	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

// ── Unknown paths ─────────────────────────────────────────────────────────────

func TestHandle_UnknownPath_Returns404(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("GET", "/unknown/path"))
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestHandle_RootPath_Returns404(t *testing.T) {
	db := &mockDB{}
	h := newTestHandler(db)

	resp, err := h.Handle(context.Background(), makeRequest("GET", "/"))
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ── HTML page helpers ─────────────────────────────────────────────────────────

func TestUnsubscribeConfirmPage_ContainsFormAction(t *testing.T) {
	page := unsubscribeConfirmPage("my-token-value")
	assert.Contains(t, page, `action="/track/unsubscribe/my-token-value"`)
	assert.Contains(t, page, `method="POST"`)
}

func TestUnsubscribeDonePage_ContainsKeyText(t *testing.T) {
	page := unsubscribeDonePage()
	assert.True(t,
		strings.Contains(page, "unsubscribed") || strings.Contains(page, "Unsubscribed"),
		"done page should confirm unsubscription",
	)
}

func TestUnsubscribeErrorPage_ContainsExpiredOrInvalidText(t *testing.T) {
	page := unsubscribeErrorPage()
	assert.True(t,
		strings.Contains(page, "expired") || strings.Contains(page, "invalid"),
		"error page should mention link expiry or invalidity",
	)
}
