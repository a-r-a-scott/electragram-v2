package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Integration smoke-test: verify helper functions compile and work.

func TestEnvOrDefault_ReturnsDefault(t *testing.T) {
	result := envOrDefault("DEFINITELY_UNSET_XYZ_123", "fallback")
	assert.Equal(t, "fallback", result)
}

func TestEnvOrDefault_ReturnsEnvValue(t *testing.T) {
	t.Setenv("TEST_DELIVERY_KEY", "my-value")
	result := envOrDefault("TEST_DELIVERY_KEY", "default")
	assert.Equal(t, "my-value", result)
}
