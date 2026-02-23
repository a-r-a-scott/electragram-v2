package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/a-r-a-scott/electragram-v2/services/delivery/internal/domain"
)

// MockProvider is an in-memory Provider used in unit tests.
// It records all calls and can be configured to return errors.
type MockProvider struct {
	mu       sync.Mutex
	Sent     []domain.DeliveryPayload
	ErrorOn  map[string]error // recipientID → error to return
	IDPrefix string
}

func NewMockProvider(idPrefix string) *MockProvider {
	return &MockProvider{
		IDPrefix: idPrefix,
		ErrorOn:  make(map[string]error),
	}
}

func (m *MockProvider) Send(_ context.Context, payload domain.DeliveryPayload) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err, ok := m.ErrorOn[payload.RecipientID]; ok {
		return "", err
	}

	m.Sent = append(m.Sent, payload)
	return fmt.Sprintf("%s-%s", m.IDPrefix, payload.RecipientID), nil
}

func (m *MockProvider) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Sent = nil
	m.ErrorOn = make(map[string]error)
}

func (m *MockProvider) SentCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Sent)
}
