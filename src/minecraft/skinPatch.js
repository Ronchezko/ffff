// Патч для обработки ошибок парсинга скинов (игнорируем)
const logger = require('../shared/logger');

const originalJSONParse = JSON.parse;

JSON.parse = function(text, reviver) {
    try {
        return originalJSONParse(text, reviver);
    } catch (err) {
        if (text && (text.includes('textures') || text.includes('SKIN'))) {
            logger.warn('Перехвачена ошибка парсинга скина');
            return {};
        }
        throw err;
    }
};

logger.info('✅ Патч для обработки ошибок скинов установлен');