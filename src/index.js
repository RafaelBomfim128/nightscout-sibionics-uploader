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

async function initial() {
    config.readConfig();
    try {
        await sibionics.login();
        await main();
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
cron.schedule(schedule, () => {
    main().catch(error => {
        utils.logger("Ocorreu um erro genérico:", error);
        process.exit(1);
    });
}, {});

app.use('/img', express.static(__dirname + '/img'));

app.use(express.static(path.join(__dirname, "public")));

//Página HTML de status
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/logs", (req, res) => {
    const logs = fs.existsSync("logs.txt") ? fs.readFileSync("logs.txt", "utf-8") : "Sem logs no momento.";
    res.setHeader("Content-Type", "text/plain");
    res.send(logs);
});

app.get("/status", (req, res) => {
    res.json(status.getStatus());
});

app.listen(PORT, () => {
    utils.logger(`Servidor rodando em http://localhost:${PORT}`);
});


