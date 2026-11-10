FROM debian:bookworm-slim

ARG MINIO_VERSION=RELEASE.2025-04-22T22-12-26Z
ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL -o /usr/local/bin/minio \
    "https://github.com/minio/minio/releases/download/${MINIO_VERSION}/minio.linux-amd64.${MINIO_VERSION}" \
  && curl -fsSL -o /usr/local/bin/mc \
    "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-amd64.${MC_VERSION}" \
  && chmod +x /usr/local/bin/minio /usr/local/bin/mc \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
