terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth via env var: export CLOUDFLARE_API_TOKEN=...
provider "cloudflare" {}

variable "account_id" {
  type        = string
  description = "Cloudflare account ID (sandbox)."
}

# The dynamic data: approved domains flow into this list via the Worker.
resource "cloudflare_zero_trust_list" "approved_unblocks" {
  account_id  = var.account_id
  name        = "Approved Unblocks"
  type        = "DOMAIN"
  description = "Domains approved via the unblock workflow. Managed contents."
}

# The static policy logic (IaC source of truth). Never hand-edited.
resource "cloudflare_zero_trust_gateway_policy" "allow_approved" {
  account_id  = var.account_id
  name        = "Allow approved unblocks"
  description = "Allows domains present in the Approved Unblocks list."
  enabled     = true
  action      = "allow"
  precedence  = 100
  filters     = ["dns"]
  traffic     = format("any(dns.domains[*] in $%s)", cloudflare_zero_trust_list.approved_unblocks.id)
}

output "gateway_list_id" {
  value       = cloudflare_zero_trust_list.approved_unblocks.id
  description = "Set this as GATEWAY_LIST_ID in the Worker config."
}
