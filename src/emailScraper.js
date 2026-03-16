const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('email-validator');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Apple) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

function getUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extracts and validates email addresses from text
 */
function extractEmails(text) {
    if (!text) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    
    const blacklistedDomains = ['duckduckgo.com', 'w3.org', 'recheck', 'sentry.io', 'google.com'];
    
    return matches.filter(email => {
        const lower = email.toLowerCase();
        return validator.validate(email) && !blacklistedDomains.some(domain => lower.includes(domain));
    });
}

/**
 * Intelligent Domain Discovery: Finds the official website URL
 */
async function findCompanyDomain(companyName) {
    console.log(`🌐 Finding official website for ${companyName}...`);
    try {
        const query = encodeURIComponent(`${companyName} official website`);
        const url = `https://html.duckduckgo.com/html/?q=${query}`;
        const resp = await axios.get(url, { headers: { 'User-Agent': getUA() } });
        const $ = cheerio.load(resp.data);
        
        // Grab the first result link that looks like a corporate site
        // DDG results are in .result__url or .result__a
        let domain = '';
        $('.result__a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('duckduckgo.com') && !href.includes('linkedin.com') && !href.includes('twitter.com')) {
                const urlMatch = href.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
                if (urlMatch) {
                    domain = urlMatch[1].replace(/^www\./i, '');
                    return false; // break
                }
            }
        });
        return domain || (companyName.toLowerCase().replace(/\s+/g, '') + '.com');
    } catch (e) {
        return companyName.toLowerCase().replace(/\s+/g, '') + '.com';
    }
}

/**
 * Scrapes About/Mission/Home page for personalization context
 */
async function scrapeAboutPage(domain) {
    console.log(`🧠 Scraping About/Mission context for ${domain}...`);
    const paths = ['/', '/about', '/about-us', '/our-mission'];
    for (const path of paths) {
        try {
            const url = `https://${domain}${path}`;
            const resp = await axios.get(url, { timeout: 6000, headers: { 'User-Agent': getUA() } });
            const $ = cheerio.load(resp.data);
            
            // Priority 1: Meta description (usually the best concise summary)
            const metaDesc = $('meta[name="description"]').attr('content') || 
                             $('meta[property="og:description"]').attr('content');
            if (metaDesc && metaDesc.length > 50) return metaDesc.trim();

            // Priority 2: Extract text from paragraphs
            let context = '';
            $('p').each((i, el) => {
                const txt = $(el).text().trim().replace(/\s+/g, ' ');
                if (txt.length > 80 && txt.length < 600) {
                    const l = txt.toLowerCase();
                    if (l.includes('mission') || l.includes('value') || l.includes('vision') || 
                        l.includes('we are') || l.includes('platform') || l.includes('leading')) {
                        context = txt;
                        return false; // break
                    }
                }
            });
            if (context) return context;
        } catch (e) {}
    }
    return '';
}

/**
 * Scrapes DuckDuckGo for career emails
 */
async function searchDDG(companyName) {
    console.log(`🔍 Searching DuckDuckGo for ${companyName} career emails...`);
    try {
        const query = encodeURIComponent(`"${companyName}" careers OR "hr email" OR "recruitment email"`);
        const url = `https://html.duckduckgo.com/html/?q=${query}`;
        const resp = await axios.get(url, { headers: { 'User-Agent': getUA() } });
        const $ = cheerio.load(resp.data);
        const allEmails = extractEmails($('body').text());
        return allEmails.filter(e => {
            const l = e.toLowerCase();
            return l.includes('career') || l.includes('hr') || l.includes('recruit') || l.includes('jobs') || l.includes('hiring');
        });
    } catch (e) { return []; }
}

/**
 * Scrapes the official site directly for emails
 */
async function scrapeSiteEmails(domain) {
    const paths = ['/careers', '/jobs', '/contact', '/about-us'];
    let allEmails = [];
    for (const path of paths) {
        try {
            const url = `https://${domain}${path}`;
            const resp = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': getUA() } });
            const $ = cheerio.load(resp.data);
            allEmails = allEmails.concat(extractEmails($('body').text()));
            if (allEmails.length > 5) break; 
        } catch (e) {}
    }
    return allEmails;
}

/**
 * Orchestrator: Finds domain, context, and emails
 */
async function findCompanyInfo(companyName) {
    const domain = await findCompanyDomain(companyName);
    const aboutText = await scrapeAboutPage(domain);
    const ddgEmails = await searchDDG(companyName);
    const siteEmails = await scrapeSiteEmails(domain);
    
    // Combine and deduplicate emails
    const combinedEmails = Array.from(new Set([...ddgEmails, ...siteEmails].map(e => e.toLowerCase())));

    // No fallbacks — only use emails actually found by scraping
    // (previously fabricated careers@/hr@ causing bouncebacks)

    return {
        domain,
        aboutText,
        emails: combinedEmails
    };
}

module.exports = {
    findCompanyInfo
};
