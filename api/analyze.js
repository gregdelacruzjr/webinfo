import axios from "axios";
import cheerio from "cheerio";
import whois from "whois-json";

export default async (request, response) => {
  // Enable CORS
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  // Only allow POST requests
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = request.body;

    if (!url) {
      return response.status(400).json({ error: "URL is required" });
    }

    // Extract domain
    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    // Get WHOIS data
    const whoisData = await whois(domain);

    // Get website data
    let websiteData = {};
    try {
      const { data } = await axios.get(`https://${domain}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 5000,
      });
      const $ = cheerio.load(data);
      websiteData = {
        title: $("title").text(),
        description: $('meta[name="description"]').attr("content"),
        icon:
          $('link[rel="icon"]').attr("href") ||
          $('link[rel="shortcut icon"]').attr("href"),
      };
    } catch (error) {
      websiteData = { error: "Failed to fetch website content" };
    }

    response.json({
      success: true,
      domain,
      whoisData,
      websiteData,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Analysis error:", error);
    response.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
};
