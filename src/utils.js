const fs = require("fs");
const readline = require("readline");

const logFile = "logs.txt";
const maxLines = 100;
const cleanInterval = 10; // Limpa a cada 10 chamadas

let logCount = 0;

module.exports = {
    formatLogTimestamp,
    logger(message) {
        console.log(message);
        fs.appendFileSync(logFile, `[${formatLogTimestamp(new Date())}] ${JSON.stringify(message)}\n`);

        logCount++;
        if (logCount >= cleanInterval) {
            logCount = 0;
            cleanLogs();
        }
    }
};

function formatLogTimestamp(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZoneName: "longOffset"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const offset = values.timeZoneName === "GMT"
        ? "+00:00"
        : values.timeZoneName.replace(/^GMT/, "");

    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${String(date.getMilliseconds()).padStart(3, "0")}${offset}`;
}

function cleanLogs() {
    const lines = [];
    const rl = readline.createInterface({
        input: fs.createReadStream(logFile),
        crlfDelay: Infinity
    });

    rl.on("line", line => {
        lines.push(line);
        if (lines.length > maxLines) lines.shift(); // Mantém apenas as últimas 100 linhas
    });

    rl.on("close", () => {
        fs.writeFile(logFile, lines.join("\n") + "\n", err => {
            if (err) console.error("Erro ao limpar logs:", err);
        });
    });
}
