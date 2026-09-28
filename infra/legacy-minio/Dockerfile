# Compatibility bridge for existing MinIO volumes only. Upstream is archived.
# New local installations use SeaweedFS on a NEW volume; never reuse MinIO's /data.
FROM golang:1.24.8-alpine AS builder
RUN apk add --no-cache git
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
FROM alpine:3.23
RUN apk add --no-cache ca-certificates curl
COPY --from=builder /out/minio /usr/local/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
