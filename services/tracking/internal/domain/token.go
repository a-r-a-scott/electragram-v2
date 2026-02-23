// Package domain defines the tracking token payload shared between the
// Messaging service (token minting at dispatch time) and the Tracking Lambda
// (token verification at request time).
package domain

// Tracking event kind constants embedded in every token.
const (
	KindOpen        = "o"
	KindClick       = "c"
	KindUnsubscribe = "u"
)

// TrackingToken is the payload embedded in every tracking URL.
// It is JSON-marshalled, base64url-encoded, and HMAC-SHA256 signed by the
// Messaging service; verified by the Tracking Lambda on each request.
type TrackingToken struct {
	RecipientID string `json:"r"`
	MessageID   string `json:"m"`
	Kind        string `json:"k"` // KindOpen | KindClick | KindUnsubscribe
	// URL is the destination for click tokens. Empty for open/unsubscribe tokens.
	URL string `json:"u,omitempty"`
}
