#!/usr/bin/env bash
# One-time setup: creates the "Approved Unblocks" Gateway DOMAIN list and an
# allow policy that references it. Use this if you don't have Terraform installed.
# (The terraform/ dir is the IaC source-of-truth equivalent.)
#
# Usage:
#   CF_API_TOKEN=xxx CF_ACCOUNT_ID=yyy ./scripts/bootstrap-gateway.sh
set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN (Account > Zero Trust/Gateway: Edit)}"
: "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}"
API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}"

echo "==> Creating Gateway DOMAIN list 'Approved Unblocks'..."
LIST_ID=$(curl -sS -X POST "${API}/gateway/lists" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Approved Unblocks","description":"Domains approved via the unblock workflow","type":"DOMAIN","items":[]}' \
  | jq -r '.result.id')
echo "    list id: ${LIST_ID}"

echo "==> Creating Gateway allow policy referencing the list..."
RULE_ID=$(curl -sS -X POST "${API}/gateway/rules" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Allow approved unblocks\",\"description\":\"Allows domains approved via the unblock workflow\",\"action\":\"allow\",\"enabled\":true,\"precedence\":100,\"filters\":[\"dns\"],\"traffic\":\"any(dns.domains[*] in \$${LIST_ID})\"}" \
  | jq -r '.result.id')
echo "    rule id: ${RULE_ID}"

echo
echo "Done. Set this in worker config (wrangler.jsonc vars or .dev.vars):"
echo "    GATEWAY_LIST_ID=${LIST_ID}"
