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
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set");

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
    // Fetch all counters in parallel
    const [formCopies, csvUploads, returnVisits, uniqueReturnVisitors] = await Promise.all([
      redis("GET", "count:form_copy"),
      redis("GET", "count:csv_upload"),
      redis("GET", "count:return_visit"),
      redis("GET", "count:unique_return_visitors"),
    ]);

    return res.status(200).json({
      form_copies:            parseInt(formCopies)           || 0,
      csv_uploads:            parseInt(csvUploads)           || 0,
      return_visits:          parseInt(returnVisits)         || 0,
      unique_return_visitors: parseInt(uniqueReturnVisitors) || 0,
      generated_at:           new Date().toISOString(),
    });
  } catch (err) {
    console.error("Upstash error:", err.message);
    return res.status(500).json({ error: "Could not fetch stats" });
  }
}
