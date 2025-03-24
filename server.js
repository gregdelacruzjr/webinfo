require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");
const dns = require("dns").promises;
const path = require("path");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Cache
const cache = new Map();

// Helper Functions
const extractDomain = (url) => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace("www.", "");
  } catch (e) {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
};

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
    throw new Error(`WHOIS lookup failed: ${e.message}`);
  }
};

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
    throw new Error(`Website fetch failed: ${e.message}`);
  }
};

// API Route
app.post("/api/analyze", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid URL",
        message: "Please provide a valid website URL",
      });
    }

    const domain = extractDomain(url);

    // Check cache
    if (cache.has(domain)) {
      return res.json({
        success: true,
        ...cache.get(domain),
        cached: true,
      });
    }

    const [whoisData, websiteData] = await Promise.all([
      getCompanyInfo(domain),
      getWebsiteData(domain),
    ]);

    const responseData = {
      success: true,
      domain,
      whois: whoisData,
      website: websiteData,
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 hour
    cache.set(domain, responseData);
    setTimeout(() => cache.delete(domain), 3600000);

    return res.json(responseData);
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      error: "Analysis Failed",
      message: error.message,
    });
  }
});

// Frontend Route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
