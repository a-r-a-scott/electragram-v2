// Package provider defines the Provider interface and the registry used to
// select the correct sending backend (email vs SMS vs WhatsApp).
package provider

import (
	"context"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
)

// Provider sends a single delivery payload and returns an external ID or error.
type Provider interface {
	Send(ctx context.Context, payload domain.DeliveryPayload) (externalID string, err error)
}

// Registry maps channel kinds to their concrete Provider implementations.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry creates a Registry with the supplied kind→provider mappings.
func NewRegistry(m map[string]Provider) *Registry {
	return &Registry{providers: m}
}

// Get returns the Provider for the given kind, or (nil, false) if unknown.
func (r *Registry) Get(kind string) (Provider, bool) {
	p, ok := r.providers[kind]
	return p, ok
}
