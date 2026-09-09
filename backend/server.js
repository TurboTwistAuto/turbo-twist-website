// Turbo Twist Auto — Import/Export company search backend
//
// This server takes a country + type (import/export), asks Claude
// (with the web_search tool) to find REAL vehicle importer/exporter
// companies for that country. It never invents an email — if none is
// publicly listed, the company still shows up with its website or a
// "no public email found" note instead of being dropped.
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
- Include a company as long as you find its real name and, ideally, its official website — from its own site, a business directory listing, or a similar public source.
- If you also find a public contact email for the company, include it. If you cannot find one, that is fine — still include the company, just leave the email blank.
- Never guess, construct, or infer an email address. An email must be one you actually found published somewhere.
- Return between 3 and 10 companies if that many genuinely operate in this space; fewer is fine.
- Respond with ONLY a JSON array, no other text, no markdown code fences. Each item must look like:
  {"company": "Company Name", "website": "https://example.com or empty string if not found", "email": "real@email.found or empty string if not found", "sourceNote": "brief note on where this was found"}`;

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
      // The model sometimes writes a sentence before/after the JSON array
      // even when told not to — pull out just the [...] part defensively.
      const match = textBlocks.match(/\[[\s\S]*\]/);
      const cleaned = (match ? match[0] : textBlocks).replace(/```json|```/g, "").trim();
      companies = JSON.parse(cleaned);
      if (!Array.isArray(companies)) companies = [];
    } catch (parseErr) {
      console.error("Could not parse model output as JSON:", textBlocks);
      companies = [];
    }

    // Only requirement now: a real company name. Email and website are
    // both optional — never invent either, just show what was found.
    const results = companies
      .filter((c) => c && typeof c.company === "string" && c.company.trim().length > 0)
      .map((c) => ({
        company: c.company.trim(),
        email: typeof c.email === "string" ? c.email.trim() : "",
        website: typeof c.website === "string" ? c.website.trim() : "",
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
