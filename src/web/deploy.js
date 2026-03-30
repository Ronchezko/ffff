const config = require('../config');

// Настройки для продакшена
const productionConfig = {
    // Основной домен
    domain: 'deathtime.su',
    
    // Настройки для reverse proxy (если используете nginx)
    trustProxy: true,
    
    // Настройки сессии для продакшена
    session: {
        cookie: {
            secure: true, // для HTTPS
            maxAge: 24 * 60 * 60 * 1000,
            domain: '.deathtime.su' // точка в начале для поддоменов
        }
    }
};

module.exports = productionConfig;