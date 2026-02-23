package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandler_WebhookReceived(t *testing.T) {
	req := events.APIGatewayProxyRequest{
		Path:   "/webhooks/twilio/sms",
		Body:   "From=%2B15551234567&Body=Hello",
		Headers: map[string]string{"Content-Type": "application/x-www-form-urlencoded"},
	}
	resp, err := handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(resp.Body, "<Response>") {
		t.Errorf("expected TwiML response body, got: %s", resp.Body)
	}
}
