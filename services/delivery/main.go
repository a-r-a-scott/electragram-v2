package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type DeliveryMessage struct {
	MessageID   string `json:"messageId"`
	RecipientID string `json:"recipientId"`
	Channel     string `json:"channel"`
	Content     string `json:"content"`
}

func handler(ctx context.Context, sqsEvent events.SQSEvent) error {
	for _, record := range sqsEvent.Records {
		var msg DeliveryMessage
		if err := json.Unmarshal([]byte(record.Body), &msg); err != nil {
			log.Printf("error parsing message: %v", err)
			continue
		}
		log.Printf("processing delivery: messageID=%s channel=%s", msg.MessageID, msg.Channel)
		// TODO: implement delivery logic (SendGrid/Twilio)
	}
	return nil
}

func main() {
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		lambda.Start(handler)
	} else {
		log.Println("Delivery service running in local mode")
	}
}
