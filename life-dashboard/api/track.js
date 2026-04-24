/**
 * POST /api/track
 * Body: { event: "form_copy" | "csv_upload" | "return_visit", visitor_id?: string }
 *
 * Increments counters in Upstash Redis for each event.
 * For return_visit, also deduplicates by visitor_id using a Redis Set.
 *
 * Setup:
 *   1. vercel.com → your project → Storage → Connect Store → Create Upstash Redis DB
 *   2. Vercel auto-injects UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *   3. No npm install needed — uses the Upstash HTTP REST API directly
 */

const ALLOWED_EVENTS = ["form_copy", "csv_upload", "return_visit"];

// Minimal Upstash Redis REST client — no SDK required
async function redis(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL/KV_REST_API_URL and UPSTASH_REDIS_REST_TOKEN/KV_REST_API_TOKEN not set");
  }

  const res = await fetch(
    `${url}/${[command, ...args.map(a => encodeURIComponent(a))].join("/")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CORS — set ALLOWED_ORIGIN env var to your deployed URL in production
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { event, visitor_id } = req.body || {};

  // Validate event against allowlist — never trust client input
  if (!event || !ALLOWED_EVENTS.includes(event)) {
    return res.status(400).json({ error: "Invalid event" });
  }

  // Validate visitor_id — must be a UUID if provided
  const safeVisitorId =
    typeof visitor_id === "string" && /^[0-9a-f-]{36}$/.test(visitor_id)
      ? visitor_id
      : null;

  try {
    // Increment the global counter for this event
    // Redis key format: "count:{event}"  e.g. "count:form_copy"
    const newCount = await redis("INCR", `count:${event}`);

    // For return_visit: deduplicate visitors via a Redis Set
    // SADD returns 1 if the member is new, 0 if it already existed
    let isNewVisitor = null;
    if (event === "return_visit" && safeVisitorId) {
      const added = await redis("SADD", "visitors:return", safeVisitorId);
      isNewVisitor = added === 1;
      if (isNewVisitor) {
        await redis("INCR", "count:unique_return_visitors");
      }
    }

    return res.status(200).json({
      ok: true,
      event,
      count: newCount,
      ...(isNewVisitor !== null && { is_new_visitor: isNewVisitor }),
    });
  } catch (err) {
    console.error("Upstash error:", err.message);
    // Fail silently — tracking must never break the app
    return res.status(200).json({ ok: false, error: "Tracking unavailable" });
  }
}
