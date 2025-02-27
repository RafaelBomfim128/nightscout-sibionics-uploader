const fs = require("fs");
const readline = require("readline");

const logFile = "logs.txt";
const maxLines = 100;
const cleanInterval = 10; // Limpa a cada 10 chamadas

let logCount = 0;

module.exports = {
    logger(message) {
        console.log(message);
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${JSON.stringify(message)}\n`);

        logCount++;
        if (logCount >= cleanInterval) {
            logCount = 0;
            cleanLogs();
        }
    }
};

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
