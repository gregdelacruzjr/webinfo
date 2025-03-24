const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const whois = require("whois-json");
const dns = require("dns").promises;
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

const cache = {};

// Enhanced WHOIS lookup with multiple fallbacks
async function getCompanyInfo(domain) {
  try {
    const data = await whois(domain);

    const registrant = {
      name:
        data.registrantOrganization ||
        data.organization ||
        data.registrar ||
        "Not available",
      email: data.registrantEmail || data.email || "Not available",
      country: data.registrantCountry || data.country || "Not available",
      state: data.registrantState || data.state || "Not available",
      city: data.registrantCity || data.city || "Not available",
      address: data.registrantStreet || data.address || "Not available",
      phone: data.registrantPhone || data.phone || "Not available",
      fax: data.registrantFax || data.fax || "Not available",
    };

    return {
      registrant,
      dates: {
        created: data.creationDate || "Unknown",
        updated: data.updatedDate || "Unknown",
        expires: data.expirationDate || "Unknown",
      },
      technical: {
        name: data.technicalName || "Not available",
        email: data.technicalEmail || "Not available",
        phone: data.technicalPhone || "Not available",
      },
      nameservers: data.nameServers || "Not available",
      registrar: {
        name: data.registrar || "Not available",
        ianaId: data.registrarIANAID || "Not available",
        url: data.registrarURL || "Not available",
      },
      domainStatus: data.domainStatus || "Not available",
      dnssec: data.dnssec || "Not available",
    };
  } catch (e) {
    console.error("WHOIS Error:", e.message);
    return null;
  }
}

// Get IP and network information
async function getNetworkInfo(domain) {
  try {
    const { address: ip } = await dns.lookup(domain);
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);

    return {
      ip,
      network: {
        asn: response.data.asn || "Not available",
        org: response.data.org || "Not available",
        isp: response.data.isp || "Not available",
        connection: response.data.connection_type || "Not available",
      },
      location: {
        city: response.data.city || "Not available",
        region: response.data.region || "Not available",
        country: response.data.country_name || "Not available",
        postal: response.data.postal || "Not available",
        timezone: response.data.timezone || "Not available",
      },
    };
  } catch (e) {
    console.error("IP Lookup Error:", e.message);
    return null;
  }
}

// Get SSL certificate info
async function getSSLInfo(domain) {
  try {
    const response = await axios.get(
      `https://api.ssllabs.com/api/v3/analyze?host=${domain}`
    );
    const cert = response.data.certs?.[0] || {};

    return {
      issuer: cert.issuerSubject || "Not available",
      validFrom:
        new Date(cert.notBefore).toLocaleDateString() || "Not available",
      validTo: new Date(cert.notAfter).toLocaleDateString() || "Not available",
      keyAlg: cert.keyAlg || "Not available",
      keySize: cert.keySize || "Not available",
      sigAlg: cert.sigAlg || "Not available",
    };
  } catch (e) {
    console.error("SSL Info Error:", e.message);
    return null;
  }
}

// Get website metadata and content
async function getWebsiteData(domain) {
  try {
    const response = await axios.get(`https://${domain}`, {
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CompanyFinder/1.0)",
      },
    });
    const $ = cheerio.load(response.data);

    // Extract metadata
    const metadata = {
      title: $("title").text(),
      description: $('meta[name="description"]').attr("content"),
      keywords: $('meta[name="keywords"]').attr("content"),
      language: $("html").attr("lang") || "Not detected",
      charset: $("meta[charset]").attr("charset") || "Not detected",
      viewport: $('meta[name="viewport"]').attr("content") || "Not detected",
      canonical: $('link[rel="canonical"]').attr("href"),
      icon:
        $('link[rel="icon"]').attr("href") ||
        $('link[rel="shortcut icon"]').attr("href"),
      status: response.status,
      headers: response.headers,
      technologies: [],
    };

    // Detect common technologies
    if ($('meta[name="generator"]').length) {
      metadata.technologies.push($('meta[name="generator"]').attr("content"));
    }
    if (response.headers["x-powered-by"]) {
      metadata.technologies.push(response.headers["x-powered-by"]);
    }
    if (response.headers["server"]) {
      metadata.technologies.push(response.headers["server"]);
    }

    // Find company info in common locations
    const companyFromMeta = $('meta[property="og:site_name"]').attr("content");
    const companyFromTitle = $("title").text().split("|")[0].trim();
    const companyFromFooter = $("footer")
      .text()
      .match(/©\s*(.*?\d{4})/)?.[1];
    const companyFromH1 = $("h1").first().text();

    metadata.companyName =
      companyFromMeta ||
      companyFromTitle ||
      companyFromFooter ||
      companyFromH1 ||
      "Not found";

    // Find address information
    const addressFromTag = $("address").text();
    const addressFromSchema = $(
      '[itemtype="http://schema.org/PostalAddress"]'
    ).text();
    const addressFromClass = $(".address, .footer-address").text();

    metadata.address =
      addressFromTag || addressFromSchema || addressFromClass || "Not found";

    // Find social media links
    metadata.socialMedia = {
      facebook: $('a[href*="facebook.com"]').attr("href"),
      twitter: $('a[href*="twitter.com"]').attr("href"),
      linkedin: $('a[href*="linkedin.com"]').attr("href"),
      instagram: $('a[href*="instagram.com"]').attr("href"),
    };

    // Find contact information
    metadata.contact = {
      email: $('a[href^="mailto:"]').attr("href")?.replace("mailto:", ""),
      phone: $('a[href^="tel:"]').attr("href")?.replace("tel:", ""),
    };

    return metadata;
  } catch (e) {
    return {
      error: "Could not fetch website",
      details: e.message,
    };
  }
}

app.post("/analyze", async (req, res) => {
  try {
    const url = req.body.url;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Extract domain
    let domain;
    try {
      const parsedUrl = new URL(
        url.startsWith("http") ? url : `https://${url}`
      );
      domain = parsedUrl.hostname.replace("www.", "");
    } catch {
      domain = url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    }

    // Check cache
    if (cache[domain]) {
      return res.json({ ...cache[domain], cached: true });
    }

    // Get all data in parallel
    const [whoisData, networkData, sslData, websiteData] = await Promise.all([
      getCompanyInfo(domain),
      getNetworkInfo(domain),
      getSSLInfo(domain),
      getWebsiteData(domain),
    ]);

    const responseData = {
      domain,
      whois: whoisData || { error: "WHOIS lookup failed" },
      network: networkData || { error: "Network lookup failed" },
      ssl: sslData || { error: "SSL lookup failed" },
      website: websiteData,
      researchedAt: new Date().toISOString(),
    };

    // Cache for 1 hour
    cache[domain] = responseData;
    setTimeout(() => delete cache[domain], 3600000);

    res.json(responseData);
  } catch (e) {
    res.status(500).json({
      error: "Analysis failed",
      details: e.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
