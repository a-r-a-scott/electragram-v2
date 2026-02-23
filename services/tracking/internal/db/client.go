// Package db provides a thin PostgreSQL client for writing tracking events
// back to the messaging schema (opens, clicks, unsubscribes).
package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// Client wraps a *sql.DB with tracking-specific write methods.
type Client struct {
	db *sql.DB
}

// New opens and pings a PostgreSQL connection.
func New(dsn string) (*Client, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	// Lambda reuses the container between invocations; keep the pool small.
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &Client{db: db}, nil
}

// Close releases the underlying connection pool.
func (c *Client) Close() error { return c.db.Close() }

// Migrate adds the tracking columns to messaging.message_recipients if they
// do not already exist. Idempotent: uses ADD COLUMN IF NOT EXISTS.
func (c *Client) Migrate(ctx context.Context) error {
	_, err := c.db.ExecContext(ctx, `
		ALTER TABLE messaging.message_recipients
			ADD COLUMN IF NOT EXISTS open_count  INTEGER NOT NULL DEFAULT 0,
			ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
			ADD COLUMN IF NOT EXISTS opened_at   TIMESTAMPTZ,
			ADD COLUMN IF NOT EXISTS clicked_at  TIMESTAMPTZ
	`)
	return err
}

// RecordOpen marks the recipient's first open timestamp (COALESCE preserves
// the earliest open) and increments both the per-recipient and per-message
// open counters. Writes are best-effort — callers should log but not fail on error.
func (c *Client) RecordOpen(ctx context.Context, recipientID, messageID string) error {
	_, err := c.db.ExecContext(ctx, `
		UPDATE messaging.message_recipients
		SET    opened_at  = COALESCE(opened_at, NOW()),
		       open_count = open_count + 1,
		       updated_at = NOW()
		WHERE  id = $1
	`, recipientID)
	if err != nil {
		return fmt.Errorf("record open (recipient %s): %w", recipientID, err)
	}

	_, err = c.db.ExecContext(ctx, `
		UPDATE messaging.messages
		SET    open_count = open_count + 1,
		       updated_at = NOW()
		WHERE  id = $1
	`, messageID)
	if err != nil {
		return fmt.Errorf("incr message open_count (%s): %w", messageID, err)
	}
	return nil
}

// RecordClick increments click counters, recording the first click timestamp.
func (c *Client) RecordClick(ctx context.Context, recipientID, messageID string) error {
	_, err := c.db.ExecContext(ctx, `
		UPDATE messaging.message_recipients
		SET    clicked_at  = COALESCE(clicked_at, NOW()),
		       click_count = click_count + 1,
		       updated_at  = NOW()
		WHERE  id = $1
	`, recipientID)
	if err != nil {
		return fmt.Errorf("record click (recipient %s): %w", recipientID, err)
	}

	_, err = c.db.ExecContext(ctx, `
		UPDATE messaging.messages
		SET    click_count = click_count + 1,
		       updated_at  = NOW()
		WHERE  id = $1
	`, messageID)
	if err != nil {
		return fmt.Errorf("incr message click_count (%s): %w", messageID, err)
	}
	return nil
}

// RecordUnsubscribe is idempotent: it only inserts the unsubscribe record and
// increments the counter when the recipient status transitions to 'unsubscribed'
// for the first time (guarded by WHERE status != 'unsubscribed').
func (c *Client) RecordUnsubscribe(ctx context.Context, recipientID, messageID string) error {
	// Fetch the recipient so we have account_id and email for the unsubscribes table.
	var accountID string
	var email sql.NullString
	err := c.db.QueryRowContext(ctx, `
		SELECT account_id, email
		FROM   messaging.message_recipients
		WHERE  id = $1
	`, recipientID).Scan(&accountID, &email)
	if err != nil {
		return fmt.Errorf("lookup recipient %s: %w", recipientID, err)
	}

	// Only transition if not already unsubscribed to prevent double-counting.
	result, err := c.db.ExecContext(ctx, `
		UPDATE messaging.message_recipients
		SET    status     = 'unsubscribed',
		       updated_at = NOW()
		WHERE  id = $1
		  AND  status != 'unsubscribed'
	`, recipientID)
	if err != nil {
		return fmt.Errorf("mark recipient unsubscribed (%s): %w", recipientID, err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		// Already unsubscribed — idempotent, nothing more to do.
		return nil
	}

	// Insert the unsubscribe audit record.
	id, err := generateID("uns")
	if err != nil {
		return fmt.Errorf("generate unsubscribe id: %w", err)
	}

	_, err = c.db.ExecContext(ctx, `
		INSERT INTO messaging.unsubscribes
		       (id, account_id, email, message_id, reason, created_at)
		VALUES ($1, $2,         $3,    $4,          'link', NOW())
	`, id, accountID, nullStr(email.String), messageID)
	if err != nil {
		return fmt.Errorf("insert unsubscribe: %w", err)
	}

	// Increment the message-level counter.
	_, err = c.db.ExecContext(ctx, `
		UPDATE messaging.messages
		SET    unsubscribe_count = unsubscribe_count + 1,
		       updated_at        = NOW()
		WHERE  id = $1
	`, messageID)
	if err != nil {
		return fmt.Errorf("incr message unsubscribe_count (%s): %w", messageID, err)
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// generateID produces a unique identifier with the given prefix, e.g. "uns_XXXX".
// Uses 15 random bytes → 24 base32 chars (no padding, lowercase).
func generateID(prefix string) (string, error) {
	b := make([]byte, 15)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
	return prefix + "_" + strings.ToLower(encoded), nil
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
