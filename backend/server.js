// Turbo Twist Auto — Import/Export company search backend
//
// This server takes a country + type (import/export), asks Claude
// (with the web_search tool) to find REAL vehicle importer/exporter
// companies for that country, and returns only companies + emails
// that were actually found on the public web. It never invents an
// email — if none is publicly listed, that company is left out.
//
// Setup:
//   1. npm install
//   2. Create a .env file with: ANTHROPIC_API_KEY=sk-ant-...
//   3. npm start   (runs on http://localhost:3000)
//
// Deploy this on Render, Railway, or any Node host. Never put the
// ANTHROPIC_API_KEY in frontend/browser code.

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set. Requests will fail until it is.");
}

// Simple in-memory cache so repeated searches (same country+type) don't
// re-spend API credits every time. Resets when the server restarts.
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

app.post("/api/search-companies", async (req, res) => {
  try {
    const { type, country } = req.body;

    if (!type || !["import", "export"].includes(type)) {
      return res.status(400).json({ error: "type must be 'import' or 'export'" });
    }
    if (!country || typeof country !== "string") {
      return res.status(400).json({ error: "country is required" });
    }

    const cacheKey = `${type}:${country.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ results: cached.results, cached: true });
    }

    const roleWord = type === "import" ? "importers" : "exporters";
    const prompt = `Search the web to find real, currently operating companies that are ${roleWord} of vehicles (cars, vans, trucks, motorcycles — not spare parts) in ${country}.

Rules:
- Only include a company if you find an actual public contact email for it (on its official website, business directory listing, or similar public source).
- Never guess, construct, or infer an email address. If you cannot find a real published email for a company, leave that company out entirely.
- Return between 3 and 10 companies if that many genuinely have public emails; fewer is fine and better than making one up.
- Respond with ONLY a JSON array, no other text, no markdown code fences. Each item must look like:
  {"company": "Company Name", "email": "real@email.found", "sourceNote": "brief note on where this was found, e.g. company website contact page"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream AI search failed" });
    }

    const data = await response.json();

    // Collect only the text blocks (web_search / tool_use blocks are ignored).
    const textBlocks = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    let companies = [];
    try {
      const cleaned = textBlocks.replace(/```json|```/g, "").trim();
      companies = JSON.parse(cleaned);
      if (!Array.isArray(companies)) companies = [];
    } catch (parseErr) {
      console.error("Could not parse model output as JSON:", textBlocks);
      companies = [];
    }

    // Basic sanity filter: require a company name and an email with an "@".
    const results = companies
      .filter((c) => c && typeof c.company === "string" && typeof c.email === "string" && c.email.includes("@"))
      .map((c) => ({
        company: c.company,
        email: c.email,
        country,
        type,
        sourceNote: c.sourceNote || ""
      }));

    cache.set(cacheKey, { results, timestamp: Date.now() });

    res.json({ results, cached: false });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Import/Export search backend running on port ${PORT}`);
});
