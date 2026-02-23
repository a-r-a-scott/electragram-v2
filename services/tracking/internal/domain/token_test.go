package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/domain"
)

func TestKindConstants(t *testing.T) {
	assert.Equal(t, "o", domain.KindOpen)
	assert.Equal(t, "c", domain.KindClick)
	assert.Equal(t, "u", domain.KindUnsubscribe)
}

func TestTrackingTokenFields(t *testing.T) {
	tok := domain.TrackingToken{
		RecipientID: "rcp_123",
		MessageID:   "msg_456",
		Kind:        domain.KindClick,
		URL:         "https://example.com/page",
	}
	assert.Equal(t, "rcp_123", tok.RecipientID)
	assert.Equal(t, "msg_456", tok.MessageID)
	assert.Equal(t, domain.KindClick, tok.Kind)
	assert.Equal(t, "https://example.com/page", tok.URL)
}

func TestTrackingTokenURLOptional(t *testing.T) {
	tok := domain.TrackingToken{
		RecipientID: "rcp_123",
		MessageID:   "msg_456",
		Kind:        domain.KindOpen,
	}
	assert.Empty(t, tok.URL, "URL should be empty for open/unsubscribe tokens")
}

func TestTrackingTokenZeroValue(t *testing.T) {
	var tok domain.TrackingToken
	assert.Empty(t, tok.RecipientID)
	assert.Empty(t, tok.MessageID)
	assert.Empty(t, tok.Kind)
	assert.Empty(t, tok.URL)
}
