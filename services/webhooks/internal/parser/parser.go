// Package parser decodes incoming Twilio webhook form bodies into structured
// WebhookEvent values. Twilio sends all webhooks as application/x-www-form-urlencoded.
package parser

import (
	"fmt"
	"net/url"
	"strings"
)

// Kind identifies the type of Twilio webhook event.
type Kind string

const (
	// KindInboundSMS is an inbound SMS message (no whatsapp: prefix).
	KindInboundSMS Kind = "inbound_sms"
	// KindInboundWhatsApp is an inbound WhatsApp message (From/To has whatsapp: prefix).
	KindInboundWhatsApp Kind = "inbound_whatsapp"
	// KindStatusCallback is a delivery status update (MessageStatus present).
	KindStatusCallback Kind = "status_callback"
)

// WebhookEvent is the normalised representation of an inbound Twilio webhook.
type WebhookEvent struct {
	Kind          Kind
	AccountSID    string
	MessageSID    string
	From          string
	To            string
	Body          string
	MessageStatus string            // "queued", "sent", "delivered", "failed", etc.
	NumMedia      string            // number of media attachments ("0" if none)
	RawParams     map[string]string // full parameter set forwarded to SQS
}

// Parse decodes a URL-encoded Twilio form body and returns a WebhookEvent.
// Returns an error if the body cannot be decoded or AccountSid is absent.
func Parse(body string) (WebhookEvent, error) {
	params, err := url.ParseQuery(body)
	if err != nil {
		return WebhookEvent{}, fmt.Errorf("parse form body: %w", err)
	}

	if params.Get("AccountSid") == "" {
		return WebhookEvent{}, fmt.Errorf("missing required field: AccountSid")
	}

	// Flatten multi-value params — Twilio never sends duplicate keys, but
	// ParseQuery returns []string per key.
	raw := make(map[string]string, len(params))
	for k, vals := range params {
		if len(vals) > 0 {
			raw[k] = vals[0]
		}
	}

	ev := WebhookEvent{
		AccountSID:    params.Get("AccountSid"),
		MessageSID:    params.Get("MessageSid"),
		From:          params.Get("From"),
		To:            params.Get("To"),
		Body:          params.Get("Body"),
		MessageStatus: params.Get("MessageStatus"),
		NumMedia:      params.Get("NumMedia"),
		RawParams:     raw,
	}

	switch {
	case ev.MessageStatus != "":
		ev.Kind = KindStatusCallback
	case strings.HasPrefix(ev.From, "whatsapp:") || strings.HasPrefix(ev.To, "whatsapp:"):
		ev.Kind = KindInboundWhatsApp
	default:
		ev.Kind = KindInboundSMS
	}

	return ev, nil
}
