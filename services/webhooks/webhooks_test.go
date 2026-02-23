package main

import (
	"os"
	"testing"
)

func TestEnvOrDefault_ReturnsValueWhenSet(t *testing.T) {
	os.Setenv("TEST_WH_VAR", "hello")
	defer os.Unsetenv("TEST_WH_VAR")

	got := envOrDefault("TEST_WH_VAR", "default")
	if got != "hello" {
		t.Errorf("expected hello, got %s", got)
	}
}

func TestEnvOrDefault_ReturnsDefaultWhenUnset(t *testing.T) {
	os.Unsetenv("TEST_WH_VAR_MISSING")
	got := envOrDefault("TEST_WH_VAR_MISSING", "fallback")
	if got != "fallback" {
		t.Errorf("expected fallback, got %s", got)
	}
}

func TestEnvOrDefault_EmptyValueUsesDefault(t *testing.T) {
	os.Setenv("TEST_WH_EMPTY", "")
	defer os.Unsetenv("TEST_WH_EMPTY")
	got := envOrDefault("TEST_WH_EMPTY", "used-default")
	if got != "used-default" {
		t.Errorf("expected used-default, got %s", got)
	}
}
