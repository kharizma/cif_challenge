FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.20
# ca-certificates: HTTPS calls to Beeceptor. tzdata: timestamptz formatting.
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/migrate /app/migrate
COPY migrations /app/migrations
EXPOSE 8080
CMD ["/app/api"]
