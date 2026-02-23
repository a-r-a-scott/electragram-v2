package token_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/domain"
	"github.com/a-r-a-scott/electragram-v2/services/tracking/internal/token"
)

var testSecret = []byte("test-hmac-secret-for-unit-tests")

func makeToken(kind string) domain.TrackingToken {
	return domain.TrackingToken{
		RecipientID: "rcp_testrecipient",
		MessageID:   "msg_testmessage",
		Kind:        kind,
	}
}

// ── Sign ──────────────────────────────────────────────────────────────────────

func TestSign_ProducesTwoPartFormat(t *testing.T) {
	signed, err := token.Sign(makeToken(domain.KindOpen), testSecret)
	require.NoError(t, err)

	parts := strings.SplitN(signed, ".", 2)
	assert.Len(t, parts, 2, "expected <encoded>.<signature> format")
	assert.NotEmpty(t, parts[0], "payload segment should not be empty")
	assert.NotEmpty(t, parts[1], "signature segment should not be empty")
}

func TestSign_IsDeterministic(t *testing.T) {
	tok := makeToken(domain.KindOpen)
	s1, err1 := token.Sign(tok, testSecret)
	s2, err2 := token.Sign(tok, testSecret)
	require.NoError(t, err1)
	require.NoError(t, err2)
	assert.Equal(t, s1, s2, "same input + same secret should always produce same token")
}

func TestSign_DifferentSecretsProduceDifferentTokens(t *testing.T) {
	tok := makeToken(domain.KindOpen)
	s1, _ := token.Sign(tok, []byte("secret-A"))
	s2, _ := token.Sign(tok, []byte("secret-B"))
	assert.NotEqual(t, s1, s2)
}

func TestSign_DifferentKindsProduceDifferentTokens(t *testing.T) {
	open, _ := token.Sign(makeToken(domain.KindOpen), testSecret)
	click, _ := token.Sign(makeToken(domain.KindClick), testSecret)
	unsub, _ := token.Sign(makeToken(domain.KindUnsubscribe), testSecret)
	assert.NotEqual(t, open, click)
	assert.NotEqual(t, open, unsub)
	assert.NotEqual(t, click, unsub)
}

func TestSign_NoDotsInSegments(t *testing.T) {
	// base64url encoding must not contain "." — verify the assumption
	signed, _ := token.Sign(makeToken(domain.KindClick), testSecret)
	// There should be exactly one "."
	assert.Equal(t, 1, strings.Count(signed, "."),
		"signed token should contain exactly one dot separator")
}

// ── Verify ────────────────────────────────────────────────────────────────────

func TestVerify_ValidOpenToken(t *testing.T) {
	original := makeToken(domain.KindOpen)
	signed, err := token.Sign(original, testSecret)
	require.NoError(t, err)

	got, err := token.Verify(signed, testSecret)
	require.NoError(t, err)
	assert.Equal(t, original.RecipientID, got.RecipientID)
	assert.Equal(t, original.MessageID, got.MessageID)
	assert.Equal(t, original.Kind, got.Kind)
	assert.Empty(t, got.URL)
}

func TestVerify_ValidClickTokenWithURL(t *testing.T) {
	original := domain.TrackingToken{
		RecipientID: "rcp_abc",
		MessageID:   "msg_xyz",
		Kind:        domain.KindClick,
		URL:         "https://example.com/landing?ref=email&campaign=spring",
	}
	signed, err := token.Sign(original, testSecret)
	require.NoError(t, err)

	got, err := token.Verify(signed, testSecret)
	require.NoError(t, err)
	assert.Equal(t, original.URL, got.URL)
}

func TestVerify_ValidUnsubscribeToken(t *testing.T) {
	original := makeToken(domain.KindUnsubscribe)
	signed, _ := token.Sign(original, testSecret)

	got, err := token.Verify(signed, testSecret)
	require.NoError(t, err)
	assert.Equal(t, domain.KindUnsubscribe, got.Kind)
}

func TestVerify_WrongSecret(t *testing.T) {
	signed, _ := token.Sign(makeToken(domain.KindOpen), testSecret)
	_, err := token.Verify(signed, []byte("wrong-secret"))
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_TamperedPayload(t *testing.T) {
	signed, _ := token.Sign(makeToken(domain.KindOpen), testSecret)
	// Replace the payload with garbage, keep the (now invalid) signature
	parts := strings.SplitN(signed, ".", 2)
	tampered := "dGFtcGVyZWQtcGF5bG9hZA" + "." + parts[1]
	_, err := token.Verify(tampered, testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_TamperedSignature(t *testing.T) {
	signed, _ := token.Sign(makeToken(domain.KindOpen), testSecret)
	parts := strings.SplitN(signed, ".", 2)
	tampered := parts[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	_, err := token.Verify(tampered, testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_MissingDotSeparator(t *testing.T) {
	_, err := token.Verify("nodothere", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_EmptyString(t *testing.T) {
	_, err := token.Verify("", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_OnlyDot(t *testing.T) {
	_, err := token.Verify(".", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_EmptyPayloadSegment(t *testing.T) {
	_, err := token.Verify(".somesignature", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_EmptySignatureSegment(t *testing.T) {
	_, err := token.Verify("somepayload.", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_InvalidBase64Payload(t *testing.T) {
	// The signature doesn't matter — base64 decode will fail first
	_, err := token.Verify("!!!invalid-base64!!!.somesig", testSecret)
	assert.ErrorIs(t, err, token.ErrInvalidToken)
}

func TestVerify_AllKindsRoundTrip(t *testing.T) {
	for _, kind := range []string{domain.KindOpen, domain.KindClick, domain.KindUnsubscribe} {
		kind := kind
		t.Run(kind, func(t *testing.T) {
			tok := makeToken(kind)
			signed, err := token.Sign(tok, testSecret)
			require.NoError(t, err)

			got, err := token.Verify(signed, testSecret)
			require.NoError(t, err)
			assert.Equal(t, kind, got.Kind)
			assert.Equal(t, tok.RecipientID, got.RecipientID)
			assert.Equal(t, tok.MessageID, got.MessageID)
		})
	}
}
