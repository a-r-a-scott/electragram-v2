// Package worker implements the SQS batch processor.
// Each Lambda invocation receives up to 10 SQS records, processes them
// concurrently, and returns a partial batch failure response so Lambda
// only retries the failed items.
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/aws/aws-lambda-go/events"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/provider"
)

// DBWriter persists delivery outcomes. Satisfied by *db.Client (via DBAdapter)
// and by MockDB in tests.
type DBWriter interface {
	UpdateRecipient(ctx context.Context, recipientID, status, externalID, failureReason string) error
	UpdateDispatchJob(ctx context.Context, recipientID, status string, attempts int) error
	IncrMessageCounter(ctx context.Context, messageID, column string, delta int) error
}

// Worker processes SQS delivery batches.
type Worker struct {
	registry *provider.Registry
	db       DBWriter
	log      *slog.Logger
}

// New creates a Worker.
func New(registry *provider.Registry, db DBWriter, log *slog.Logger) *Worker {
	return &Worker{registry: registry, db: db, log: log}
}

// ProcessBatch handles an SQS event, processes all records concurrently, and
// returns a PartialBatchFailureResponse identifying items that should be retried.
func (w *Worker) ProcessBatch(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	type result struct {
		sqsMessageID string
		err          error
	}

	results := make([]result, len(event.Records))
	var wg sync.WaitGroup

	for i, record := range event.Records {
		wg.Add(1)
		go func(idx int, rec events.SQSMessage) {
			defer wg.Done()
			err := w.processRecord(ctx, rec)
			results[idx] = result{sqsMessageID: rec.MessageId, err: err}
		}(i, record)
	}
	wg.Wait()

	var resp events.SQSEventResponse
	var delivered, failed int

	for _, r := range results {
		if r.err != nil {
			w.log.Error("record processing failed", "sqsMessageId", r.sqsMessageID, "error", r.err)
			resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{
				ItemIdentifier: r.sqsMessageID,
			})
			failed++
		} else {
			delivered++
		}
	}

	w.log.Info("batch complete",
		"total", len(event.Records),
		"delivered", delivered,
		"failed", failed,
	)

	return resp, nil
}

func (w *Worker) processRecord(ctx context.Context, record events.SQSMessage) error {
	var payload domain.DeliveryPayload
	if err := json.Unmarshal([]byte(record.Body), &payload); err != nil {
		return fmt.Errorf("unmarshal payload: %w", err)
	}

	if payload.RecipientID == "" || payload.MessageID == "" {
		return fmt.Errorf("payload missing recipientId or messageId")
	}

	if payload.Kind == "" {
		payload.Kind = "email"
	}

	p, ok := w.registry.Get(payload.Kind)
	if !ok {
		return fmt.Errorf("no provider for kind %q", payload.Kind)
	}

	externalID, sendErr := p.Send(ctx, payload)

	status := "delivered"
	failureReason := ""
	if sendErr != nil {
		status = "failed"
		failureReason = sendErr.Error()
		w.log.Warn("delivery failed",
			"recipientId", payload.RecipientID,
			"kind", payload.Kind,
			"error", sendErr,
		)
	} else {
		w.log.Info("delivery succeeded",
			"recipientId", payload.RecipientID,
			"kind", payload.Kind,
			"externalId", externalID,
		)
	}

	// Best-effort DB writes — never fail the SQS record due to DB issues.
	if err := w.db.UpdateRecipient(ctx, payload.RecipientID, status, externalID, failureReason); err != nil {
		w.log.Error("db update recipient failed", "recipientId", payload.RecipientID, "error", err)
	}
	_ = w.db.UpdateDispatchJob(ctx, payload.RecipientID, status, 1)

	counter := "delivered_count"
	if sendErr != nil {
		counter = "failed_count"
	}
	_ = w.db.IncrMessageCounter(ctx, payload.MessageID, counter, 1)

	// Re-surface send failure so Lambda retries the SQS record.
	return sendErr
}
