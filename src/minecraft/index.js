// src/minecraft/index.js
// ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ С ПОДДЕРЖКОЙ ЗАПАСНОГО БОТА

const mineflayer = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');
const { handleMessage } = require('./chatHandler');
const payday = require('./payday');
// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const BOT_CONFIG = {
    host: process.env.MC_HOST || 'ru.dexland.org',
    port: parseInt(process.env.MC_PORT) || 25565,
    username: process.env.MC_BOT_USERNAME || 'YT_FLATT807',
    backupUsername: process.env.MC_BACKUP_USERNAME || 'xxx_toper_xxx',
    password: process.env.MC_PASSWORD,
    useProxy: process.env.USE_PROXY === 'true',
    proxyHost: process.env.PROXY_HOST,
    proxyPort: parseInt(process.env.PROXY_PORT) || 1080,
    proxyType: process.env.PROXY_TYPE || 'socks5',
    auth: process.env.MC_AUTH || 'offline',
    version: process.env.MC_VERSION || '1.16.5'
};

let currentBot = null;
let isUsingBackup = false;
let reconnectAttempts = 0;
let isRestartMode = false;
let reconnectTimeout = null;
let healthCheckInterval = null;

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function addLog(message, type = 'info') {
    if (global.addBotLog) {
        global.addBotLog(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getProxyAgent() {
    if (!BOT_CONFIG.useProxy) return null;
    
    const proxyUrl = `${BOT_CONFIG.proxyType}://${BOT_CONFIG.proxyHost}:${BOT_CONFIG.proxyPort}`;
    addLog(`🔒 Используется прокси: ${proxyUrl}`, 'info');
    return new SocksProxyAgent(proxyUrl);
}

function setRestartMode(mode) {
    isRestartMode = mode;
    addLog(`🔄 Режим перезагрузки сервера: ${mode ? 'ВКЛ' : 'ВЫКЛ'}`, 'debug');
}

// ============================================
// ЗАПУСК БОТА
// ============================================

async function startBot(db, useBackup = false) {
    const username = useBackup ? BOT_CONFIG.backupUsername : BOT_CONFIG.username;
    isUsingBackup = useBackup;
    
    addLog(`🤖 Запуск ${useBackup ? 'ЗАПАСНОГО' : 'ОСНОВНОГО'} бота: ${username}`, 'info');
    
    const options = {
        host: BOT_CONFIG.host,
        port: BOT_CONFIG.port,
        username: username,
        version: BOT_CONFIG.version,
        auth: BOT_CONFIG.auth
    };
    
    if (BOT_CONFIG.password) {
        options.password = BOT_CONFIG.password;
    }
    
    const proxyAgent = getProxyAgent();
    if (proxyAgent) {
        options.agent = proxyAgent;
    }
    
    const bot = mineflayer.createBot(options);
    
    // ============================================
    // ОБРАБОТЧИКИ СОБЫТИЙ
    // ============================================
    
    bot.on('login', () => {
        addLog(`✅ Бот ${username} успешно зашёл на сервер!`, 'success');
        reconnectAttempts = 0;
        
        // Отправляем /s1 через 5 секунд
        setTimeout(() => {
            bot.chat('/s3');
            addLog(`📝 Отправлена команда: /s1`, 'info');
        }, 5000);
        
        // Телепорт на точку (если нужно)
        setTimeout(() => {
            if (process.env.SPAWN_TP_COMMAND) {
                bot.chat(process.env.SPAWN_TP_COMMAND);
                addLog(`📍 Телепорт: ${process.env.SPAWN_TP_COMMAND}`, 'info');
            }
        }, 8000);
        
        // Оповещение о перезагрузке сервера
        setTimeout(() => {
            if (isRestartMode) {
                bot.chat('/cc &a&l|&f Сервер &2успешно перезагружен&f!');
                addLog(`📢 Оповещение о перезагрузке отправлено`, 'info');
                isRestartMode = false;
            } else if (isUsingBackup) {
                bot.chat('/cc &4&l|&c ⚠️ ВНИМАНИЕ! Основной бот временно недоступен. Функции могут быть ограничены. ⚠️');
                addLog(`📢 Запасной бот оповестил клан`, 'info');
            }
        }, 10000);
    });
    
    bot.on('spawn', () => {
        addLog(`🌟 Бот ${username} появился в мире!`, 'success');
        
        // Запускаем PayDay проверку каждый час
        setInterval(() => {
            if (!isUsingBackup) {
                payday.processPayDay(bot, db, addLog);
            }
        }, 60 * 60 * 1000);
    });
    
    bot.on('message', async (jsonMessage) => {
        try {
            await handleMessage(bot, jsonMessage, db, { addLog, setRestartMode });
        } catch (err) {
            addLog(`❌ Ошибка обработки сообщения: ${err.message}`, 'error');
        }
    });
    
    bot.on('end', async (reason) => {
        addLog(`🔌 Бот отключён. Причина: ${reason}`, 'warn');
        await handleDisconnect(reason);
    });
    
    bot.on('error', (err) => {
        addLog(`❌ Ошибка бота: ${err.message}`, 'error');
    });
    
    bot.on('kicked', async (reason) => {
        addLog(`👢 Бот кикнут! Причина: ${reason}`, 'warn');
        await handleDisconnect(reason);
    });
    
    return bot;
}

// ============================================
// ОБРАБОТКА ОТКЛЮЧЕНИЯ И ПЕРЕПОДКЛЮЧЕНИЯ
// ============================================

async function handleDisconnect(reason) {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    
    const reasonStr = reason.toString().toLowerCase();
    
    // Проверка на бан
    if (reasonStr.includes('бан') || reasonStr.includes('banned') || reasonStr.includes('забанен')) {
        addLog(`🚫 ОСНОВНОЙ БОТ ЗАБАНЕН! Переключение на запасной...`, 'error');
        
        if (!isUsingBackup) {
            // Останавливаем текущего бота
            if (currentBot) {
                currentBot.end();
                currentBot = null;
            }
            
            // Запускаем запасного бота
            await sleep(5000);
            currentBot = await startBot(null, true);
            return;
        } else {
            addLog(`⚠️ Запасной бот тоже забанен. Ожидание 10 минут...`, 'warn');
            await sleep(10 * 60 * 1000);
            reconnectAttempts++;
            
            if (reconnectAttempts < 5) {
                currentBot = await startBot(null, true);
            } else {
                addLog(`💀 Критическая ошибка: оба бота забанены!`, 'error');
            }
            return;
        }
    }
    
    // Проверка на кик в лобби
    if (reasonStr.includes('лобби') || reasonStr.includes('lobby')) {
        addLog(`🏨 Бот перемещён в лобби. Попытка /s1...`, 'warn');
        
        if (currentBot) {
            currentBot.end();
            currentBot = null;
        }
        
        await sleep(3000);
        currentBot = await startBot(null, isUsingBackup);
        
        if (currentBot) {
            setTimeout(() => {
                currentBot.chat('/s3');
                addLog(`📝 Отправлена команда /s1 в лобби`, 'info');
            }, 5000);
        }
        return;
    }
    
    // Перезагрузка сервера в 3:00
    if (isRestartMode) {
        addLog(`🔄 Перезагрузка сервера в 3:00. Ожидание 5-10 минут...`, 'info');
        
        const now = new Date();
        const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        const minutes = mskTime.getMinutes();
        
        let waitTime = 5 * 60 * 1000; // 5 минут по умолчанию
        if (minutes < 5) {
            waitTime = (5 - minutes) * 60 * 1000;
        } else if (minutes < 10) {
            waitTime = (10 - minutes) * 60 * 1000;
        }
        
        addLog(`⏳ Ожидание ${waitTime / 1000} секунд перед переподключением...`, 'info');
        await sleep(waitTime);
        
        if (currentBot) {
            currentBot.end();
            currentBot = null;
        }
        
        currentBot = await startBot(null, false);
        return;
    }
    
    // Обычное переподключение с экспоненциальной задержкой
    const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
    reconnectAttempts++;
    
    addLog(`🔄 Переподключение через ${delay / 1000} секунд... (попытка ${reconnectAttempts})`, 'info');
    
    reconnectTimeout = setTimeout(async () => {
        try {
            if (currentBot) {
                currentBot.end();
                currentBot = null;
            }
            currentBot = await startBot(null, isUsingBackup);
        } catch (err) {
            addLog(`❌ Ошибка переподключения: ${err.message}`, 'error');
        }
    }, delay);
}

// ============================================
// ЗАПУСК МОДУЛЯ
// ============================================

async function start(db, addLogCallback) {
    if (addLogCallback) {
        global.addBotLog = addLogCallback;
    }
    
    try {
        currentBot = await startBot(db, false);
        return {
            bot: currentBot,
            setRestartMode,
            stop: async () => {
                if (currentBot) {
                    currentBot.end();
                    currentBot = null;
                }
                if (reconnectTimeout) clearTimeout(reconnectTimeout);
                if (healthCheckInterval) clearInterval(healthCheckInterval);
                addLog(`🛑 Minecraft бот остановлен`, 'info');
            }
        };
    } catch (err) {
        addLog(`❌ Фатальная ошибка запуска: ${err.message}`, 'error');
        throw err;
    }
}

module.exports = { start };