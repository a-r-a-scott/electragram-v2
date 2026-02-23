package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandler_ValidMessage(t *testing.T) {
	msg := DeliveryMessage{
		MessageID:   "msg-001",
		RecipientID: "user-123",
		Channel:     "email",
		Content:     "Hello, world!",
	}
	body, _ := json.Marshal(msg)
	sqsEvent := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: string(body)},
		},
	}
	if err := handler(context.Background(), sqsEvent); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestHandler_InvalidJSON(t *testing.T) {
	sqsEvent := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: "not-valid-json"},
		},
	}
	// Handler should log and continue, not return error
	if err := handler(context.Background(), sqsEvent); err != nil {
		t.Fatalf("expected no error on bad JSON, got: %v", err)
	}
}
