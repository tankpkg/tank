FROM golang:1.24-alpine AS gosu-builder
RUN go install -ldflags '-s -w' github.com/tianon/gosu@latest

FROM redis:7.4.8-alpine3.21
COPY --from=gosu-builder /go/bin/gosu /usr/local/bin/gosu
RUN chmod +x /usr/local/bin/gosu && gosu nobody true
