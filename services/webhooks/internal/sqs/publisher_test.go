package sqs_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/sqs"
)

// ── MockPublisher ─────────────────────────────────────────────────────────────

func TestMockPublisher_RecordsMessages(t *testing.T) {
	m := &sqs.MockPublisher{}

	err := m.Publish(context.Background(), "https://sqs/queue-A", `{"kind":"inbound_sms"}`)
	require.NoError(t, err)

	require.Len(t, m.Messages, 1)
	assert.Equal(t, "https://sqs/queue-A", m.Messages[0].QueueURL)
	assert.Equal(t, `{"kind":"inbound_sms"}`, m.Messages[0].Body)
}

func TestMockPublisher_RecordsMultipleMessages(t *testing.T) {
	m := &sqs.MockPublisher{}

	_ = m.Publish(context.Background(), "https://sqs/q1", "msg-1")
	_ = m.Publish(context.Background(), "https://sqs/q2", "msg-2")

	assert.Len(t, m.Messages, 2)
	assert.Equal(t, "msg-1", m.Messages[0].Body)
	assert.Equal(t, "msg-2", m.Messages[1].Body)
}

func TestMockPublisher_ReturnsConfiguredError(t *testing.T) {
	m := &sqs.MockPublisher{Err: errors.New("sqs unavailable")}

	err := m.Publish(context.Background(), "https://sqs/q", "body")
	assert.ErrorContains(t, err, "sqs unavailable")
	assert.Empty(t, m.Messages, "message should not be recorded when Err is set")
}

func TestMockPublisher_Reset_ClearsMessages(t *testing.T) {
	m := &sqs.MockPublisher{}
	_ = m.Publish(context.Background(), "https://sqs/q", "msg")
	require.Len(t, m.Messages, 1)

	m.Reset()

	assert.Empty(t, m.Messages)
	assert.Nil(t, m.Err)
}

func TestMockPublisher_Reset_ClearsError(t *testing.T) {
	m := &sqs.MockPublisher{Err: errors.New("some error")}
	m.Reset()

	err := m.Publish(context.Background(), "https://sqs/q", "msg")
	require.NoError(t, err)
	assert.Len(t, m.Messages, 1)
}

// ── Real client construction ──────────────────────────────────────────────────

func TestNew_ReturnsClient(t *testing.T) {
	// New reads credentials from env; it does not make network calls at
	// construction time so it should never return nil.
	c := sqs.New("us-east-1")
	assert.NotNil(t, c)
}

func TestNew_EmptyRegion_DoesNotPanic(t *testing.T) {
	assert.NotPanics(t, func() {
		_ = sqs.New("")
	})
}
