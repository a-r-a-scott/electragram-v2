// Package sqs provides a Publisher abstraction for forwarding webhook events
// to AWS SQS queues.
//
// The real Client uses the SQS HTTP API signed with AWS Signature Version 4 via
// the standard library only — no external SDK required. Credentials are read
// from the standard Lambda environment variables (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN).
package sqs

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Publisher sends a message body to an SQS queue URL.
type Publisher interface {
	Publish(ctx context.Context, queueURL, body string) error
}

// ── Real AWS client (stdlib only, Sig V4) ─────────────────────────────────────

// Client is a real AWS SQS publisher that signs requests with AWS Signature V4.
// Credentials are sourced from the environment at creation time; in Lambda the
// runtime injects them automatically.
type Client struct {
	region    string
	accessKey string
	secretKey string
	token     string // session token (required in Lambda)
	http      *http.Client
}

// New creates a Client for the given region using credentials from the
// standard AWS Lambda environment variables.
func New(region string) *Client {
	return &Client{
		region:    region,
		accessKey: os.Getenv("AWS_ACCESS_KEY_ID"),
		secretKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		token:     os.Getenv("AWS_SESSION_TOKEN"),
		http:      &http.Client{Timeout: 10 * time.Second},
	}
}

// Publish sends body as an SQS SendMessage request to queueURL.
func (c *Client) Publish(ctx context.Context, queueURL, body string) error {
	params := url.Values{
		"Action":      {"SendMessage"},
		"MessageBody": {body},
		"Version":     {"2012-11-05"},
	}
	payload := params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, queueURL, strings.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build sqs request: %w", err)
	}

	now := time.Now().UTC()
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", now.Format("20060102T150405Z"))
	if c.token != "" {
		req.Header.Set("X-Amz-Security-Token", c.token)
	}

	req.Header.Set("Authorization", c.authHeader(req, payload, now))

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("sqs send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("sqs send: status %d: %s", resp.StatusCode, raw)
	}
	return nil
}

// authHeader builds the AWS Signature V4 Authorization header value.
// Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
func (c *Client) authHeader(req *http.Request, payload string, t time.Time) string {
	dateStamp := t.Format("20060102")
	amzDate := t.Format("20060102T150405Z")
	scope := strings.Join([]string{dateStamp, c.region, "sqs", "aws4_request"}, "/")

	// ── Canonical request ─────────────────────────────────────────────────────
	// Signed headers — we sign Host, Content-Type, and X-Amz-* headers.
	signedHeaderNames := []string{"content-type", "host", "x-amz-date"}
	if c.token != "" {
		signedHeaderNames = append(signedHeaderNames, "x-amz-security-token")
	}
	sort.Strings(signedHeaderNames)

	var canonHeaders strings.Builder
	for _, h := range signedHeaderNames {
		canonHeaders.WriteString(h)
		canonHeaders.WriteByte(':')
		canonHeaders.WriteString(strings.TrimSpace(req.Header.Get(http.CanonicalHeaderKey(h))))
		canonHeaders.WriteByte('\n')
	}
	signedHeaders := strings.Join(signedHeaderNames, ";")

	payloadHash := sha256hex(payload)
	canonReq := strings.Join([]string{
		req.Method,
		req.URL.EscapedPath(),
		req.URL.RawQuery,
		canonHeaders.String(),
		signedHeaders,
		payloadHash,
	}, "\n")

	// ── String to sign ────────────────────────────────────────────────────────
	strToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256hex(canonReq),
	}, "\n")

	// ── Signing key ───────────────────────────────────────────────────────────
	signingKey := hmacSHA256(
		hmacSHA256(
			hmacSHA256(
				hmacSHA256([]byte("AWS4"+c.secretKey), dateStamp),
				c.region,
			),
			"sqs",
		),
		"aws4_request",
	)

	signature := hex.EncodeToString(hmacSHA256(signingKey, strToSign))

	return fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.accessKey, scope, signedHeaders, signature,
	)
}

// sha256hex returns the lowercase hex-encoded SHA-256 hash of s.
func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// hmacSHA256 computes HMAC-SHA256(key, data) and returns the raw bytes.
func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

// ── Mock for tests ────────────────────────────────────────────────────────────

// MockPublisher is an in-memory Publisher for unit tests. Safe for concurrent use.
type MockPublisher struct {
	mu       sync.Mutex
	Messages []Message
	Err      error
}

// Message records a single Publish call.
type Message struct {
	QueueURL string
	Body     string
}

// Publish records the call without actually contacting AWS.
func (m *MockPublisher) Publish(_ context.Context, queueURL, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.Messages = append(m.Messages, Message{QueueURL: queueURL, Body: body})
	return nil
}

// Reset clears recorded messages and the configured error.
func (m *MockPublisher) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Messages = nil
	m.Err = nil
}
