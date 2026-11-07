const crypto = require("crypto");

const COOKIE_NAME = "__Host-uploader_session";
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const REMEMBER_DURATION = 400 * 24 * 60 * 60 * 1000;
const REMEMBER_RENEWAL_WINDOW = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 1000;
const loginAttempts = new Map();
const password = process.env.WEB_PASSWORD;
const sessionSecret = process.env.WEB_SESSION_SECRET;

if (!password) {
    throw new Error('Necessário definir a variável de ambiente "WEB_PASSWORD".');
}

if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
    throw new Error('"WEB_SESSION_SECRET" deve ter pelo menos 32 bytes aleatórios.');
}

function getCookie(req) {
    const cookies = req.headers.cookie;
    if (!cookies || cookies.length > 4096) return null;

    for (const cookie of cookies.split(";")) {
        const separator = cookie.indexOf("=");
        if (separator >= 0 && cookie.slice(0, separator).trim() === COOKIE_NAME) {
            return cookie.slice(separator + 1).trim();
        }
    }

    return null;
}

function getSession(req) {
    const cookie = getCookie(req);
    if (!cookie || cookie.length > 256) return null;

    const match = cookie.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
    if (!match) return null;

    const [, payload, encodedSignature] = match;
    const signature = Buffer.from(encodedSignature, "base64url");
    if (signature.toString("base64url") !== encodedSignature) return null;
    const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest();
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
        return null;
    }

    const decodedPayloadBuffer = Buffer.from(payload, "base64url");
    if (decodedPayloadBuffer.toString("base64url") !== payload) return null;

    const decodedPayload = decodedPayloadBuffer.toString("utf8");
    const payloadMatch = decodedPayload.match(/^(\d{13}):([a-f0-9]{32}):(r|s)$/);
    if (!payloadMatch) return null;

    const expiresAt = Number(payloadMatch[1]);
    if (!Number.isSafeInteger(expiresAt)
        || expiresAt <= Date.now()
        || expiresAt > Date.now() + REMEMBER_DURATION) {
        return null;
    }

    return { expiresAt, remember: payloadMatch[3] === "r" };
}

function hasValidSession(req) {
    return getSession(req) !== null;
}

function createSessionCookie(remember) {
    const shouldRemember = remember === true;
    const duration = shouldRemember ? REMEMBER_DURATION : SESSION_DURATION;
    const marker = shouldRemember ? "r" : "s";
    const payload = Buffer.from(`${Date.now() + duration}:${crypto.randomBytes(16).toString("hex")}:${marker}`).toString("base64url");
    const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
    const maxAge = shouldRemember ? `; Max-Age=${Math.floor(duration / 1000)}` : "";
    return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAge}`;
}

function clearSessionCookie() {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function getLoginAttempt(ip) {
    const attempt = loginAttempts.get(ip);
    if (!attempt || attempt.resetAt <= Date.now()) {
        loginAttempts.delete(ip);
        return null;
    }
    return attempt;
}

function getLoginBlock(ip) {
    const now = Date.now();
    for (const [address, attempt] of loginAttempts) {
        if (attempt.resetAt <= now) {
            loginAttempts.delete(address);
        }
    }

    const attempt = loginAttempts.get(ip);
    if (attempt?.count >= MAX_LOGIN_ATTEMPTS) {
        return Math.max(1, Math.ceil((attempt.resetAt - now) / 1000));
    }

    if (!attempt && loginAttempts.size >= MAX_TRACKED_IPS) {
        const nextReset = Math.min(...Array.from(loginAttempts.values(), entry => entry.resetAt));
        return Math.max(1, Math.ceil((nextReset - now) / 1000));
    }

    return null;
}

function recordFailedLogin(ip) {
    const attempt = getLoginAttempt(ip) || { count: 0, resetAt: Date.now() + LOGIN_WINDOW };
    if (!loginAttempts.has(ip) && loginAttempts.size >= MAX_TRACKED_IPS) {
        return false;
    }
    attempt.count++;
    loginAttempts.set(ip, attempt);
    return true;
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

function passwordMatches(input) {
    if (typeof input !== "string" || input.length > 1024) return false;
    const expected = crypto.createHash("sha256").update(password).digest();
    const actual = crypto.createHash("sha256").update(input).digest();
    return crypto.timingSafeEqual(actual, expected);
}

function requireAuth(req, res, next) {
    const session = getSession(req);
    if (session) {
        if (session.remember && session.expiresAt - Date.now() <= REMEMBER_RENEWAL_WINDOW) {
            res.set("Set-Cookie", createSessionCookie(true));
        }
        return next();
    }

    if (req.path === "/") {
        return res.redirect("/login");
    }
    return res.status(401).json({ error: "Autenticação necessária." });
}

module.exports = {
    clearSessionCookie,
    createSessionCookie,
    hasValidSession,
    getLoginBlock,
    clearLoginAttempts,
    passwordMatches,
    recordFailedLogin,
    requireAuth
};
