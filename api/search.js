export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Music search is being configured. Please try again shortly.",
      code: "SEARCH_NOT_CONFIGURED"
    });
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre : "All";
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : "";

  if (query.length < 1 || query.length > 100) {
    return res.status(400).json({ error: "Search must be between 1 and 100 characters." });
  }
  if (!["All", "English", "Pakistani", "Bollywood"].includes(genre)) {
    return res.status(400).json({ error: "Invalid music category." });
  }
  if (pageToken.length > 500 || !/^[A-Za-z0-9_-]*$/.test(pageToken)) {
    return res.status(400).json({ error: "Invalid page token." });
  }

  const suffix = {
    All: " music",
    English: " English music",
    Pakistani: " Pakistani songs music",
    Bollywood: " Bollywood Hindi songs music"
  }[genre];

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: "12",
    regionCode: "IN",
    safeSearch: "moderate",
    q: query + suffix,
    key: apiKey
  });
  if (pageToken) params.set("pageToken", pageToken);

  try {
    const upstream = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
    const payload = await upstream.json();

    if (!upstream.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (upstream.status === 403 && reason === "quotaExceeded") {
        return res.status(429).json({
          error: "YouTube search quota has been reached. Please try again later.",
          code: "QUOTA_EXCEEDED"
        });
      }
      console.error("YouTube search API error:", upstream.status, reason || "unknown");
      return res.status(502).json({
        error: "The music search provider could not complete the request.",
        code: "UPSTREAM_ERROR"
      });
    }

    const items = (payload.items || [])
      .filter(item => item?.id?.videoId && item?.snippet)
      .map(item => ({
        id: { videoId: item.id.videoId },
        snippet: {
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          description: item.snippet.description,
          thumbnails: item.snippet.thumbnails
        }
      }));

    return res.status(200).json({
      items,
      nextPageToken: payload.nextPageToken || null,
      pageInfo: payload.pageInfo || null
    });
  } catch (error) {
    console.error("Music search request failed:", error?.message || "unknown error");
    return res.status(502).json({
      error: "Music search is temporarily unavailable. Please try again.",
      code: "SEARCH_UNAVAILABLE"
    });
  }
}
