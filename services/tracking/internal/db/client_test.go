package db_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/db"
)

func TestNew_InvalidDSN(t *testing.T) {
	_, err := db.New("not-a-valid-dsn")
	assert.Error(t, err)
}

func TestNew_UnreachableHost(t *testing.T) {
	// Port 9 is the discard service — reliably unreachable for PostgreSQL.
	_, err := db.New("postgres://user:pass@127.0.0.1:9/dbname?connect_timeout=1")
	assert.Error(t, err)
}
