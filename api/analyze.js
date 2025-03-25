// api/analyze.js
const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Extract domain
    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    // Your analysis logic
    const [whoisData, websiteData] = await Promise.all([
      getCompanyInfo(domain),
      getWebsiteData(domain),
    ]);

    res.json({ success: true, domain, whoisData, websiteData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper functions (same as before)
async function getCompanyInfo(domain) {
  /* ... */
}
async function getWebsiteData(domain) {
  /* ... */
}
