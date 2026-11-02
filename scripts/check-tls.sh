#!/usr/bin/env bash
# Verifies SEC-004 / TC-SEC-03 against the running proxy.
# Usage: bash scripts/check-tls.sh [host]   (default: localhost)
HOST="${1:-localhost}"
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); }

if curl -sk --tlsv1.3 -o /dev/null "https://$HOST/api/health"; then ok "TLS 1.3 connection accepted"; else bad "TLS 1.3 connection refused"; fi

if curl -sk --tlsv1.2 --tls-max 1.2 -o /dev/null "https://$HOST/api/health" 2>/dev/null; then
  bad "TLS 1.2 connection was accepted"
else
  ok "TLS 1.2 connection rejected"
fi

code=$(curl -s -o /dev/null -w "%{http_code}" "http://$HOST/api/health")
loc=$(curl -s -o /dev/null -w "%{redirect_url}" "http://$HOST/api/health")
if [ "$code" = "301" ] && [[ "$loc" == https://* ]]; then ok "HTTP redirects to HTTPS ($code -> $loc)"; else bad "HTTP returned $code"; fi

if curl -sk -D - -o /dev/null "https://$HOST/" | grep -qi "strict-transport-security"; then ok "HSTS header present"; else bad "HSTS header missing"; fi

body=$(curl -sk "https://$HOST/api/health")
if [[ "$body" == *success* ]]; then ok "API reachable through proxy"; else bad "API not reachable: $body"; fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
