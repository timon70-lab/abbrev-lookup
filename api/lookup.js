// Vercel serverless function: POST { abbr, sector, lang } -> { fullName, gist, description, aliases }
// lang is "en" (default) or "no" — only affects what language the answer is written in.
//
// Served from the same origin as the page (both live in this one Vercel project),
// so there is no CORS handling here and none is needed. If the frontend is ever
// hosted somewhere else again, this needs an Access-Control-Allow-Origin allow-list
// and an OPTIONS handler back.

const SECTOR_LABELS = {
  utilities: "electric utilities and power grids (transmission and distribution)",
  energy: "oil and gas — upstream, offshore, subsea and process (Norwegian continental shelf context)",
  "information-technology": "corporate information technology — cloud, security, networking and enterprise software",
  "health-care": "health care — clinical software, US health insurance and regulatory terms, hospital operations",
};

const MODEL = "claude-haiku-4-5-20251001"; // fast and cheap; plenty for definitions

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { abbr, sector, lang } = req.body || {};
  const term = String(abbr || "").trim().slice(0, 20);
  if (!term || !/^[A-Za-z0-9.\-/ ]+$/.test(term)) return res.status(400).json({ error: "Invalid abbreviation" });
  const sectorLabel = SECTOR_LABELS[sector] || String(sector || "general industry").slice(0, 60);
  const langName = lang === "no" ? "Norwegian (bokmål)" : "English";

  const prompt = `You are a glossary for industry abbreviations. Sector: ${sectorLabel}.
Abbreviation: "${term}"
Write the answer in ${langName}. Use natural, professional ${langName} — not a literal word-for-word translation of an English sentence — and standard local terminology where one exists.

Return ONLY a JSON object, no markdown, no commentary, with exactly these keys:
{"fullName": string, "gist": string, "description": string, "aliases": string[]}

Rules:
- fullName: what the letters stand for, as used in this sector.
- gist: a headline of at most 8 words saying what it is in plain language, no trailing full stop.
- description: 1-3 plain sentences, max 60 words, explaining what it is and where it's used. Written for a colleague who just heard it in a meeting.
- aliases: other names or abbreviations that mean exactly the same thing (not related or broader terms). Empty array if none.
- If the abbreviation is not known in this sector, use fullName "Unknown" and say so in the description.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error("Anthropic API error", r.status, detail);
      return res.status(502).json({ error: "Model request failed" });
    }
    const data = await r.json();
    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    return res.status(200).json({
      fullName: String(parsed.fullName || "Unknown"),
      gist: String(parsed.gist || ""),
      description: String(parsed.description || ""),
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases.map(String).slice(0, 8) : [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not produce a definition" });
  }
}
