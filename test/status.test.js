const assert = require("node:assert/strict");
const { test } = require("node:test");

const status = require("../src/status");
const { formatLogTimestamp } = require("../src/utils");

test("Nightscout upload status distinguishes waiting from failures", () => {
    assert.equal(status.getStatus().nightscoutUpload, status.WAITING_FOR_RECENT_DATA);
    assert.equal(status.getStatus().nightscoutLastUploadAt, null);

    status.updateStatus("nightscoutUpload", false);
    assert.equal(status.getStatus().nightscoutUpload, false);

    status.updateStatus("nightscoutUpload", status.WAITING_FOR_RECENT_DATA);
    assert.equal(status.getStatus().nightscoutUpload, status.WAITING_FOR_RECENT_DATA);

    const lastUploadAt = 1_800_000_000_000;
    status.updateStatus("nightscoutLastUploadAt", lastUploadAt);
    status.updateStatus("nightscoutUpload", status.WAITING_FOR_RECENT_DATA);
    assert.equal(status.getStatus(lastUploadAt + 9 * 60 * 1000).nightscoutUpload, true);
    assert.equal(
        status.getStatus(lastUploadAt + 10 * 60 * 1000).nightscoutUpload,
        status.WAITING_FOR_RECENT_DATA
    );

    status.updateStatus("nightscoutUpload", false);
    assert.equal(status.getStatus(lastUploadAt + 9 * 60 * 1000).nightscoutUpload, false);
});

test("log timestamps use the Sao Paulo timezone", () => {
    assert.equal(
        formatLogTimestamp(new Date("2026-11-06T19:10:09.630Z")),
        "2026-11-06T16:10:09.630-03:00"
    );
});
