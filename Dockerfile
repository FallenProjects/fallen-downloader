FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/downloader .

FROM alpine:3.22

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder /app/downloader ./downloader
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

USER app

#EXPOSE 8080

CMD ["./downloader"]
