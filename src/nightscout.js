const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');
const configEnvs = config.readConfig();
const utils = require('./utils');
const status = require('./status');

const contentType = 'application/json';
const userAgent = 'Nightscout Sibionics Uploader'

const tokenHash = crypto.createHash('sha1').update(configEnvs.tokenNightscout).digest('hex');

module.exports = {
    async getLastEntry() {
        try {
            const url = new URL("/api/v1/entries?count=1", configEnvs.urlNightscout).toString();
            const response = await axios.get(url, {
                headers: {
                    "api-secret": tokenHash,
                    "User-Agent": userAgent,
                    "Content-Type": contentType,
                },
                timeout: 25000
            });

            if (response.status !== 200) {
                utils.logger(`Falha ao buscar a última entrada do Nightscout: ${response.statusText}`);
                status.updateStatus('nightscoutLastEntry', false);
                return false;
            }

            const lastEntry = response.data?.[0];
            if (!lastEntry) {
                utils.logger('Última entrada não encontrada no Nightscout');
                status.updateStatus('nightscoutLastEntry', null);
                return null;
            }
            
            status.updateStatus('nightscoutLastEntry', true);
            return lastEntry;
        } catch (error) {
            utils.logger('Erro genérico ao buscar a última entrada do Nightscout:', error);
            status.updateStatus('nightscoutLastEntry', false);
            return false
        }
    },

    async upload(dataForUpload) {
        try {
            const url = new URL("/api/v1/entries", configEnvs.urlNightscout).toString();
            const response = await axios.post(url, dataForUpload, {
                headers: {
                    "api-secret": tokenHash,
                    "User-Agent": userAgent,
                    "Content-Type": contentType,
                },
                timeout: 25000
            });

            if (response.status !== 200) {
                utils.logger(`Falha ao fazer upload dos dados no Nightscout: ${response.statusText}`);
                status.updateStatus('nightscoutUpload', false);
                return false;
            }

            utils.logger(`Upload de ${dataForUpload.length} entradas para o Nightscout com sucesso!`)
            status.updateStatus('nightscoutUpload', true);
            return true;
        } catch (error) {
            utils.logger(`Erro ao fazer upload dos dados no Nightscout: ${error.message}`);
            
            if (error.response) {
                utils.logger(`Resposta do servidor: ${JSON.stringify(error.response.data)}`);
            }

            status.updateStatus('nightscoutUpload', false);
            return false;
        }
    }
}