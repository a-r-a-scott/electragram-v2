package provider

import (
	"context"
	"fmt"

	"github.com/twilio/twilio-go"
	twilioApi "github.com/twilio/twilio-go/rest/api/v2010"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
)

// TwilioSMSClient is the subset of the Twilio messages API we use.
type TwilioSMSClient interface {
	CreateMessage(params *twilioApi.CreateMessageParams) (*twilioApi.ApiV2010Message, error)
}

// TwilioSMSProvider sends SMS messages via the Twilio Messaging API.
type TwilioSMSProvider struct {
	client TwilioSMSClient
	from   string
}

// NewTwilioSMSProvider constructs a production provider backed by a real Twilio client.
func NewTwilioSMSProvider(accountSID, authToken, from string) *TwilioSMSProvider {
	client := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: accountSID,
		Password: authToken,
	})
	return &TwilioSMSProvider{
		client: client.Api,
		from:   from,
	}
}

// NewTwilioSMSProviderWithClient constructs a provider with a custom client (used in tests).
func NewTwilioSMSProviderWithClient(client TwilioSMSClient, from string) *TwilioSMSProvider {
	return &TwilioSMSProvider{client: client, from: from}
}

func (p *TwilioSMSProvider) Send(_ context.Context, payload domain.DeliveryPayload) (string, error) {
	body := payload.Body
	params := &twilioApi.CreateMessageParams{}
	params.SetTo(payload.To)
	params.SetFrom(p.from)
	params.SetBody(body)

	msg, err := p.client.CreateMessage(params)
	if err != nil {
		return "", fmt.Errorf("twilio sms send: %w", err)
	}
	if msg.Sid == nil {
		return fmt.Sprintf("twilio-%s-%s", payload.MessageID, payload.RecipientID), nil
	}
	return *msg.Sid, nil
}

// TwilioWhatsAppProvider sends WhatsApp messages via Twilio (same API, different from number prefix).
type TwilioWhatsAppProvider struct {
	client TwilioSMSClient
	from   string // e.g. "whatsapp:+14155238886"
}

// NewTwilioWhatsAppProvider constructs a production WhatsApp provider.
func NewTwilioWhatsAppProvider(accountSID, authToken, from string) *TwilioWhatsAppProvider {
	client := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: accountSID,
		Password: authToken,
	})
	return &TwilioWhatsAppProvider{
		client: client.Api,
		from:   "whatsapp:" + from,
	}
}

// NewTwilioWhatsAppProviderWithClient constructs a provider with a custom client (used in tests).
func NewTwilioWhatsAppProviderWithClient(client TwilioSMSClient, from string) *TwilioWhatsAppProvider {
	return &TwilioWhatsAppProvider{client: client, from: "whatsapp:" + from}
}

func (p *TwilioWhatsAppProvider) Send(_ context.Context, payload domain.DeliveryPayload) (string, error) {
	params := &twilioApi.CreateMessageParams{}
	params.SetTo("whatsapp:" + payload.To)
	params.SetFrom(p.from)
	params.SetBody(payload.Body)

	msg, err := p.client.CreateMessage(params)
	if err != nil {
		return "", fmt.Errorf("twilio whatsapp send: %w", err)
	}
	if msg.Sid == nil {
		return fmt.Sprintf("twilio-wa-%s-%s", payload.MessageID, payload.RecipientID), nil
	}
	return *msg.Sid, nil
}
