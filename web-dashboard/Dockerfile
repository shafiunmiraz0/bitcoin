FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o dashboard .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/dashboard .
EXPOSE 3000
CMD ["./dashboard"]
