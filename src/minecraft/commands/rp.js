// src/main.js
// Единая точка входа для Resistance Bot
// ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const cleanNickname = global.cleanNick(nick);
const logger = require('./shared/logger');
const database = require('./database');

// Глобальное состояние для отслеживания компонентов
global.botComponents = {
    minecraft: null,
    discord: null,
    web: null
};

// Глобальные логи для веб-интерфейса
global.botLogs = [];
global.systemLogs = [];
global.pendingRegistrations = new Map();

// Игнорируем предупреждения о скинах
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    if (args[0]?.includes?.('Ignoring block entities')) return;
    if (args[0]?.includes?.('skin')) return;
    originalConsoleWarn.apply(console, args);
};

// Функция добавления логов в глобальный массив
function addBotLog(message, type = 'info') {
    const logEntry = {
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
        type,
        message
    };
    global.botLogs.unshift(logEntry);
    if (global.botLogs.length > 1000) global.botLogs.pop();
    
    switch(type) {
        case 'error': logger.error(message); break;
        case 'warn': logger.warn(message); break;
        case 'success': logger.success(message); break;
        default: logger.info(message);
    }
}

// Глобальная обработка не пойманных ошибок
process.on('uncaughtException', (err) => {
    if (err.message?.includes('skin') || err.message?.includes('textures')) {
        logger.debug('⚠️ Игнорируем ошибку скина:', err.message);
        return;
    }
    logger.error('❌ Непойманная ошибка:', err);
    addBotLog(`Критическая ошибка: ${err.message}`, 'error');
});

process.on('unhandledRejection', (reason) => {
    if (reason?.message?.includes('skin') || reason?.message?.includes('textures')) {
        logger.debug('⚠️ Игнорируем reject скина');
        return;
    }
    logger.error('❌ Необработанный reject:', reason);
    addBotLog(`Необработанная ошибка: ${reason?.message || reason}`, 'error');
});

// Патч для JSON.parse для игнорирования ошибок скинов
const originalJSONParse = JSON.parse;
JSON.parse = function(text, reviver) {
    try {
        return originalJSONParse(text, reviver);
    } catch (err) {
        if (text && (text.includes('textures') || text.includes('SKIN') || text.includes('skin'))) {
            return {};
        }
        throw err;
    }
};

// ============================================
// ЗАПУСК КОМПОНЕНТА С ИЗОЛЯЦИЕЙ ОШИБОК
// ============================================

async function startComponent(name, startFunction, ...args) {
    try {
        logger.info(`🚀 Запуск компонента: ${name}`);
        addBotLog(`Запуск ${name}...`, 'info');
        
        const component = await startFunction(...args);
        
        logger.success(`✅ Компонент ${name} запущен`);
        addBotLog(`✅ ${name} успешно запущен`, 'success');
        
        return component;
    } catch (error) {
        logger.error(`❌ Ошибка запуска ${name}:`, error);
        addBotLog(`❌ Ошибка запуска ${name}: ${error.message}`, 'error');
        return null;
    }
}

// ============================================
// ОСТАНОВКА КОМПОНЕНТА
// ============================================

async function stopComponent(name, component) {
    if (!component) return;
    
    try {
        logger.info(`🛑 Остановка компонента: ${name}`);
        
        if (typeof component.stop === 'function') {
            await component.stop();
        } else if (typeof component.destroy === 'function') {
            await component.destroy();
        } else if (typeof component.close === 'function') {
            await component.close();
        }
        
        logger.success(`✅ Компонент ${name} остановлен`);
    } catch (error) {
        logger.error(`❌ Ошибка остановки ${name}:`, error);
    }
}

// ============================================
// ПЕРЕЗАПУСК КОМПОНЕНТА
// ============================================

async function restartComponent(name, startFunction, ...args) {
    logger.warn(`🔄 Перезапуск компонента: ${name}`);
    addBotLog(`🔄 Перезапуск ${name}...`, 'warn');
    
    const oldComponent = global.botComponents[name.toLowerCase()];
    await stopComponent(name, oldComponent);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newComponent = await startComponent(name, startFunction, ...args);
    global.botComponents[name.toLowerCase()] = newComponent;
    
    return newComponent;
}

// ============================================
// МОНИТОРИНГ СОСТОЯНИЯ КОМПОНЕНТОВ
// ============================================

function startHealthCheck() {
    setInterval(async () => {
        const mcBot = global.botComponents.minecraft;
        if (mcBot && mcBot.bot) {
            if (!mcBot.bot._client || !mcBot.bot._client.socket || mcBot.bot._client.socket.destroyed) {
                logger.warn('⚠️ Minecraft бот отключён, перезапуск...');
                addBotLog('Minecraft бот отключён, перезапуск...', 'warn');
                
                const minecraft = require('./minecraft');
                await restartComponent('MinecraftBot', minecraft.start, database, addBotLog);
            }
        }
        
        const discordBot = global.botComponents.discord;
        if (discordBot && discordBot.client) {
            if (!discordBot.client.isReady()) {
                logger.warn('⚠️ Discord бот отключён, перезапуск...');
                addBotLog('Discord бот отключён, перезапуск...', 'warn');
                
                const discord = require('./discord');
                await restartComponent('DiscordBot', discord.start, database);
            }
        }
        
        const webServer = global.botComponents.web;
        if (webServer && webServer.server) {
            if (!webServer.server.listening) {
                logger.warn('⚠️ Web сервер остановлен, перезапуск...');
                addBotLog('Web сервер остановлен, перезапуск...', 'warn');
                
                const web = require('./web/server');
                const newWeb = await restartComponent('WebServer', web.start, database);
                if (newWeb && web.setBot) web.setBot(global.botComponents.minecraft);
            }
        }
    }, 30000);
}

// ============================================
// ОБРАБОТКА ПЕРЕЗАГРУЗКИ СЕРВЕРА MINECRAFT
// ============================================

function scheduleMinecraftRestartHandler() {
    setInterval(() => {
        const now = new Date();
        const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        const hours = mskTime.getHours();
        const minutes = mskTime.getMinutes();
        
        if (hours === 3 && minutes >= 0 && minutes <= 10) {
            const mcBot = global.botComponents.minecraft;
            if (mcBot && mcBot.setRestartMode) {
                mcBot.setRestartMode(true);
                addBotLog('🔄 Режим перезагрузки сервера активирован', 'info');
            }
        } else {
            const mcBot = global.botComponents.minecraft;
            if (mcBot && mcBot.setRestartMode) {
                mcBot.setRestartMode(false);
            }
        }
    }, 60000);
}

// ============================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================

async function main() {
    try {
        logger.info('═══════════════════════════════════════════════');
        logger.info('🏙️  RESISTANCE CITY BOT v7.0');
        logger.info('═══════════════════════════════════════════════');
        addBotLog('Запуск Resistance Bot...', 'info');
        
        await database.initialize();
        logger.success('💾 База данных готова');
        addBotLog('База данных подключена', 'success');
        
        logger.info('🤖 Запуск Minecraft бота...');
        const minecraft = require('./minecraft');
        const mcBot = await startComponent('MinecraftBot', minecraft.start, database, addBotLog);
        global.botComponents.minecraft = mcBot;
        
        logger.info('💬 Запуск Discord бота...');
        const discord = require('./discord');
        const dcBot = await startComponent('DiscordBot', discord.start, database);
        global.botComponents.discord = dcBot;
        
        setTimeout(async () => {
            logger.info('🌐 Запуск Web сервера...');
            const web = require('./web/server');
            const webServer = await startComponent('WebServer', web.start, database);
            global.botComponents.web = webServer;
            
            if (webServer && web.setBot) {
                web.setBot(global.botComponents.minecraft);
            }
        }, 5000);
        
        startHealthCheck();
        scheduleMinecraftRestartHandler();
        
        logger.success('═══════════════════════════════════════════════');
        logger.success('🎉 ВСЕ КОМПОНЕНТЫ ЗАПУЩЕНЫ!');
        logger.success('🏙️  Проект Resistance готов к работе');
        logger.success('═══════════════════════════════════════════════');
        addBotLog('✅ Все компоненты успешно запущены', 'success');
        
    } catch (error) {
        logger.error('❌ Критическая ошибка при запуске:', error);
        addBotLog(`Критическая ошибка: ${error.message}`, 'error');
        
        try {
            logger.info('🌐 Пытаемся запустить только Web интерфейс для диагностики...');
            const web = require('./web/server');
            const webServer = await web.start(database);
            global.botComponents.web = webServer;
            logger.warn('⚠️ Запущен только Web интерфейс. Боты не работают.');
            addBotLog('⚠️ Запущен только Web интерфейс. Проверьте логи.', 'warn');
        } catch (webError) {
            logger.error('❌ Не удалось запустить даже Web интерфейс:', webError);
        }
    }
}

// ============================================
// ОБРАБОТКА ЗАВЕРШЕНИЯ ПРОЦЕССА
// ============================================

async function gracefulShutdown(signal) {
    logger.info(`\n📡 Получен сигнал ${signal}`);
    addBotLog(`Получен сигнал завершения ${signal}`, 'warn');
    logger.info('🛑 Начинаю корректное завершение...');
    
    await stopComponent('WebServer', global.botComponents.web);
    await stopComponent('DiscordBot', global.botComponents.discord);
    await stopComponent('MinecraftBot', global.botComponents.minecraft);
    
    try {
        const db = database.getDb();
        if (db && typeof db.close === 'function') {
            await db.close();
            logger.info('💾 Соединение с БД закрыто');
        }
    } catch (err) {
        logger.error('Ошибка при закрытии БД:', err);
    }
    
    logger.success('✅ Корректное завершение выполнено');
    addBotLog('Бот остановлен', 'info');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (require.main === module) {
    main();
}

module.exports = {
    main,
    addBotLog,
    restartComponent,
    stopComponent
};