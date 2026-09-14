// Turbo Twist Auto — Import/Export company search backend
//
// FREE VERSION — no AI API calls, no per-search cost. This server
// reads companies.json (in this same folder) and returns matching
// entries for the requested country + type. To add more companies,
// edit companies.json directly (see the README for the format) and
// commit the change — Render will redeploy automatically.
//
// Setup:
//   1. npm install
//   2. npm start   (runs on http://localhost:3000)
//
// No API key, no .env file, no billing needed for this version.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "companies.json");

function loadDatabase() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Could not read/parse companies.json:", err.message);
    return {};
  }
}

app.post("/api/search-companies", (req, res) => {
  try {
    const { type, country } = req.body;

    if (!type || !["import", "export"].includes(type)) {
      return res.status(400).json({ error: "type must be 'import' or 'export'" });
    }
    if (!country || typeof country !== "string") {
      return res.status(400).json({ error: "country is required" });
    }

    const db = loadDatabase();
    const countryKey = country.trim().toLowerCase();
    const countryEntry = db[countryKey];
    const list = countryEntry && Array.isArray(countryEntry[type]) ? countryEntry[type] : [];

    const results = list.map((c) => ({
      company: c.company,
      email: c.email || "",
      website: c.website || "",
      country,
      type,
      sourceNote: c.sourceNote || ""
    }));

    res.json({ results, demo: false });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Import/Export search backend (free, database-only) running on port ${PORT}`);
});
