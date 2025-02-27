module.exports = {
    readConfig() {
        const requiredEnvs = [
            'SIBIONICS_EMAIL_SEGUIDOR',
            'SIBIONICS_SENHA_SEGUIDOR',
            'SIBIONICS_EMAIL_PRINCIPAL',
            'NIGHTSCOUT_URL',
            'NIGHTSCOUT_TOKEN'
        ]
    
        for (const env of requiredEnvs) {
            if (!process.env[env]) {
                throw new Error(`Necessário definir a variável de ambiente "${env}" faltante.`);
            }
        }

        const sibionicsEmail = process.env.SIBIONICS_EMAIL_SEGUIDOR;
        const sibionicsPassword = process.env.SIBIONICS_SENHA_SEGUIDOR;
        const sibionicsMainEmail = process.env.SIBIONICS_EMAIL_PRINCIPAL;
        const urlSibionics = 'https://cgm-ce.sisensing.com';
        let urlNightscout = process.env.NIGHTSCOUT_URL
        if (!urlNightscout.startsWith('http://') && !urlNightscout.startsWith('https://')) urlNightscout = `https://${urlNightscout}`
        if (urlNightscout.endsWith('/')) urlNightscout = urlNightscout.slice(0, urlNightscout.length - 1)
        const tokenNightscout = process.env.NIGHTSCOUT_TOKEN

        return {
            sibionicsEmailFollower: sibionicsEmail,
            sibionicsPasswordFollower: sibionicsPassword,
            sibionicsMainEmail: sibionicsMainEmail,
            urlSibionics: urlSibionics,
            urlNightscout: urlNightscout,
            tokenNightscout: tokenNightscout
        };
    }
}