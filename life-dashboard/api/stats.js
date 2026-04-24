/**
 * GET /api/stats?secret=YOUR_STATS_SECRET
 *
 * Returns all tracking counters from Upstash Redis.
 * Protected by a secret query param — set STATS_SECRET in Vercel env vars.
 *
 * Example response:
 * {
 *   "form_copies": 42,
 *   "csv_uploads": 118,
 *   "return_visits": 310,
 *   "unique_return_visitors": 67,
 *   "generated_at": "2026-04-10T10:00:00.000Z"
 * }
 *
 * Hit it in your browser:
 *   https://your-app.vercel.app/api/stats?secret=YOUR_STATS_SECRET
 */

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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Secret protection — set STATS_SECRET in Vercel env vars
  const secret = process.env.STATS_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Fetch all counters in parallel and tolerate partial failures.
    const results = await Promise.allSettled([
      redis("GET", "count:form_copy"),
      redis("GET", "count:csv_upload"),
      redis("GET", "count:return_visit"),
      redis("GET", "count:unique_return_visitors"),
    ]);

    const keys = [
      "count:form_copy",
      "count:csv_upload",
      "count:return_visit",
      "count:unique_return_visitors",
    ];

    const toInt = (result, keyName) => {
      if (result.status === "fulfilled") {
        return parseInt(result.value, 10) || 0;
      }

      console.error(`Upstash key read failed (${keyName}):`, result.reason?.message || result.reason);
      return 0;
    };

    const [formCopies, csvUploads, returnVisits, uniqueReturnVisitors] = results.map((result, i) =>
      toInt(result, keys[i])
    );

    return res.status(200).json({
      form_copies: formCopies,
      csv_uploads: csvUploads,
      return_visits: returnVisits,
      unique_return_visitors: uniqueReturnVisitors,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Upstash error:", err.message);
    return res.status(500).json({ error: "Could not fetch stats" });
  }
}
