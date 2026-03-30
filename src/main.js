// src/main.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
console.log('✅ .env загружен');

const logger = require('./shared/logger');
const database = require('./database');

global.botComponents = {};
global.botLogs = [];
global.systemLogs = [];

function addBotLog(message, type = 'info') {
    global.botLogs.unshift({ timestamp: new Date().toLocaleTimeString('ru-RU', { hour12: false }), type, message });
    if (global.botLogs.length > 1000) global.botLogs.pop();
}

process.on('uncaughtException', (err) => { if (err.message?.includes('skin')) return; logger.error('❌ Непойманная ошибка:', err); });
process.on('unhandledRejection', (reason) => { if (reason?.message?.includes('skin')) return; logger.error('❌ Необработанный reject:', reason); });

const originalJSONParse = JSON.parse;
JSON.parse = function(text, reviver) {
    try { return originalJSONParse(text, reviver); } catch (err) {
        if (text && (text.includes('textures') || text.includes('SKIN'))) return {};
        throw err;
    }
};

async function startComponent(name, startFunction, ...args) {
    try { logger.info(`🚀 Запуск компонента: ${name}`); const component = await startFunction(...args); logger.success(`✅ Компонент ${name} запущен`); return component; }
    catch (error) { logger.error(`❌ Ошибка запуска ${name}:`, error); return null; }
}

async function main() {
    try {
        database.initialize();
        logger.success('💾 База данных готова');
        
        const minecraft = require('./minecraft');
        const bot = await startComponent('MinecraftBot', minecraft.start, database, addBotLog);
        global.botComponents.minecraft = bot;
        
        const discord = require('./discord');
        await startComponent('DiscordBot', discord.start, database);
        
        setTimeout(async () => {
            const web = require('./web/server');
            const webServer = await startComponent('WebServer', web.start, database);
            if (webServer && web.setBot) web.setBot(bot);
            global.botComponents.web = webServer;
        }, 2000);
        
        logger.success('🎉 Все компоненты запущены! Проект Resistance готов к работе.');
    } catch (error) { logger.error('❌ Критическая ошибка:', error); process.exit(1); }
}

process.on('SIGINT', () => {
    logger.info('🛑 Завершение...');
    if (global.botComponents.minecraft?.stop) global.botComponents.minecraft.stop();
    if (global.botComponents.discord?.stop) global.botComponents.discord.stop();
    if (global.botComponents.web?.stop) global.botComponents.web.stop();
    setTimeout(() => process.exit(0), 1000);
});

main();