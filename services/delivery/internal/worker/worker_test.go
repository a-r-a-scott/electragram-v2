package worker_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/provider"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/worker"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func strPtr(s string) *string { return &s }

func makeEvent(payloads ...domain.DeliveryPayload) events.SQSEvent {
	records := make([]events.SQSMessage, len(payloads))
	for i, p := range payloads {
		b, _ := json.Marshal(p)
		records[i] = events.SQSMessage{
			MessageId: p.RecipientID,
			Body:      string(b),
		}
	}
	return events.SQSEvent{Records: records}
}

func makePayload(kind, recipientID string) domain.DeliveryPayload {
	return domain.DeliveryPayload{
		MessageID:   "msg_test001",
		RecipientID: recipientID,
		AccountID:   "acc_test001",
		Kind:        kind,
		To:          "alice@example.com",
		Subject:     "Hello",
		Body:        "Test body",
		FromName:    strPtr("Acme"),
		FromEmail:   strPtr("no-reply@acme.com"),
	}
}

// ─── Mock DB ──────────────────────────────────────────────────────────────────

type mockDB struct {
	updates      []string
	jobUpdates   []string
	counterCalls []string
	failOn       string
}

func (m *mockDB) UpdateRecipient(_ context.Context, recipientID, status, _, _ string) error {
	if m.failOn == recipientID {
		return errors.New("db error")
	}
	m.updates = append(m.updates, recipientID+":"+status)
	return nil
}

func (m *mockDB) UpdateDispatchJob(_ context.Context, recipientID, status string, _ int) error {
	m.jobUpdates = append(m.jobUpdates, recipientID+":"+status)
	return nil
}

func (m *mockDB) IncrMessageCounter(_ context.Context, messageID, column string, _ int) error {
	m.counterCalls = append(m.counterCalls, messageID+":"+column)
	return nil
}

// ─── Worker builder ───────────────────────────────────────────────────────────

func newWorker(emailMock, smsMock *provider.MockProvider, db *mockDB) *worker.Worker {
	reg := provider.NewRegistry(map[string]provider.Provider{
		"email": emailMock,
		"sms":   smsMock,
	})
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	return worker.New(reg, db, log)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestWorker_SingleEmailSuccess(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	smsMock := provider.NewMockProvider("twilio")
	db := &mockDB{}

	w := newWorker(emailMock, smsMock, db)
	event := makeEvent(makePayload("email", "rcp_001"))

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures, "no failures expected")
	assert.Equal(t, 1, emailMock.SentCount())
}

func TestWorker_SingleSMSSuccess(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	smsMock := provider.NewMockProvider("twilio")
	db := &mockDB{}

	smsMock.Sent = nil // ensure clean
	w := newWorker(emailMock, smsMock, db)

	p := makePayload("sms", "rcp_sms")
	p.To = "+44123456789"
	event := makeEvent(p)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures)
	assert.Equal(t, 1, smsMock.SentCount())
}

func TestWorker_BatchMultipleRecords(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	smsMock := provider.NewMockProvider("twilio")
	db := &mockDB{}
	w := newWorker(emailMock, smsMock, db)

	payloads := make([]domain.DeliveryPayload, 5)
	for i := range payloads {
		payloads[i] = makePayload("email", string(rune('a'+i)))
	}
	event := makeEvent(payloads...)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures)
	assert.Equal(t, 5, emailMock.SentCount())
}

func TestWorker_ProviderFailureReturnsPartialFailure(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	emailMock.ErrorOn["rcp_fail"] = errors.New("connection timeout")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	payloads := []domain.DeliveryPayload{
		makePayload("email", "rcp_ok"),
		makePayload("email", "rcp_fail"),
	}
	event := makeEvent(payloads...)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Len(t, resp.BatchItemFailures, 1)
	assert.Equal(t, "rcp_fail", resp.BatchItemFailures[0].ItemIdentifier)
	assert.Equal(t, 1, emailMock.SentCount(), "only rcp_ok should be sent")
}

func TestWorker_AllFail_PartialBatchResponse(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	emailMock.ErrorOn["r1"] = errors.New("error")
	emailMock.ErrorOn["r2"] = errors.New("error")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	event := makeEvent(
		makePayload("email", "r1"),
		makePayload("email", "r2"),
	)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Len(t, resp.BatchItemFailures, 2)
	assert.Equal(t, 0, emailMock.SentCount())
}

func TestWorker_UnknownKind_ReturnsFailure(t *testing.T) {
	db := &mockDB{}
	reg := provider.NewRegistry(map[string]provider.Provider{})
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	w := worker.New(reg, db, log)

	p := makePayload("fax", "rcp_fax")
	event := makeEvent(p)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Len(t, resp.BatchItemFailures, 1)
}

func TestWorker_MalformedJSON_ReturnsFailure(t *testing.T) {
	db := &mockDB{}
	emailMock := provider.NewMockProvider("sg")
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{MessageId: "bad1", Body: "not-json-at-all"},
		},
	}

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Len(t, resp.BatchItemFailures, 1)
}

func TestWorker_EmptyBatch(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	resp, err := w.ProcessBatch(context.Background(), events.SQSEvent{Records: nil})
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures)
	assert.Equal(t, 0, emailMock.SentCount())
}

func TestWorker_DBFailure_DoesNotRetryRecord(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{failOn: "rcp_dbfail"}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	p := makePayload("email", "rcp_dbfail")
	event := makeEvent(p)

	// DB write failure should NOT make the record a batch failure (best-effort).
	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures, "DB failure is best-effort, not a retry trigger")
	assert.Equal(t, 1, emailMock.SentCount())
}

func TestWorker_RecipientStatusUpdated_OnSuccess(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	event := makeEvent(makePayload("email", "rcp_status"))

	_, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)

	assert.Contains(t, db.updates, "rcp_status:delivered")
}

func TestWorker_RecipientStatusUpdated_OnFailure(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	emailMock.ErrorOn["rcp_err"] = errors.New("send failed")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	event := makeEvent(makePayload("email", "rcp_err"))

	_, _ = w.ProcessBatch(context.Background(), event)
	assert.Contains(t, db.updates, "rcp_err:failed")
}

func TestWorker_MessageCounterIncremented(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	event := makeEvent(makePayload("email", "rcp_counter"))

	_, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)

	assert.Contains(t, db.counterCalls, "msg_test001:delivered_count")
}

func TestWorker_MissingRecipientID_ReturnsFailure(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	p := domain.DeliveryPayload{MessageID: "msg_1", Kind: "email", To: "a@b.com"}
	// RecipientID deliberately left empty
	event := makeEvent(p)
	event.Records[0].MessageId = "missing-id"

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Len(t, resp.BatchItemFailures, 1)
}

func TestWorker_DefaultsKindToEmail_WhenMissing(t *testing.T) {
	emailMock := provider.NewMockProvider("sg")
	db := &mockDB{}
	w := newWorker(emailMock, provider.NewMockProvider("twilio"), db)

	p := domain.DeliveryPayload{
		MessageID:   "msg_def",
		RecipientID: "rcp_def",
		AccountID:   "acc_def",
		To:          "a@b.com",
		// Kind intentionally empty
	}
	event := makeEvent(p)

	resp, err := w.ProcessBatch(context.Background(), event)
	require.NoError(t, err)
	assert.Empty(t, resp.BatchItemFailures)
	assert.Equal(t, 1, emailMock.SentCount())
}
