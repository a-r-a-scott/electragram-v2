# syntax=docker/dockerfile:1

# ── build ─────────────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bootstrap .

# ── production ────────────────────────────────────────────────────────────────
FROM public.ecr.aws/lambda/provided:al2023 AS production
COPY --from=build /app/bootstrap ${LAMBDA_RUNTIME_DIR}/bootstrap
CMD ["bootstrap"]
