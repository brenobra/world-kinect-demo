/**
 * JSM/GitHub → Cloudflare Gateway middleware (demo).
 *
 * Receives an approved "unblock website" request (from GitHub Actions or JSM),
 * validates a shared secret, then appends the domain to a Cloudflare Gateway
 * DOMAIN list. A Gateway "allow" policy (managed in Terraform) references that
 * list, so the approved domain is enforced without anyone hand-editing policies.
 */

export interface Env {
  CF_API_TOKEN: string; // secret — Account › Zero Trust / Gateway: Edit
  SHARED_SECRET: string; // secret — must match the sender's X-Auth-Token header
  CF_ACCOUNT_ID: string; // var
  GATEWAY_LIST_ID: string; // var — the "Approved Unblocks" DOMAIN list
}

interface UnblockRequest {
  ticketKey?: string;
  summary?: string;
  requester?: string;
  domain: string;
  scope?: "me" | "team";
  targetGroup?: string;
  justification?: string;
  approvedBy?: string;
  approvedAt?: string;
}

const CF_API = "https://api.cloudflare.com/client/v4";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // 1. Authenticate the caller (only our GitHub/JSM sender knows the secret).
    const token = request.headers.get("X-Auth-Token");
    if (!env.SHARED_SECRET || token !== env.SHARED_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 2. Parse the payload (the contract defined in test/sample-payload.json).
    let body: UnblockRequest;
    try {
      body = await request.json<UnblockRequest>();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const domain = (body.domain || "").trim().toLowerCase();
    if (!isValidDomain(domain)) {
      return json({ error: `Invalid domain: "${body.domain}"` }, 422);
    }

    const scope: "me" | "team" = body.scope === "team" ? "team" : "me";
    const ref = body.ticketKey || "manual";

    // Build an audit description so each list entry traces back to its ticket.
    const description = buildDescription(body, scope, ref);

    // 3. Append the approved domain to the Gateway DOMAIN list.
    const cfRes = await fetch(
      `${CF_API}/accounts/${env.CF_ACCOUNT_ID}/gateway/lists/${env.GATEWAY_LIST_ID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ append: [{ value: domain, description }] }),
      },
    );

    const cfData = (await cfRes.json()) as { success?: boolean };
    if (!cfRes.ok || cfData.success === false) {
      // Log full detail server-side (visible in `wrangler tail`), but don't
      // leak Cloudflare internals (account/list IDs, raw errors) back to the
      // caller — the workflow echoes this response into a public issue.
      console.error("Cloudflare API error", { ref, domain, status: cfRes.status, details: cfData });
      return json({ error: "Cloudflare API error", ref, domain }, 502);
    }

    // 4. Report back. (Group-scoped enforcement is a policy concern; see README.)
    return json({
      ok: true,
      ref,
      domain,
      scope,
      targetGroup: body.targetGroup || null,
      description,
      message: `Added "${domain}" to the approved-unblock list (scope=${scope}, ref=${ref}).`,
    });
  },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidDomain(d: string): boolean {
  if (!d || d.length > 253) return false;
  return /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(d);
}

/**
 * Audit string stored on each Gateway list entry, e.g.:
 *   "GH-2 | team:Finance-Team | by approver@example.com | 2026-06-10"
 * Gateway list item descriptions are limited, so keep it compact.
 */
function buildDescription(
  body: UnblockRequest,
  scope: "me" | "team",
  ref: string,
): string {
  const who = scope === "team" && body.targetGroup ? `team:${body.targetGroup}` : scope;
  const by = body.approvedBy || body.requester || "unknown";
  const when = (body.approvedAt || new Date().toISOString()).slice(0, 10);
  return `${ref} | ${who} | by ${by} | ${when}`.slice(0, 255);
}
