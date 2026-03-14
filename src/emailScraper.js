const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extracts email addresses from a string using regex and filters common noise
 */
function extractEmails(text) {
    if (!text) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    
    // Ignore common non-career/false positive domains
    const blacklistedDomains = ['duckduckgo.com', 'w3.org', 'google.com/recaptcha', 'sentry.io'];
    
    return matches.filter(email => {
        const lower = email.toLowerCase();
        return !blacklistedDomains.some(domain => lower.includes(domain));
    });
}

/**
 * Scrapes DuckDuckGo for potential career emails
 */
async function searchDDG(companyName) {
    console.log(`🔍 Searching DuckDuckGo for ${companyName} career emails...`);
    try {
        // Query for specific career-related keywords
        const query = encodeURIComponent(`"${companyName}" careers OR "hr email" OR "recruitment email"`);
        const url = `https://html.duckduckgo.com/html/?q=${query}`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const pageText = $('body').text();
        
        // Find emails specifically containing career-related keywords
        const allEmails = extractEmails(pageText);
        return allEmails.filter(e => {
            const l = e.toLowerCase();
            return l.includes('career') || l.includes('hr') || l.includes('recruit') || l.includes('jobs') || l.includes('hiring');
        });
    } catch (error) {
        console.warn(`  ⚠️ DDG search failed for ${companyName}: ${error.message}`);
        return [];
    }
}

/**
 * Guesses company domain and scrapes career/contact pages
 */
async function scrapeCompanySite(companyName) {
    // Basic domain guessing: Google -> google.com, Tech Corp -> techcorp.com
    const domain = companyName.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '') + '.com';
    const paths = ['/careers', '/jobs', '/contact', '/about-us'];
    let allEmails = [];

    console.log(`🌐 Trying to scrape ${domain}...`);

    for (const path of paths) {
        try {
            const url = `https://${domain}${path}`;
            const response = await axios.get(url, { 
                timeout: 5000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const $ = cheerio.load(response.data);
            const emails = extractEmails($('body').text());
            allEmails = allEmails.concat(emails);
            if (allEmails.length > 5) break; 
        } catch (e) {
            // Silently fail for individual paths
        }
    }
    return allEmails;
}

/**
 * Orchestrator: Finds career emails via multiple methods
 */
async function findCareerEmails(companyName) {
    const ddgEmails = await searchDDG(companyName);
    const siteEmails = await scrapeCompanySite(companyName);
    
    // Combine, lowercase, and deduplicate
    const combined = [...ddgEmails, ...siteEmails]
        .map(e => e.toLowerCase().trim())
        .filter(e => e.includes('@'));

    // Bonus: Common patterns if nothing found
    if (combined.length === 0) {
        const cleanName = companyName.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
        combined.push(`careers@${cleanName}.com`);
        combined.push(`hr@${cleanName}.com`);
    }

    return Array.from(new Set(combined));
}

module.exports = {
    findCareerEmails
};
