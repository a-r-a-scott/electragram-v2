package main

import (
	"context"
	"net/http"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandler_TrackOpen(t *testing.T) {
	req := events.APIGatewayProxyRequest{Path: "/track/open/abc123"}
	resp, err := handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if resp.Headers["Content-Type"] != "image/gif" {
		t.Errorf("expected image/gif content-type, got %s", resp.Headers["Content-Type"])
	}
}

func TestHandler_TrackClick(t *testing.T) {
	req := events.APIGatewayProxyRequest{Path: "/track/go/abc123"}
	resp, err := handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302, got %d", resp.StatusCode)
	}
}

func TestHandler_UnknownPath(t *testing.T) {
	req := events.APIGatewayProxyRequest{Path: "/unknown"}
	resp, err := handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}
