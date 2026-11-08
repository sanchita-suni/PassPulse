#!/usr/bin/env bash
# Creates a self-signed certificate for local HTTPS (SEC-004).
# Output: deploy/certs/passpulse.crt and passpulse.key (git-ignored).
# Run from the repository root:  bash scripts/gen-dev-cert.sh
# For a real deployment, put a CA-issued certificate at the same paths.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/deploy/certs"
mkdir -p "$DIR"

MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout "$DIR/passpulse.key" -out "$DIR/passpulse.crt" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Certificate written to $DIR"
