const dns = require('dns').promises;
const disposableDomains = require('./disposable_domains');

/**
 * Check if the email's domain is in a known disposable email list.
 */
function isDisposable(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.has(domain);
}

/**
 * Check if the email is a generic role-based address (e.g., info@, contact@).
 * These are often catch-alls and less likely to reach a specific person.
 */
function isGenericRole(email) {
    const localPart = email.split('@')[0].toLowerCase();
    const genericRoles = new Set([
        'info', 'contact', 'admin', 'support', 'sales', 'marketing',
        'hello', 'hi', 'office', 'enquiry', 'help', 'no-reply', 'noreply',
        'reception', 'mail', 'general', 'webmaster'
    ]);
    return genericRoles.has(localPart);
}

/**
 * Validates the email's domain for MX records.
 */
async function hasValidMX(email) {
    try {
        const domain = email.split('@')[1];
        if (!domain) return false;
        const mxRecords = await dns.resolveMx(domain);
        return mxRecords && mxRecords.length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Combined reputation check.
 * Higher score means more likely to be a real, high-quality contact.
 */
async function validateEmailReputation(email) {
    const result = {
        isValid: true,
        reason: '',
        isHighQuality: true,
        score: 100
    };

    if (isDisposable(email)) {
        result.isValid = false;
        result.reason = 'Disposable email provider';
        result.isHighQuality = false;
        result.score = 0;
        return result;
    }

    if (isGenericRole(email)) {
        result.isHighQuality = false;
        result.score -= 40;
        result.reason = 'Generic role-based address (potential catch-all)';
    }

    const mxValid = await hasValidMX(email);
    if (!mxValid) {
        result.isValid = false;
        result.reason = 'No valid MX records found';
        result.score = 0;
        return result;
    }

    return result;
}

module.exports = {
    isDisposable,
    isGenericRole,
    hasValidMX,
    validateEmailReputation
};
