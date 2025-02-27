const axios = require('axios');
const crypto = require('crypto');

const config = require('./config');
const configEnvs = config.readConfig();
const utils = require('./utils');
const status = require("./status");

let token = null;
let deviceId = null;
let lastAttemptLogin = null;
const contentType = 'application/json';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

module.exports = {
    async login() {
        if (lastAttemptLogin && (((Date.now() / 1000) - lastAttemptLogin / 1000) < 300)) {
            utils.logger('Última tentativa de login foi há menos de 5 minutos. Aguardando 5 minutos para tentar novamente.');
            status.updateStatus("sibionicsLogin", false);
            return false
        }
        lastAttemptLogin = Date.now()
        const sibionicsEmail = configEnvs.sibionicsEmailFollower;
        const sibionicsPassword = configEnvs.sibionicsPasswordFollower;
        const passwordHash = crypto.createHash('md5').update(sibionicsPassword).digest('hex');

        const body = {
            email: sibionicsEmail,
            password: passwordHash
        }

        try {
            const response = await axios.post(`${configEnvs.urlSibionics}/auth/app/user/login`, body, {
                headers: {
                    'Content-Type': contentType,
                    'User-Agent': userAgent
                },
                timeout: 25000
            });

            if (response.status === 200 && response.data.code === 202008) {
                utils.logger('Erro ao fazer login no Sibionics: Email não registrado. Programa abortado para evitar bloqueio.');
                status.updateStatus("sibionicsLogin", false);
                process.exit(1);
            }

            if (response.status === 200 && response.data.code === 202013) {
                utils.logger('Erro ao fazer login no Sibionics: Senha incorreta. Programa abortado para evitar bloqueio.');
                status.updateStatus("sibionicsLogin", false);
                process.exit(1);
            }

            if (response.status !== 200 || response.data.msg !== "Succeeded" || response.data.success !== true) {
                utils.logger('Erro ao fazer login: mensagem de erro na resposta.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsLogin", false);
                return false;
            }

            if (!response.data.data.access_token) {
                utils.logger('Erro ao fazer login: access_token não encontrado na resposta.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsLogin", false);
                return false;
            }

            token = response.data.data.access_token;
            utils.logger(`Login no Sibionics realizado com sucesso!`);
            status.updateStatus("sibionicsLogin", true);
            return true;
        } catch (error) {
            utils.logger('Erro ao fazer login no Sibionics:', error);
            status.updateStatus("sibionicsLogin", false);
            return false;
        }
    },

    async getDevice(attempt = 0) {
        if (attempt > 0) {
            utils.logger('Número máximo de tentativas de buscar dispositivos no Sibionics excedido.');
            status.updateStatus("sibionicsDevice", false);
            return false
        }

        if (!token) {
            utils.logger('Token de autenticação não encontrado.');
            await this.login()
        }

        try {
            const response = await axios.get(`${configEnvs.urlSibionics}/user/app/follow/sharer`, {
                headers: {
                    'Authorization': token
                },
                timeout: 25000
            });

            if (response.status === 200 && response.data.code === 401 && response.data.msg === 'Login state has expired') {
                const loginSuccess = await this.login()
                if (loginSuccess) {
                    return await this.getDevice(attempt++)
                } else {
                    status.updateStatus("sibionicsDevice", false);
                    return false
                }
            }

            if (response.status !== 200 || response.data.msg !== "Succeeded" || response.data.success !== true) {
                utils.logger('Erro ao buscar dispositivos: mensagem de erro na resposta.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsDevice", false);
                return false;
            }

            const correctDevice = response.data.data.filter(device => device.userEmail === configEnvs.sibionicsMainEmail);
            if (correctDevice.length === 0) {
                utils.logger(`Erro ao buscar dispositivos: nenhum dispositivo encontrado com o e-mail principal ${configEnvs.sibionicsMainEmail}.`);
                utils.logger('Dispositivos encontrados:', response.data);
                status.updateStatus("sibionicsDevice", false);
                return false;
            } else if (correctDevice.length > 1) {
                utils.logger(`Erro ao buscar dispositivos: mais de um dispositivo encontrado com o e-mail principal ${configEnvs.sibionicsMainEmail}.`);
                utils.logger('Dispositivos encontrados:', response.data);
                status.updateStatus("sibionicsDevice", false);
                return false;
            }
            deviceId = correctDevice[0].id
            status.updateStatus("sibionicsDevice", true);
            return true
        } catch (error) {
            utils.logger('Erro ao buscar dispositivos:', error);
            status.updateStatus("sibionicsDevice", false);
            return false
        }
    },

    async getGlucoseSibionics(lastEntryNightscout, attempt = 0) {
        if (attempt > 0) {
            utils.logger('Número máximo de tentativas de buscar dados de glicemia no Sibionics excedido.');
            status.updateStatus("sibionicsGlucose", false);
            return false
        }

        if (!token || !deviceId) {
            utils.logger('Token de autenticação ou deviceId não encontrado.');
            status.updateStatus("sibionicsGlucose", false);
            return false
        }

        const body = {
            "range": "1",
            "id": deviceId,
        }

        try {
            const response = await axios.post(`${configEnvs.urlSibionics}/user/app/follow/deviceGlucose`, body, {
                headers: {
                    'Authorization': token
                },
                timeout: 25000
            });

            if (response.status === 200 && response.data.code === 401 && response.data.msg === 'Login state has expired') {
                const loginSuccess = await this.login()
                if (loginSuccess) {
                    return await this.getGlucoseSibionics(lastEntryNightscout, attempt++)
                } else {
                    status.updateStatus("sibionicsGlucose", false);
                    return false;
                }
            }

            if (response.status !== 200 || response.data.msg !== "Succeeded" || response.data.success !== true) {
                utils.logger('Erro ao buscar dados de glicemia: mensagem de erro na resposta.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsGlucose", false);
                return false;
            }

            if (!response.data.data || response.data.data.length === 0) {
                utils.logger('Erro ao buscar dados de glicemia: nenhum dado encontrado.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsGlucose", false);
                return false;
            }

            if (response.data.data.glucoseInfos.length === 0) {
                utils.logger('Erro ao buscar dados de glicemia: nenhum dado de glicemia encontrado no glucoseInfos.');
                utils.logger('Resposta obtida:');
                utils.logger(response.data);
                status.updateStatus("sibionicsGlucose", false);
                return false;
            }

            const glucoseInfos = response.data.data.glucoseInfos;
            const glucoseDataToUpload = []
            glucoseInfos.forEach(element => {
                if (lastEntryNightscout) {
                    if (parseInt(element.t) > parseInt(lastEntryNightscout.date)) {
                        glucoseDataToUpload.push(element)
                    }
                } else {
                    glucoseDataToUpload.push(element)
                }
            });
            const glucoseFormatted = formatGlucoseData(glucoseDataToUpload)
            status.updateStatus("sibionicsGlucose", true);
            return glucoseFormatted;
        } catch (error) {
            utils.logger('Erro ao buscar dados de glicemia:', error);
            status.updateStatus("sibionicsGlucose", false);
            return false
        }
    }
}

function formatGlucoseData(data) {
    if (data.length > 0) {
        const formattedData = [];
        data.forEach(element => {
            const formatted = {
                type: "sgv",
                sgv: mmolToMgDl(element.v),
                direction: directionTranslate(element.s),
                device: 'nightscout-sibionics-uploader',
                date: parseInt(element.t),
                dateString: new Date(parseInt(element.t)).toISOString()
            }
            formattedData.push(formatted)
        })
        return formattedData
    }
    return null
}

function mmolToMgDl(mmol) {
    if (isNaN(mmol) || mmol < 0) {
        throw new Error("Por favor, insira um valor numérico válido e positivo.");
    }
    return Math.round(mmol * 18);
}

function directionTranslate(directionNumber) {
    switch(directionNumber) {
        case -2:
            return 'SingleDown';
        case -1:
            return 'FortyFiveDown';
        case 0:
            return 'Flat';
        case 1:
            return 'FortyFiveUp'
        case 2:
            return 'SingleUp'
        default:
            utils.logger(`O valor ${directionNumber} caiu em NOT COMPUTABLE no directionTranslate`)
            return 'NOT COMPUTABLE'
    }
}