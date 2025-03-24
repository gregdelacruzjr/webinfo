const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");
const dns = require("dns").promises;
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: ["https://*.vercel.app", "http://localhost:3000"],
  })
);
app.use(express.json());
app.use(express.static("public"));

// Ensure all responses are JSON
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json");
  next();
});

const cache = {};

// Helper function to extract domain
const extractDomain = (url) => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
};

// WHOIS lookup with error handling
const getCompanyInfo = async (domain) => {
  try {
    const data = await whois(domain);
    return {
      registrant: {
        name:
          data.registrantOrganization || data.organization || "Not available",
        email: data.registrantEmail || data.email || "Not available",
        country: data.registrantCountry || data.country || "Not available",
      },
      dates: {
        created: data.creationDate || "Unknown",
        expires: data.expirationDate || "Unknown",
      },
      registrar: data.registrar || "Unknown",
    };
  } catch (e) {
    console.error("WHOIS Error:", e.message);
    return null;
  }
};

// Website data fetcher
const getWebsiteData = async (domain) => {
  try {
    const response = await axios.get(`https://${domain}`, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(response.data);

    return {
      title: $("title").text(),
      description: $('meta[name="description"]').attr("content"),
      icon:
        $('link[rel="icon"]').attr("href") ||
        $('link[rel="shortcut icon"]').attr("href"),
    };
  } catch (e) {
    return { error: "Could not fetch website", details: e.message };
  }
};

// Main API endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const domain = extractDomain(url);

    // Check cache
    if (cache[domain]) {
      return res.json({ ...cache[domain], cached: true });
    }

    const [whoisData, websiteData] = await Promise.all([
      getCompanyInfo(domain),
      getWebsiteData(domain),
    ]);

    const responseData = {
      domain,
      whois: whoisData,
      website: websiteData,
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 hour
    cache[domain] = responseData;
    setTimeout(() => delete cache[domain], 3600000);

    res.json(responseData);
  } catch (e) {
    console.error("API Error:", e);
    res.status(500).json({
      error: "Analysis failed",
      details: e.message,
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

module.exports = app;

// Local development
if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}
