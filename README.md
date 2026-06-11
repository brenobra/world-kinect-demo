# Self-service "unblock website" → Cloudflare Gateway (demo)

Demonstrates a self-service operational workflow: a request goes through an
**approval gate**, then an **automated** change is applied to **Cloudflare Gateway** —
no one hand-edits firewall policies. Everything is auditable in version control.

## Flow

```
GitHub Issue (Issue Form: domain, scope, justification)
   -> Actions workflow parses the form
   -> "production" environment pauses for approver sign-off   (approval gate)
   -> workflow POSTs the request to the Cloudflare Worker      (middleware)
   -> Worker appends the domain to a Gateway DOMAIN list
   -> Gateway "allow" policy (Terraform) references that list  (enforcement)
   -> workflow comments the result back on the issue + closes it
```

The **payload contract** (`test/sample-payload.json`) is identical whether the
sender is GitHub Actions or the customer's real JSM — only the sender changes.

## Architecture: policy as code, data via automation
- **Policy logic = Terraform** (`terraform/gateway.tf`): the allow policy + list. Static, reviewed, in Git.
- **Per-ticket data = list contents**: the Worker adds approved domains. The policy never changes.

## Components
| Path | What |
|------|------|
| `worker/` | Cloudflare Worker — validates secret, appends domain to the Gateway list |
| `.github/ISSUE_TEMPLATE/unblock-website.yml` | Structured intake form |
| `.github/workflows/unblock.yml` | Parse → approval gate → call Worker → comment back |
| `terraform/gateway.tf` | Gateway DOMAIN list + allow policy (IaC) |
| `scripts/bootstrap-gateway.sh` | Create the list + policy via API (if no Terraform) |
| `test/` | Sample payload + `send-test.sh` to exercise the Worker without GitHub/JSM |

## Setup

### 1. Create the Gateway list + policy
With Terraform:
```bash
cd terraform
export CLOUDFLARE_API_TOKEN=...      # Account > Zero Trust/Gateway: Edit
terraform init
terraform apply -var account_id=YOUR_ACCOUNT_ID
# note the gateway_list_id output
```
Or without Terraform:
```bash
CF_API_TOKEN=... CF_ACCOUNT_ID=... ./scripts/bootstrap-gateway.sh
```

### 2. Configure + run the Worker locally
```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # fill in CF_API_TOKEN, SHARED_SECRET, CF_ACCOUNT_ID, GATEWAY_LIST_ID
npm run dev                      # http://localhost:8787
```

### 3. Test end-to-end without GitHub/JSM
```bash
WORKER_URL=http://localhost:8787 SHARED_SECRET=local-dev-secret ./test/send-test.sh
```
Then watch the domain appear in **Zero Trust → Gateway → Lists → Approved Unblocks**.

### 4. Deploy the Worker + wire GitHub
```bash
cd worker
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put SHARED_SECRET
npx wrangler deploy
```
In the GitHub repo:
- **Settings → Environments → New environment `production`** → add yourself as a **required reviewer** (the approval gate).
- **Settings → Secrets and variables → Actions**: add `WORKER_URL` (deployed Worker URL) and `SHARED_SECRET` (same value as the Worker secret).

Open an issue using the "Unblock Website Request" form, approve the run, and the
domain lands in Gateway with a comment back on the issue.

## Notes
- `scope=team` + `targetGroup` is where group-targeted enforcement plugs in
  (map the list/policy to an IdP group). The contract already carries it.
- DNS-filter policy is used for the demo; swap to an HTTP policy if isolating on URL paths.
