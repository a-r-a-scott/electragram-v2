package domain

// DeliveryPayload is the SQS message body published by the Messaging Service.
type DeliveryPayload struct {
	MessageID   string  `json:"messageId"`
	RecipientID string  `json:"recipientId"`
	AccountID   string  `json:"accountId"`
	Kind        string  `json:"kind"` // email | sms | whatsapp
	To          string  `json:"to"`
	Subject     string  `json:"subject"`
	Body        string  `json:"body"`
	BodyHTML    *string `json:"bodyHtml"`
	FromName    *string `json:"fromName"`
	FromEmail   *string `json:"fromEmail"`
	ReplyTo     *string `json:"replyTo"`
	FirstName   *string `json:"firstName"`
	LastName    *string `json:"lastName"`
}

// DeliveryResult captures the outcome for a single recipient.
type DeliveryResult struct {
	RecipientID  string
	MessageID    string
	Success      bool
	ExternalID   string // provider message ID (e.g. SendGrid X-Message-Id)
	FailureReason string
}

// BatchResult summarises a full SQS batch.
type BatchResult struct {
	Delivered int
	Failed    int
	Skipped   int
}
