package domain_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
)

func strPtr(s string) *string { return &s }

func TestDeliveryPayload_JSONRoundtrip(t *testing.T) {
	payload := domain.DeliveryPayload{
		MessageID:   "msg_001",
		RecipientID: "rcp_002",
		AccountID:   "acc_003",
		Kind:        "email",
		To:          "alice@example.com",
		Subject:     "You're invited",
		Body:        "Hello Alice",
		BodyHTML:    strPtr("<p>Hello Alice</p>"),
		FromName:    strPtr("Acme Events"),
		FromEmail:   strPtr("events@acme.com"),
		ReplyTo:     strPtr("reply@acme.com"),
		FirstName:   strPtr("Alice"),
		LastName:    strPtr("Smith"),
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded domain.DeliveryPayload
	require.NoError(t, json.Unmarshal(data, &decoded))

	assert.Equal(t, payload.MessageID, decoded.MessageID)
	assert.Equal(t, payload.RecipientID, decoded.RecipientID)
	assert.Equal(t, payload.Kind, decoded.Kind)
	assert.Equal(t, payload.To, decoded.To)
	assert.Equal(t, *payload.BodyHTML, *decoded.BodyHTML)
	assert.Equal(t, *payload.FromName, *decoded.FromName)
}

func TestDeliveryPayload_NullableFields(t *testing.T) {
	// Nullable pointer fields should deserialise to nil when absent.
	raw := `{"messageId":"m1","recipientId":"r1","accountId":"a1","kind":"email","to":"x@y.com","subject":"S","body":"B"}`
	var p domain.DeliveryPayload
	require.NoError(t, json.Unmarshal([]byte(raw), &p))

	assert.Nil(t, p.BodyHTML)
	assert.Nil(t, p.FromName)
	assert.Nil(t, p.FromEmail)
	assert.Nil(t, p.ReplyTo)
	assert.Nil(t, p.FirstName)
	assert.Nil(t, p.LastName)
}

func TestDeliveryPayload_SMSFields(t *testing.T) {
	p := domain.DeliveryPayload{
		MessageID:   "msg_sms",
		RecipientID: "rcp_sms",
		AccountID:   "acc_sms",
		Kind:        "sms",
		To:          "+44123456789",
		Body:        "Your event starts in 1 hour.",
	}
	assert.Equal(t, "sms", p.Kind)
	assert.Equal(t, "+44123456789", p.To)
}

func TestBatchResult_Defaults(t *testing.T) {
	var r domain.BatchResult
	assert.Equal(t, 0, r.Delivered)
	assert.Equal(t, 0, r.Failed)
	assert.Equal(t, 0, r.Skipped)
}

func TestDeliveryResult_Success(t *testing.T) {
	r := domain.DeliveryResult{
		RecipientID: "rcp_1",
		MessageID:   "msg_1",
		Success:     true,
		ExternalID:  "sg-abc123",
	}
	assert.True(t, r.Success)
	assert.Equal(t, "sg-abc123", r.ExternalID)
	assert.Empty(t, r.FailureReason)
}

func TestDeliveryResult_Failure(t *testing.T) {
	r := domain.DeliveryResult{
		RecipientID:   "rcp_2",
		MessageID:     "msg_1",
		Success:       false,
		FailureReason: "invalid email address",
	}
	assert.False(t, r.Success)
	assert.Equal(t, "invalid email address", r.FailureReason)
}
