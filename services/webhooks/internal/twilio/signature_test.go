package twilio_test

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/a-r-a-scott/electragram-v2/services/webhooks/internal/twilio"
)

const (
	testAuthToken = "test-twilio-auth-token"
	testURL       = "https://api.electragram.io/hooks/twilio/abc123"
)

func smsParams() url.Values {
	return url.Values{
		"AccountSid": {"ACxxxx"},
		"MessageSid": {"SMxxxx"},
		"From":       {"+15551234567"},
		"To":         {"+15550000001"},
		"Body":       {"Hello there"},
	}
}

// ── Compute ───────────────────────────────────────────────────────────────────

func TestCompute_ReturnsDeterministicSignature(t *testing.T) {
	s1 := twilio.Compute(testAuthToken, testURL, smsParams())
	s2 := twilio.Compute(testAuthToken, testURL, smsParams())
	assert.Equal(t, s1, s2)
}

func TestCompute_DifferentAuthTokensProduceDifferentSignatures(t *testing.T) {
	s1 := twilio.Compute("token-A", testURL, smsParams())
	s2 := twilio.Compute("token-B", testURL, smsParams())
	assert.NotEqual(t, s1, s2)
}

func TestCompute_DifferentURLsProduceDifferentSignatures(t *testing.T) {
	s1 := twilio.Compute(testAuthToken, "https://example.com/a", smsParams())
	s2 := twilio.Compute(testAuthToken, "https://example.com/b", smsParams())
	assert.NotEqual(t, s1, s2)
}

func TestCompute_DifferentParamsProduceDifferentSignatures(t *testing.T) {
	p1 := smsParams()
	p2 := smsParams()
	p2.Set("Body", "Different body")
	s1 := twilio.Compute(testAuthToken, testURL, p1)
	s2 := twilio.Compute(testAuthToken, testURL, p2)
	assert.NotEqual(t, s1, s2)
}

func TestCompute_NoParams_SignsURLOnly(t *testing.T) {
	// Should not panic or error with empty params
	sig := twilio.Compute(testAuthToken, testURL, url.Values{})
	assert.NotEmpty(t, sig)
}

func TestCompute_NilParams_SignsURLOnly(t *testing.T) {
	sig := twilio.Compute(testAuthToken, testURL, nil)
	assert.NotEmpty(t, sig)
}

func TestCompute_ParamsSortedAlphabetically(t *testing.T) {
	// Twilio spec: params must be sorted; verify by checking two differently
	// ordered sets of params produce the same signature.
	p1 := url.Values{
		"AccountSid": {"AC1"},
		"Body":       {"hi"},
		"From":       {"+1"},
	}
	p2 := url.Values{
		"From":       {"+1"},
		"AccountSid": {"AC1"},
		"Body":       {"hi"},
	}
	s1 := twilio.Compute(testAuthToken, testURL, p1)
	s2 := twilio.Compute(testAuthToken, testURL, p2)
	assert.Equal(t, s1, s2, "param order must not affect signature")
}

// ── Validate ──────────────────────────────────────────────────────────────────

func TestValidate_CorrectSignature_ReturnsTrue(t *testing.T) {
	params := smsParams()
	sig := twilio.Compute(testAuthToken, testURL, params)
	assert.True(t, twilio.Validate(testAuthToken, testURL, params, sig))
}

func TestValidate_WrongAuthToken_ReturnsFalse(t *testing.T) {
	params := smsParams()
	sig := twilio.Compute(testAuthToken, testURL, params)
	assert.False(t, twilio.Validate("wrong-token", testURL, params, sig))
}

func TestValidate_WrongURL_ReturnsFalse(t *testing.T) {
	params := smsParams()
	sig := twilio.Compute(testAuthToken, testURL, params)
	assert.False(t, twilio.Validate(testAuthToken, "https://evil.com/hooks", params, sig))
}

func TestValidate_TamperedParams_ReturnsFalse(t *testing.T) {
	params := smsParams()
	sig := twilio.Compute(testAuthToken, testURL, params)
	params.Set("Body", "tampered")
	assert.False(t, twilio.Validate(testAuthToken, testURL, params, sig))
}

func TestValidate_EmptySignature_ReturnsFalse(t *testing.T) {
	params := smsParams()
	assert.False(t, twilio.Validate(testAuthToken, testURL, params, ""))
}

func TestValidate_MangledSignature_ReturnsFalse(t *testing.T) {
	params := smsParams()
	assert.False(t, twilio.Validate(testAuthToken, testURL, params, "AAAAAAAAAAAAAAAAAAA="))
}

func TestValidate_NoParams_RoundTrip(t *testing.T) {
	sig := twilio.Compute(testAuthToken, testURL, nil)
	assert.True(t, twilio.Validate(testAuthToken, testURL, nil, sig))
}
