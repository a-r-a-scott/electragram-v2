package db_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	dbpkg "github.com/a-r-a-scott/electragram-v2/services/delivery/internal/db"
)

func TestRecipientUpdate_Fields(t *testing.T) {
	u := dbpkg.RecipientUpdate{
		RecipientID:   "rcp_1",
		Status:        "delivered",
		ExternalID:    "sg-abc123",
		FailureReason: "",
	}

	assert.Equal(t, "rcp_1", u.RecipientID)
	assert.Equal(t, "delivered", u.Status)
	assert.Equal(t, "sg-abc123", u.ExternalID)
	assert.Empty(t, u.FailureReason)
}

func TestRecipientUpdate_FailedStatus(t *testing.T) {
	u := dbpkg.RecipientUpdate{
		RecipientID:   "rcp_2",
		Status:        "failed",
		ExternalID:    "",
		FailureReason: "mailbox not found",
	}

	assert.Equal(t, "failed", u.Status)
	assert.Equal(t, "mailbox not found", u.FailureReason)
}

func TestNewDB_InvalidDSN(t *testing.T) {
	// Should fail to connect but not panic.
	_, err := dbpkg.New("postgres://invalid:invalid@localhost:9999/nodb?sslmode=disable")
	assert.Error(t, err)
}
