const fs = require("fs");

module.exports = {
    logger(message) {
        console.log(message);
        fs.appendFileSync("logs.txt", `[${new Date().toISOString()}] ${JSON.stringify(message)}\n`);
        cleanLogs();
    }
}

function cleanLogs() {
    const logFile = "logs.txt";
    const maxLines = 100;

    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, "utf-8").split("\n").filter(line => line.trim() !== "");

        if (logs.length > maxLines) {
            const newLogs = logs.slice(-maxLines);
            fs.writeFileSync(logFile, newLogs.join("\n") + "\n");
        }
    }
}