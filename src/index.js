const express = require("express");
const cron = require("node-cron");
require("dotenv").config();
const config = require("./config");
const sibionics = require("./sibionics");
const nightscout = require("./nightscout");
const utils = require("./utils");
const fs = require("fs");
const path = require("path");
const auth = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;
const status = require("./status");
const loginPage = path.join(__dirname, "views", "login.html");

let lastRun = 0;
let isRunning = false;
const COOLDOWN = 30 * 1000;

// Reduzir o uso de memória
async function safeMain() {
    if (isRunning) {
        utils.logger("Ciclo ignorado: a sincronização anterior ainda está em execução.");
        return;
    }

    if (Date.now() - lastRun < COOLDOWN) {
        utils.logger("Ciclo ignorado: intervalo mínimo entre sincronizações ainda não atingido.");
        return;
    }
    lastRun = Date.now();
    isRunning = true;
    try {
        await main();
    } finally {
        isRunning = false;
    }
}

async function main() {
    try {
        utils.logger("Iniciando ciclo de sincronização.");
        const hasDevice = await sibionics.getDevice();
        if (!hasDevice) {
            utils.logger("Ciclo interrompido: não foi possível obter o dispositivo Sibionics.");
            status.updateStatus("nightscoutUpload", false);
            return;
        }

        utils.logger("Dispositivo Sibionics localizado; consultando o Nightscout.");
        const nightscoutLastEntry = await nightscout.getLastEntry();
        if (nightscoutLastEntry === false) {
            utils.logger("Ciclo interrompido: falha ao consultar a última entrada do Nightscout.");
            status.updateStatus("nightscoutUpload", false);
            return;
        }

        utils.logger("Consultando as leituras recentes do Sibionics.");
        const dataForUpload = await sibionics.getGlucoseSibionics(nightscoutLastEntry);
        if (!Array.isArray(dataForUpload)) {
            utils.logger("Ciclo interrompido: falha ao consultar as leituras do Sibionics.");
            status.updateStatus("nightscoutUpload", false);
        } else if (dataForUpload.length > 0) {
            utils.logger(`Enviando ${dataForUpload.length} leitura(s) ao Nightscout.`);
            await nightscout.upload(dataForUpload);
        } else {
            utils.logger("Aguardando dados recentes (~5 min); nenhuma leitura nova para enviar.");
            status.updateStatus("nightscoutUpload", status.WAITING_FOR_RECENT_DATA);
        }
    } catch (error) {
        status.updateStatus("nightscoutUpload", false);
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

app.set("trust proxy", 2);
app.use(express.json({ limit: "10kb" }));
app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

app.get("/login", (req, res) => {
    if (auth.hasValidSession(req)) {
        return res.redirect("/");
    }
    res.sendFile(loginPage);
});

app.post("/auth/login", (req, res) => {
    const ip = req.ip || "unknown";
    const retryAfter = auth.getLoginBlock(ip);
    if (retryAfter !== null) {
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." });
    }

    if (!auth.passwordMatches(req.body?.password)) {
        auth.recordFailedLogin(ip);
        return res.status(401).json({ error: "Senha incorreta." });
    }

    auth.clearLoginAttempts(ip);
    res.set("Set-Cookie", auth.createSessionCookie(req.body.remember === true));
    res.sendStatus(204);
});

app.use(auth.requireAuth);
app.use('/img', express.static(path.join(__dirname, "img")));

app.post("/auth/logout", (req, res) => {
    res.set("Set-Cookie", auth.clearSessionCookie());
    res.sendStatus(204);
});

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
