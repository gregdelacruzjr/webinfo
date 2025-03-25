// MUST use CommonJS (not ES modules) for Vercel
const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    const [whoisData, websiteData] = await Promise.all([
      whois(domain).catch((e) => ({ error: "WHOIS lookup failed" })),
      getWebsiteData(domain),
    ]);

    res.json({ success: true, domain, whoisData, websiteData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getWebsiteData(domain) {
  try {
    const { data } = await axios.get(`https://${domain}`, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(data);
    return {
      title: $("title").text() || "Not found",
      description: $('meta[name="description"]').attr("content") || "Not found",
    };
  } catch (error) {
    return { error: "Failed to fetch website" };
  }
}
