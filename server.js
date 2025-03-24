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
app.use(
  cors({
    origin: [
      "https://*.vercel.app",
      "http://localhost:3000",
      process.env.FRONTEND_URL,
    ].filter(Boolean),
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Cache
const cache = new Map();

// Helper Functions
const extractDomain = (url) => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace("www.", "");
  } catch {
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
    console.error("WHOIS Error:", e.message);
    return null;
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
    console.error("Website Fetch Error:", e.message);
    return { error: "Could not fetch website", details: e.message };
  }
};

// Routes
app.post("/api/analyze", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "Validation Error",
        message: "URL is required",
      });
    }

    const domain = extractDomain(url);

    // Check cache
    if (cache.has(domain)) {
      const cached = cache.get(domain);
      return res.json({ ...cached, cached: true });
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
    cache.set(domain, responseData);
    setTimeout(() => cache.delete(domain), 3600000);

    res.json(responseData);
  } catch (e) {
    console.error("Analysis Error:", e);
    res.status(500).json({
      error: "Analysis Failed",
      message: e.message,
      ...(process.env.NODE_ENV === "development" && { stack: e.stack }),
    });
  }
});

// Frontend Route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error Handling
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  });
});

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
