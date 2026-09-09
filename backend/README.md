# Turbo Twist Auto — Import/Export Search Backend

This is a small server that powers the Import/Export search page on the
Turbo Twist Auto website. When someone picks a country and clicks
"Search Importers" or "Search Exporters", the frontend calls this
backend, which asks Claude (with web search turned on) to find real
vehicle importer/exporter companies for that country — only including
companies where a real public email was actually found on the web.

## 1. Local setup

```
cd backend
npm install
cp .env.example .env
```

Open `.env` and paste in your real Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at https://console.anthropic.com (Account → API Keys).

Run it locally:

```
npm start
```

It starts on `http://localhost:3000`. Test it:

```
curl -X POST http://localhost:3000/api/search-companies \
  -H "Content-Type: application/json" \
  -d '{"type":"import","country":"Sri Lanka"}'
```

## 2. Deploy it (so the live website can reach it)

Recommended: **Render.com** (free tier is enough to start).

1. Push this `backend/` folder to a GitHub repo.
2. On Render.com: New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add an environment variable: `ANTHROPIC_API_KEY` = your key.
6. Deploy. Render gives you a URL like
   `https://turbo-twist-import-export.onrender.com`.

(Railway, Fly.io, or a small VPS work the same way — just make sure
`ANTHROPIC_API_KEY` is set as a server-side environment variable, never
committed to code or exposed to the browser.)

## 3. Point the website at it

In `import-export.html`, find:

```js
const TRADE_API_CONFIG = {
  endpoint: "",
  apiKey: ""
};
```

Set `endpoint` to your deployed URL + `/api/search-companies`, and
leave `apiKey` blank (the key lives only on the server now, not in
the browser):

```js
const TRADE_API_CONFIG = {
  endpoint: "https://turbo-twist-import-export.onrender.com/api/search-companies",
  apiKey: ""
};
```

## Notes

- Results are cached per country+type for 12 hours to avoid repeat
  API costs on repeated searches.
- The model is instructed to never invent an email — if it can't find
  a real one on the web, that company is left out rather than guessed.
- This means some countries may return few or zero results. That's
  expected and safer than showing fake contacts.
