const express = require("express");
const cron = require("node-cron");
require("dotenv").config();
const config = require("./config");
const sibionics = require("./sibionics");
const nightscout = require("./nightscout");
const utils = require("./utils");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const status = require("./status");

let lastRun = 0;
const COOLDOWN = 30 * 1000;

// Reduzir o uso de memória
async function safeMain() {
    if (Date.now() - lastRun < COOLDOWN) {
        return;
    }
    lastRun = Date.now();
    await main();
}

async function main() {
    try {
        const hasDevice = await sibionics.getDevice();
        if (hasDevice) {
            const nightscoutLastEntry = await nightscout.getLastEntry();
            if (nightscoutLastEntry || nightscoutLastEntry === null) {
                const dataForUpload = await sibionics.getGlucoseSibionics(nightscoutLastEntry);
                if (dataForUpload && dataForUpload.length > 0) {
                    await nightscout.upload(dataForUpload);
                } else {
                    utils.logger("Nenhum dado de glicemia encontrado para upload.");
                }
            }
        }
    } catch (error) {
        utils.logger("Erro no processamento:", error);
    }
}

// Forçar garbage collection a cada 10 minutos
setInterval(() => {
    if (global.gc) {
        global.gc();
        utils.logger("Forçando garbage collection.");
    }
}, 10 * 60 * 1000);

async function initial() {
    config.readConfig();
    try {
        await sibionics.login();
        await safeMain();
    } catch (error) {
        utils.logger("Erro no login:", error);
    }
}

initial().catch(error => {
    utils.logger("Erro ao iniciar:", error);
    process.exit(1);
});

const schedule = "*/1 * * * *";
utils.logger("Cron Schedule iniciado com sucesso");
cron.schedule(schedule, async () => {
    try {
        await safeMain();
    } catch (error) {
        utils.logger("Ocorreu um erro genérico:", error);
    }
});

app.use('/img', express.static(__dirname + '/img'));

//Página HTML de status
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/logs", (req, res) => {
    const logPath = "logs.txt";
    if (fs.existsSync(logPath)) {
        res.setHeader("Content-Type", "text/plain");
        const stream = fs.createReadStream(logPath, "utf-8");
        stream.pipe(res);
    } else {
        res.send("Sem logs no momento.");
    }
});

app.get("/status", (req, res) => {
    res.json(status.getStatus());
});

app.listen(PORT, () => {
    utils.logger(`Servidor rodando em http://localhost:${PORT}`);
});


