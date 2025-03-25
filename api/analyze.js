const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");

export default async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    const [whoisData, websiteData] = await Promise.all([
      whois(domain),
      getWebsiteData(domain),
    ]);

    res.json({ success: true, domain, whoisData, websiteData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getWebsiteData(domain) {
  try {
    const response = await axios.get(`https://${domain}`);
    const $ = cheerio.load(response.data);
    return {
      title: $("title").text(),
      description: $('meta[name="description"]').attr("content"),
    };
  } catch (error) {
    return { error: "Failed to fetch website data" };
  }
}
