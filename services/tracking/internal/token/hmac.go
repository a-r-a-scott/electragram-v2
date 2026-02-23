// Package token provides HMAC-SHA256 signing and verification for tracking URLs.
// A signed token has the form:
//
//	<base64url(json_payload)>.<base64url(hmac_sha256(payload, secret))>
//
// Both segments use base64 raw URL encoding (no padding, URL-safe alphabet),
// which never contains "." — so "." is a safe, unambiguous separator.
package token

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/domain"
)

// ErrInvalidToken is returned when a token fails signature verification or
// cannot be decoded.
var ErrInvalidToken = errors.New("invalid tracking token")

// Sign marshals tok to JSON, base64url-encodes the result, and appends an
// HMAC-SHA256 signature over the encoded payload using secret.
// Returns a string of the form "<encoded>.<signature>".
func Sign(tok domain.TrackingToken, secret []byte) (string, error) {
	payload, err := json.Marshal(tok)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	sig := computeHMAC(encoded, secret)
	return encoded + "." + sig, nil
}

// Verify checks the HMAC signature on a signed token string and returns the
// decoded TrackingToken. Returns ErrInvalidToken if the signature is wrong,
// the format is invalid, or the payload cannot be decoded.
func Verify(signed string, secret []byte) (domain.TrackingToken, error) {
	encoded, sig, found := strings.Cut(signed, ".")
	if !found || encoded == "" || sig == "" {
		return domain.TrackingToken{}, ErrInvalidToken
	}

	expected := computeHMAC(encoded, secret)
	// Constant-time comparison to prevent timing attacks.
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return domain.TrackingToken{}, ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return domain.TrackingToken{}, ErrInvalidToken
	}

	var tok domain.TrackingToken
	if err := json.Unmarshal(payload, &tok); err != nil {
		return domain.TrackingToken{}, ErrInvalidToken
	}
	return tok, nil
}

// computeHMAC returns a base64url-encoded HMAC-SHA256 of data using secret.
func computeHMAC(data string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
