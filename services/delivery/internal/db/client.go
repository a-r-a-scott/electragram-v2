// Package db provides a thin Postgres client for writing delivery outcomes
// back to the messaging schema (recipient status + dispatch job status).
package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// Client wraps a *sql.DB with delivery-specific update methods.
type Client struct {
	db *sql.DB
}

// New opens and pings a Postgres connection.
func New(dsn string) (*Client, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &Client{db: db}, nil
}

// Close closes the underlying connection pool.
func (c *Client) Close() error {
	return c.db.Close()
}

// RecipientUpdate holds the outcome for a single recipient.
type RecipientUpdate struct {
	RecipientID   string
	Status        string // delivered | failed | bounced
	ExternalID    string
	FailureReason string
}

// UpdateRecipient writes the delivery outcome for one recipient.
func (c *Client) UpdateRecipient(ctx context.Context, u RecipientUpdate) error {
	now := time.Now().UTC()
	var deliveredAt *time.Time
	if u.Status == "delivered" {
		deliveredAt = &now
	}

	_, err := c.db.ExecContext(ctx, `
		UPDATE messaging.message_recipients
		SET    status         = $1,
		       external_id    = $2,
		       failure_reason = $3,
		       delivered_at   = $4,
		       updated_at     = NOW()
		WHERE  id = $5
	`, u.Status, nullStr(u.ExternalID), nullStr(u.FailureReason), deliveredAt, u.RecipientID)
	if err != nil {
		return fmt.Errorf("update recipient %s: %w", u.RecipientID, err)
	}
	return nil
}

// UpdateDispatchJob writes the final status of a dispatch job.
func (c *Client) UpdateDispatchJob(ctx context.Context, recipientID, status string, attempts int) error {
	_, err := c.db.ExecContext(ctx, `
		UPDATE messaging.dispatch_jobs
		SET    status          = $1,
		       attempts        = $2,
		       last_attempt_at = NOW(),
		       updated_at      = NOW()
		WHERE  recipient_id = $3
	`, status, attempts, recipientID)
	if err != nil {
		return fmt.Errorf("update dispatch job for recipient %s: %w", recipientID, err)
	}
	return nil
}

// IncrMessageCounter atomically increments one of the message-level stats columns.
func (c *Client) IncrMessageCounter(ctx context.Context, messageID, column string, delta int) error {
	// Guard against SQL injection — only allow known column names.
	allowed := map[string]bool{
		"delivered_count":    true,
		"failed_count":       true,
		"bounced_count":      true,
		"open_count":         true,
		"click_count":        true,
		"unsubscribe_count":  true,
	}
	if !allowed[column] {
		return fmt.Errorf("unknown counter column: %s", column)
	}

	query := fmt.Sprintf(`
		UPDATE messaging.messages
		SET    %s     = %s + $1,
		       updated_at = NOW()
		WHERE  id = $2
	`, column, column)

	_, err := c.db.ExecContext(ctx, query, delta, messageID)
	if err != nil {
		return fmt.Errorf("incr %s for message %s: %w", column, messageID, err)
	}
	return nil
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
