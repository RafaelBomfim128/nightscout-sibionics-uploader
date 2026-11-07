const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");

process.env.WEB_PASSWORD = "test-only-random-password-123456";
process.env.WEB_SESSION_SECRET = "test-only-session-secret-0123456789abcdef";

const auth = require("../src/auth");
const COOKIE_NAME = "__Host-uploader_session";
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const REMEMBER_DURATION = 400 * 24 * 60 * 60 * 1000;
const REMEMBER_RENEWAL_WINDOW = 30 * 24 * 60 * 60 * 1000;

function signedCookie(payload) {
    const encodedPayload = Buffer.from(payload).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.WEB_SESSION_SECRET)
        .update(encodedPayload)
        .digest("base64url");
    return `${COOKIE_NAME}=${encodedPayload}.${signature}`;
}

function requestWithCookie(cookie) {
    return { headers: { cookie } };
}

test("session cookies use host-only secure attributes and strict remember durations", () => {
    const now = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => now;

    try {
        const regular = auth.createSessionCookie(false);
        const remembered = auth.createSessionCookie(true);
        const stringFalse = auth.createSessionCookie("false");

        assert.match(regular, /^__Host-uploader_session=/);
        assert.match(regular, /; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
        assert.doesNotMatch(regular, /Domain=|Max-Age=/);
        assert.match(remembered, /; Max-Age=34560000$/);
        assert.doesNotMatch(stringFalse, /Max-Age=/);

        const expiration = cookie => {
            const value = cookie.split(";")[0].split("=")[1];
            const payload = value.slice(0, value.lastIndexOf("."));
            return Number(Buffer.from(payload, "base64url").toString("utf8").split(":")[0]);
        };
        assert.equal(expiration(regular), now + SESSION_DURATION);
        assert.equal(expiration(stringFalse), now + SESSION_DURATION);
        assert.equal(expiration(remembered), now + REMEMBER_DURATION);

        const cleared = auth.clearSessionCookie();
        assert.match(cleared, /^__Host-uploader_session=; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0$/);
        assert.doesNotMatch(cleared, /Domain=/);
    } finally {
        Date.now = originalNow;
    }
});

test("session validation rejects missing, malformed, altered, oversized, and expired cookies", () => {
    const now = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => now;

    try {
        assert.equal(auth.hasValidSession({ headers: {} }), false);
        assert.equal(auth.hasValidSession(requestWithCookie(`${COOKIE_NAME}=random`)), false);
        assert.equal(auth.hasValidSession(requestWithCookie(`${COOKIE_NAME}=${"a".repeat(300)}`)), false);
        assert.equal(auth.hasValidSession(requestWithCookie(`${COOKIE_NAME}=${"a".repeat(5000)}`)), false);

        const valid = auth.createSessionCookie(true).split(";")[0];
        assert.equal(auth.hasValidSession(requestWithCookie(valid)), true);

        const [name, value] = valid.split("=");
        const [payload, signature] = value.split(".");
        const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
        assert.equal(auth.hasValidSession(requestWithCookie(`${name}=${payload}.${changedSignature}`)), false);

        const changedPayload = `${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}`;
        assert.equal(auth.hasValidSession(requestWithCookie(`${name}=${changedPayload}.${signature}`)), false);

        assert.equal(auth.hasValidSession(requestWithCookie(signedCookie("not-a-session-payload"))), false);
        assert.equal(auth.hasValidSession(requestWithCookie(signedCookie(`${now - 1}:${"a".repeat(32)}:r`))), false);
    } finally {
        Date.now = originalNow;
    }
});

test("remembered sessions renew before expiration while regular sessions do not", () => {
    const now = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => now;

    try {
        let nextCalled = false;
        const headers = {};
        const res = { set: (name, value) => { headers[name] = value; } };
        const next = () => { nextCalled = true; };

        const expiringRemembered = signedCookie(`${now + REMEMBER_RENEWAL_WINDOW - 1000}:${"a".repeat(32)}:r`);
        auth.requireAuth(requestWithCookie(expiringRemembered), res, next);
        assert.equal(nextCalled, true);
        assert.match(headers["Set-Cookie"], /Max-Age=34560000$/);
        const renewedValue = headers["Set-Cookie"].split(";")[0].split("=")[1];
        const renewedPayload = Buffer.from(renewedValue.slice(0, renewedValue.lastIndexOf(".")), "base64url").toString("utf8");
        assert.equal(Number(renewedPayload.split(":")[0]), now + REMEMBER_DURATION);
        assert.equal(renewedPayload.endsWith(":r"), true);

        nextCalled = false;
        delete headers["Set-Cookie"];
        const expiringRegular = signedCookie(`${now + SESSION_DURATION - 1000}:${"b".repeat(32)}:s`);
        auth.requireAuth(requestWithCookie(expiringRegular), res, next);
        assert.equal(nextCalled, true);
        assert.equal(headers["Set-Cookie"], undefined);
    } finally {
        Date.now = originalNow;
    }
});

test("password comparison rejects invalid values and compares configured password", () => {
    assert.equal(auth.passwordMatches(process.env.WEB_PASSWORD), true);
    assert.equal(auth.passwordMatches("different-password"), false);
    assert.equal(auth.passwordMatches(undefined), false);
    assert.equal(auth.passwordMatches(123), false);
    assert.equal(auth.passwordMatches("x".repeat(1025)), false);
});

test("login attempts block after ten failures without extending the window", () => {
    const ip = "test-rate-limit-ip";
    const now = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => now;

    try {
        assert.equal(auth.getLoginBlock(ip), null);
        for (let attempt = 0; attempt < 10; attempt++) {
            assert.equal(auth.recordFailedLogin(ip), true);
        }

        assert.equal(auth.getLoginBlock(ip), 900);
        Date.now = () => now + 5 * 60 * 1000;
        assert.equal(auth.getLoginBlock(ip), 600);
        assert.equal(auth.getLoginBlock(ip), 600);
        auth.clearLoginAttempts(ip);
        assert.equal(auth.getLoginBlock(ip), null);

        Date.now = () => now;
        for (let attempt = 0; attempt < 10; attempt++) {
            auth.recordFailedLogin(ip);
        }
        Date.now = () => now + 15 * 60 * 1000;
        assert.equal(auth.getLoginBlock(ip), null);
    } finally {
        Date.now = originalNow;
        auth.clearLoginAttempts(ip);
    }
});

test("rate-limit storage stays bounded and does not evict active IPs", () => {
    const now = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => now;
    const firstIp = "capacity-test-ip-0";

    try {
        for (let index = 0; index < 1000; index++) {
            const ip = `capacity-test-ip-${index}`;
            assert.equal(auth.getLoginBlock(ip), null);
            assert.equal(auth.recordFailedLogin(ip), true);
        }

        assert.ok(auth.getLoginBlock("capacity-test-new-ip") > 0);
        for (let attempt = 1; attempt < 10; attempt++) {
            auth.recordFailedLogin(firstIp);
        }
        assert.equal(auth.getLoginBlock(firstIp), 900);

        Date.now = () => now + 15 * 60 * 1000;
        assert.equal(auth.getLoginBlock("capacity-test-new-ip"), null);
    } finally {
        Date.now = originalNow;
    }
});
