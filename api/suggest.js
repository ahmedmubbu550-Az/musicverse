// Autocomplete for partial keywords: "ari" -> "arijit singh", "arijit singh songs", ...
// Uses YouTube's public suggestion service, so no API key or quota is needed.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 1 || q.length > 100) return res.status(200).json({ suggestions: [] });

  const params = new URLSearchParams({ client: "firefox", ds: "yt", hl: "en", ie: "utf-8", oe: "utf-8", q });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const upstream = await fetch("https://suggestqueries.google.com/complete/search?" + params, { signal: controller.signal });
    clearTimeout(timer);
    if (!upstream.ok) return res.status(200).json({ suggestions: [] });
    const data = JSON.parse(await upstream.text());
    const suggestions = Array.isArray(data?.[1])
      ? data[1].filter((s) => typeof s === "string").slice(0, 8)
      : [];
    return res.status(200).json({ suggestions });
  } catch (error) {
    return res.status(200).json({ suggestions: [] });
  }
}
