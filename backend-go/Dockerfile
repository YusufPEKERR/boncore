# ============================================================================
# Stage 1: Build Ultra-Lightweight Go Binary
# ============================================================================
FROM golang:1.24-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /out/boncore-pos-server ./cmd/server

# ============================================================================
# Stage 2: Minimal Production Runtime Image
# ============================================================================
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl
ENV TZ=Europe/Istanbul

WORKDIR /app
COPY --from=builder /out/boncore-pos-server /app/boncore-pos-server
COPY migrations /app/migrations

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/app/boncore-pos-server"]
