package provider

import (
	"context"
	"fmt"
	"net/http"

	"github.com/sendgrid/rest"
	"github.com/sendgrid/sendgrid-go"
	sgmail "github.com/sendgrid/sendgrid-go/helpers/mail"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
)

// SendGridClient is the interface for sending mail via SendGrid.
// Both the real sendgrid.Client and test mocks implement this.
type SendGridClient interface {
	Send(email *sgmail.SGMailV3) (*rest.Response, error)
}

// SendGridProvider sends emails via the SendGrid v3 Mail Send API.
type SendGridProvider struct {
	client      SendGridClient
	defaultFrom string
	defaultName string
}

// NewSendGridProvider constructs a production provider backed by a real SendGrid client.
func NewSendGridProvider(apiKey, defaultFrom, defaultName string) *SendGridProvider {
	return &SendGridProvider{
		client:      sendgrid.NewSendClient(apiKey),
		defaultFrom: defaultFrom,
		defaultName: defaultName,
	}
}

// NewSendGridProviderWithClient constructs a provider with a custom client (used in tests).
func NewSendGridProviderWithClient(client SendGridClient, defaultFrom, defaultName string) *SendGridProvider {
	return &SendGridProvider{
		client:      client,
		defaultFrom: defaultFrom,
		defaultName: defaultName,
	}
}

func (p *SendGridProvider) Send(ctx context.Context, payload domain.DeliveryPayload) (string, error) {
	fromEmail := p.defaultFrom
	fromName := p.defaultName
	if payload.FromEmail != nil && *payload.FromEmail != "" {
		fromEmail = *payload.FromEmail
	}
	if payload.FromName != nil && *payload.FromName != "" {
		fromName = *payload.FromName
	}

	from := sgmail.NewEmail(fromName, fromEmail)
	to := sgmail.NewEmail(fullName(payload), payload.To)

	var message *sgmail.SGMailV3
	if payload.BodyHTML != nil && *payload.BodyHTML != "" {
		message = sgmail.NewSingleEmailPlainText(from, payload.Subject, to, payload.Body)
		message.Content = []*sgmail.Content{
			sgmail.NewContent("text/plain", payload.Body),
			sgmail.NewContent("text/html", *payload.BodyHTML),
		}
	} else {
		message = sgmail.NewSingleEmailPlainText(from, payload.Subject, to, payload.Body)
	}

	if payload.ReplyTo != nil && *payload.ReplyTo != "" {
		message.ReplyTo = sgmail.NewEmail("", *payload.ReplyTo)
	}

	message.SetHeader("X-Electragram-Message-ID", payload.MessageID)
	message.SetHeader("X-Electragram-Recipient-ID", payload.RecipientID)

	resp, err := p.client.Send(message)
	if err != nil {
		return "", fmt.Errorf("sendgrid send: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("sendgrid returned status %d: %s", resp.StatusCode, resp.Body)
	}

	if ids, ok := resp.Headers["X-Message-Id"]; ok && len(ids) > 0 {
		return ids[0], nil
	}
	return fmt.Sprintf("sg-%s-%s", payload.MessageID, payload.RecipientID), nil
}

func fullName(p domain.DeliveryPayload) string {
	if p.FirstName != nil && p.LastName != nil {
		return *p.FirstName + " " + *p.LastName
	}
	if p.FirstName != nil {
		return *p.FirstName
	}
	return ""
}
