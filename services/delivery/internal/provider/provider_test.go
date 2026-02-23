package provider_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/provider"
)

func strPtr(s string) *string { return &s }

func makePayload(kind, to string) domain.DeliveryPayload {
	return domain.DeliveryPayload{
		MessageID:   "msg_001",
		RecipientID: "rcp_002",
		AccountID:   "acc_003",
		Kind:        kind,
		To:          to,
		Subject:     "Hello",
		Body:        "Test body",
		FromName:    strPtr("Acme"),
		FromEmail:   strPtr("noreply@acme.com"),
		FirstName:   strPtr("Alice"),
		LastName:    strPtr("Smith"),
	}
}

// ─── Registry ─────────────────────────────────────────────────────────────────

func TestRegistry_Get_KnownKind(t *testing.T) {
	mock := provider.NewMockProvider("mock")
	reg := provider.NewRegistry(map[string]provider.Provider{"email": mock})

	p, ok := reg.Get("email")
	assert.True(t, ok)
	assert.NotNil(t, p)
}

func TestRegistry_Get_UnknownKind(t *testing.T) {
	reg := provider.NewRegistry(map[string]provider.Provider{})
	p, ok := reg.Get("fax")
	assert.False(t, ok)
	assert.Nil(t, p)
}

func TestRegistry_AllKinds(t *testing.T) {
	email := provider.NewMockProvider("email")
	sms := provider.NewMockProvider("sms")
	wa := provider.NewMockProvider("wa")

	reg := provider.NewRegistry(map[string]provider.Provider{
		"email":    email,
		"sms":      sms,
		"whatsapp": wa,
	})

	for _, kind := range []string{"email", "sms", "whatsapp"} {
		p, ok := reg.Get(kind)
		assert.True(t, ok, "kind %s should exist", kind)
		assert.NotNil(t, p)
	}
}

// ─── MockProvider ─────────────────────────────────────────────────────────────

func TestMockProvider_Send_Success(t *testing.T) {
	mock := provider.NewMockProvider("test")
	payload := makePayload("email", "alice@example.com")

	id, err := mock.Send(context.Background(), payload)
	require.NoError(t, err)
	assert.Equal(t, "test-rcp_002", id)
	assert.Equal(t, 1, mock.SentCount())
}

func TestMockProvider_Send_RecordsPayload(t *testing.T) {
	mock := provider.NewMockProvider("test")
	payload := makePayload("sms", "+44123456789")

	_, err := mock.Send(context.Background(), payload)
	require.NoError(t, err)
	assert.Equal(t, payload.To, mock.Sent[0].To)
	assert.Equal(t, "sms", mock.Sent[0].Kind)
}

func TestMockProvider_Send_Error(t *testing.T) {
	mock := provider.NewMockProvider("test")
	mock.ErrorOn["rcp_002"] = errors.New("invalid recipient")

	payload := makePayload("email", "alice@example.com")
	_, err := mock.Send(context.Background(), payload)
	assert.ErrorContains(t, err, "invalid recipient")
	assert.Equal(t, 0, mock.SentCount())
}

func TestMockProvider_Reset(t *testing.T) {
	mock := provider.NewMockProvider("test")
	_, _ = mock.Send(context.Background(), makePayload("email", "a@b.com"))
	_, _ = mock.Send(context.Background(), makePayload("email", "c@d.com"))
	assert.Equal(t, 2, mock.SentCount())

	mock.Reset()
	assert.Equal(t, 0, mock.SentCount())
}

func TestMockProvider_MultipleSends(t *testing.T) {
	mock := provider.NewMockProvider("mock")
	for i := 0; i < 10; i++ {
		p := makePayload("email", "test@example.com")
		p.RecipientID = string(rune('a' + i))
		_, _ = mock.Send(context.Background(), p)
	}
	assert.Equal(t, 10, mock.SentCount())
}

// ─── SendGrid provider (with mock HTTP client) ────────────────────────────────

type mockSGClient struct {
	returnStatus int
	returnErr    error
	called       int
}

func (m *mockSGClient) Send(email interface{ GetSubject() string }) (interface{ GetStatusCode() int; GetBody() string; GetHeaders() map[string][]string }, error) {
	m.called++
	if m.returnErr != nil {
		return nil, m.returnErr
	}
	return &mockSGResponse{status: m.returnStatus}, nil
}

type mockSGResponse struct {
	status int
}

func (r *mockSGResponse) GetStatusCode() int                  { return r.status }
func (r *mockSGResponse) GetBody() string                     { return "" }
func (r *mockSGResponse) GetHeaders() map[string][]string     { return nil }

// ─── Twilio provider (with mock client) ──────────────────────────────────────

type mockTwilioClient struct {
	returnErr error
	called    int
	lastTo    string
	lastFrom  string
}

func (m *mockTwilioClient) CreateMessage(params interface{ GetTo() string; GetFrom() string; GetBody() string }) (interface{ GetSid() *string }, error) {
	m.called++
	m.lastTo = params.GetTo()
	m.lastFrom = params.GetFrom()
	if m.returnErr != nil {
		return nil, m.returnErr
	}
	sid := "SMtestxxx"
	return &mockTwilioMsg{sid: &sid}, nil
}

type mockTwilioMsg struct{ sid *string }

func (m *mockTwilioMsg) GetSid() *string { return m.sid }
