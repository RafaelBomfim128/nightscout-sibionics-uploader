const WAITING_FOR_RECENT_DATA = "waiting";
const OPERATIONAL_AFTER_UPLOAD_DURATION = 10 * 60 * 1000;

const status = {
    sibionicsLogin: false,
    nightscoutLastEntry: false,
    sibionicsDevice: false,
    sibionicsGlucose: false,
    nightscoutUpload: WAITING_FOR_RECENT_DATA,
    nightscoutLastUploadAt: null
};

module.exports = {
    WAITING_FOR_RECENT_DATA,
    getStatus: (now = Date.now()) => {
        const nightscoutUpload = status.nightscoutUpload === WAITING_FOR_RECENT_DATA &&
            typeof status.nightscoutLastUploadAt === "number" &&
            now - status.nightscoutLastUploadAt >= 0 &&
            now - status.nightscoutLastUploadAt < OPERATIONAL_AFTER_UPLOAD_DURATION
            ? true
            : status.nightscoutUpload;

        return { ...status, nightscoutUpload };
    },
    updateStatus: (key, value) => {
        if (status.hasOwnProperty(key)) {
            status[key] = value;
        }
    }
};
