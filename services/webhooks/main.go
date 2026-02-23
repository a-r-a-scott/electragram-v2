package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log.Printf("webhook received: path=%s", req.Path)
	// TODO: validate Twilio signature, route to SQS
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
		Headers:    map[string]string{"Content-Type": "text/xml"},
	}, nil
}

func main() {
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		lambda.Start(handler)
	} else {
		log.Println("Webhooks service running in local mode")
	}
}
