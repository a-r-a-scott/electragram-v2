// Package twilio provides Twilio webhook signature validation.
//
// Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
package twilio

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec — SHA-1 is mandated by Twilio's webhook spec
	"encoding/base64"
	"net/url"
	"sort"
)

// Validate reports whether the X-Twilio-Signature header value is valid for
// the given Twilio auth token, full request URL, and POST parameters.
//
// Algorithm (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
//  1. Start with the full request URL (including query string if any).
//  2. For POST requests, sort all parameters alphabetically (case-sensitive)
//     and append each key + value directly to the URL string.
//  3. Sign the resulting string with HMAC-SHA1 using the auth token as the key.
//  4. Base64-encode the result.
//  5. Compare with the X-Twilio-Signature header value (constant-time).
func Validate(authToken, fullURL string, params url.Values, signature string) bool {
	expected := Compute(authToken, fullURL, params)
	return hmac.Equal([]byte(expected), []byte(signature))
}

// Compute returns the expected Twilio webhook signature string for the given
// inputs. It is exported so that tests and the Messaging service can mint
// valid signatures when constructing tracked links.
func Compute(authToken, fullURL string, params url.Values) string {
	s := fullURL
	if len(params) > 0 {
		keys := make([]string, 0, len(params))
		for k := range params {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			s += k + params.Get(k)
		}
	}

	mac := hmac.New(sha1.New, []byte(authToken)) //nolint:gosec
	mac.Write([]byte(s))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
