// /api/analyze.js
const { createServer } = require('http');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const whois = require('whois-json');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Reuse your existing analyze logic here
app.post('/', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    // Your existing analysis logic (WHOIS, Cheerio, etc.)
    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const [whoisData, websiteData] = await Promise.all([
      getCompanyInfo(domain),
      getWebsiteData(domain),
    ]);

    res.json({ success: true, domain, whoisData, websiteData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions (copy from your server.js)
async function getCompanyInfo(domain) { ... }
async function getWebsiteData(domain) { ... }

// Export as Vercel serverless function
module.exports = app;