const status = {
    sibionicsLogin: false,
    nightscoutLastEntry: false,
    sibionicsDevice: false,
    sibionicsGlucose: false,
    nightscoutUpload: false
};

module.exports = {
    getStatus: () => status, 
    updateStatus: (key, value) => {
        if (status.hasOwnProperty(key)) {
            status[key] = value;
        }
    }
};
