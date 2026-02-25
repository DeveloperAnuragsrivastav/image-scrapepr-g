const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0"
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function extractVqd(html) {
  const patterns = [
    /vqd='([^']+)'/,
    /vqd="([^"]+)"/,
    /vqd=([\d-]+)/,
    /"vqd":"([^"]+)"/,
    /vqd%3D([^&"'\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

app.post("/scrape-images", async (req, res) => {
  const { topic, limit = 5 } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const safeLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 20);
  const ua = randomUA();

  try {
    // DDG now requires hitting this endpoint to get vqd
    const tokenRes = await axios.get("https://duckduckgo.com/", {
      params: { q: topic, iax: "images", ia: "images" },
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
      },
      timeout: 10000
    });

    // Debug: log what we got (remove after fixing)
    const snippet = tokenRes.data?.substring(0, 2000);
    console.log("HTML snippet:", snippet);

    const vqd = extractVqd(tokenRes.data);
    if (!vqd) {
      return res.status(502).json({
        error: "vqd not found",
        hint: "Check server console for HTML snippet to debug pattern"
      });
    }

    const imgRes = await axios.get("https://duckduckgo.com/i.js", {
      params: { l: "us-en", o: "json", q: topic, vqd },
      headers: {
        "User-Agent": ua,
        "Referer": "https://duckduckgo.com/"
      },
      timeout: 10000
    });

    const results = imgRes.data?.results ?? [];
    const images = results.slice(0, safeLimit).map(({ image, title, width, height, source }) => ({
      url: image, title, width, height, source
    }));

    res.json({ topic, count: images.length, images });

  } catch (err) {
    const status = err.response?.status;
    res.status(502).json({
      error: "Image fetch failed",
      message: err.message,
      ...(status && { upstreamStatus: status })
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));