package main

import (
	"context"
	"encoding/base64"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// 1x1 transparent GIF
var transparentGIF, _ = base64.StdEncoding.DecodeString("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")

func handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := req.Path
	log.Printf("tracking request: %s", path)

	switch {
	case len(path) > 11 && path[:11] == "/track/open":
		// TODO: async record open
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusOK,
			Headers: map[string]string{
				"Content-Type":  "image/gif",
				"Cache-Control": "no-cache, no-store",
			},
			Body:            base64.StdEncoding.EncodeToString(transparentGIF),
			IsBase64Encoded: true,
		}, nil

	case len(path) > 9 && path[:9] == "/track/go":
		// TODO: async record click, get real URL
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusFound,
			Headers:    map[string]string{"Location": "https://electragram.com"},
		}, nil
	}

	return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound}, nil
}

func main() {
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		lambda.Start(handler)
	} else {
		log.Println("Tracking service running in local mode")
	}
}
