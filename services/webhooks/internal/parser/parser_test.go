package parser_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/parser"
)

// ── Kind constants ────────────────────────────────────────────────────────────

func TestKindConstants(t *testing.T) {
	assert.Equal(t, parser.Kind("inbound_sms"), parser.KindInboundSMS)
	assert.Equal(t, parser.Kind("inbound_whatsapp"), parser.KindInboundWhatsApp)
	assert.Equal(t, parser.Kind("status_callback"), parser.KindStatusCallback)
}

// ── Inbound SMS ───────────────────────────────────────────────────────────────

func TestParse_InboundSMS(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&From=%2B15551234567&To=%2B15550000001&Body=Hello+there&NumMedia=0"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindInboundSMS, ev.Kind)
	assert.Equal(t, "ACxxx", ev.AccountSID)
	assert.Equal(t, "SMxxx", ev.MessageSID)
	assert.Equal(t, "+15551234567", ev.From)
	assert.Equal(t, "+15550000001", ev.To)
	assert.Equal(t, "Hello there", ev.Body)
	assert.Equal(t, "0", ev.NumMedia)
	assert.Empty(t, ev.MessageStatus)
}

func TestParse_InboundSMS_RawParamsPopulated(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&From=%2B15551234567&To=%2B15550000001&Body=Hi"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, "ACxxx", ev.RawParams["AccountSid"])
	assert.Equal(t, "Hi", ev.RawParams["Body"])
}

// ── Inbound WhatsApp ──────────────────────────────────────────────────────────

func TestParse_InboundWhatsApp_FromPrefix(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&From=whatsapp%3A%2B15551234567&To=%2B15550000001&Body=Hey"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindInboundWhatsApp, ev.Kind)
	assert.Equal(t, "whatsapp:+15551234567", ev.From)
}

func TestParse_InboundWhatsApp_ToPrefix(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&From=%2B15551234567&To=whatsapp%3A%2B15550000001&Body=Hey"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindInboundWhatsApp, ev.Kind)
}

// ── Status callback ───────────────────────────────────────────────────────────

func TestParse_StatusCallback_Delivered(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&MessageStatus=delivered&To=%2B15551234567"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindStatusCallback, ev.Kind)
	assert.Equal(t, "delivered", ev.MessageStatus)
	assert.Equal(t, "SMxxx", ev.MessageSID)
}

func TestParse_StatusCallback_Failed(t *testing.T) {
	body := "AccountSid=ACxxx&MessageSid=SMxxx&MessageStatus=failed&To=%2B15551234567&ErrorCode=30008"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindStatusCallback, ev.Kind)
	assert.Equal(t, "failed", ev.MessageStatus)
}

func TestParse_StatusCallback_TakesPrecedenceOverWhatsApp(t *testing.T) {
	// MessageStatus present → always KindStatusCallback regardless of From prefix
	body := "AccountSid=ACxxx&MessageSid=SMxxx&From=whatsapp%3A%2B15551234567&MessageStatus=sent"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, parser.KindStatusCallback, ev.Kind)
}

// ── Error cases ───────────────────────────────────────────────────────────────

func TestParse_MissingAccountSid_ReturnsError(t *testing.T) {
	body := "MessageSid=SMxxx&From=%2B15551234567&Body=hi"

	_, err := parser.Parse(body)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "AccountSid")
}

func TestParse_EmptyBody_ReturnsError(t *testing.T) {
	_, err := parser.Parse("")
	assert.Error(t, err)
}

func TestParse_InvalidURLEncoding_ReturnsError(t *testing.T) {
	_, err := parser.Parse("AccountSid=ACxxx&Bad=%ZZ")
	assert.Error(t, err)
}

// ── Edge cases ────────────────────────────────────────────────────────────────

func TestParse_MinimalFields_NoPanic(t *testing.T) {
	body := "AccountSid=ACxxx"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, "ACxxx", ev.AccountSID)
	assert.Empty(t, ev.MessageSID)
	assert.Empty(t, ev.Body)
	assert.Equal(t, parser.KindInboundSMS, ev.Kind)
}

func TestParse_BodyWithSpecialChars(t *testing.T) {
	body := "AccountSid=ACxxx&Body=Hello+%26+World%21"

	ev, err := parser.Parse(body)
	require.NoError(t, err)

	assert.Equal(t, "Hello & World!", ev.Body)
}
