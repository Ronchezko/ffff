// src/minecraft/index.js — Основной модуль Minecraft бота Resistance City v5.0.0
// Mineflayer-бот с полным функционалом: авто-подключение, переподключение,
// обработка чата, команды, модерация, PayDay, клан-менеджмент, RP-системы

'use strict';

// ==================== ЗАГРУЗКА ОКРУЖЕНИЯ ====================
require('dotenv').config();

// ==================== ИМПОРТЫ ====================
const mineflayer = require('mineflayer');
const path = require('path');
const fs = require('fs');
const { logger } = require('../shared/logger');
const { createLogger } = require('../shared/logger');
const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');

// ==================== ЛОГГЕР МОДУЛЯ ====================
const botLogger = createLogger('MinecraftBot');

// ==================== КОНСТАНТЫ ====================
const SERVER_HOST = process.env.MINECRAFT_HOST || config.minecraft.host;
const SERVER_PORT = parseInt(process.env.MINECRAFT_PORT) || config.minecraft.port;
const BOT_USERNAME = process.env.MINECRAFT_USERNAME || config.minecraft.username;
const BACKUP_USERNAME = process.env.MINECRAFT_BACKUP_USERNAME || config.minecraft.backupUsername;
const RECONNECT_DELAY = config.minecraft.reconnectDelay;
const MAX_RECONNECT_ATTEMPTS = config.minecraft.maxReconnectAttempts;
const LOBBY_RECONNECT_DELAY = config.minecraft.lobbyReconnectDelay;
const RESTART_TIME = config.minecraft.restartTime;
const RESTART_RECONNECT_DELAY = config.minecraft.restartReconnectDelay;

// ==================== СОСТОЯНИЕ БОТА ====================
const botState = {
    mainBot: null,
    backupBot: null,
    isMainBotActive: false,
    isBackupBotActive: false,
    isMainBotBanned: false,
    reconnectAttempts: 0,
    lastDisconnectReason: null,
    lastDisconnectTime: null,
    isServerRestarting: false,
    isGlobalFrozen: false,
    startTime: new Date(),
    chatMessageCache: new Map(),
    joinLeaveCache: new Map(),
    pendingVerifications: new Map(),
    activeSupplies: new Map(),
    activeRobberies: new Map(),
    activeFines: new Map(),
    dutyTracking: new Map(),
};

// ==================== ИМПОРТ ОБРАБОТЧИКОВ ====================
let chatHandler;
let commandHandler;
let paydayHandler;
let commandProcessor; 
let moderationHandler;
let propertyHandler;
let businessHandler;
let officeHandler;
let licenseHandler;
let verificationHandler;
let regionChecker;

// ==================== СОЗДАНИЕ БОТА ====================
function createBotOptions(username, useProxy = false) {
    const options = {
        host: SERVER_HOST,
        port: SERVER_PORT,
        username: username,
        auth: config.minecraft.authType || 'mojang',
        version: config.minecraft.version || '1.20.4',
        hideErrors: false,
        checkTimeoutInterval: 60000,
        connectTimeout: 30000,
        keepAlive: true,
        physicsEnabled: false,
        chat: 'enabled',
        viewDistance: 'tiny',
    };

    // Прокси
    if (useProxy && config.minecraft.proxy.enabled) {
        try {
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const proxyUrl = `socks${config.minecraft.proxy.version}://${config.minecraft.proxy.host}:${config.minecraft.proxy.port}`;
            options.agent = new SocksProxyAgent(proxyUrl);
            botLogger.info(`Используется прокси: ${proxyUrl}`);
        } catch (error) {
            botLogger.warn(`Не удалось настроить прокси: ${error.message}. Подключение без прокси.`);
        }
    }

    return options;
}

// ==================== ИНИЦИАЛИЗАЦИЯ ОСНОВНОГО БОТА ====================
function initMainBot() {
    if (botState.isMainBotActive) {
        botLogger.warn('Основной бот уже активен, пропускаем инициализацию');
        return;
    }

    if (botState.isGlobalFrozen) {
        botLogger.warn('Глобальная заморозка активна, бот не запускается');
        return;
    }

    botLogger.info(`Инициализация основного бота: ${BOT_USERNAME}`);

    const options = createBotOptions(BOT_USERNAME, config.minecraft.proxy.enabled);

    try {
        const bot = mineflayer.createBot(options);
        botState.mainBot = bot;
        setupBotEvents(bot, false);
    } catch (error) {
        botLogger.error(`Ошибка создания основного бота: ${error.message}`);
        botLogger.error(error.stack);
        scheduleReconnect(false);
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ РЕЗЕРВНОГО БОТА ====================
function initBackupBot() {
    if (botState.isBackupBotActive) {
        botLogger.warn('Резервный бот уже активен, пропускаем инициализацию');
        return;
    }

    if (!botState.isMainBotBanned) {
        botLogger.info('Основной бот не забанен, резервный бот не требуется');
        return;
    }

    botLogger.info(`Инициализация резервного бота: ${BACKUP_USERNAME}`);

    const options = createBotOptions(BACKUP_USERNAME, false);

    try {
        const bot = mineflayer.createBot(options);
        botState.backupBot = bot;
        setupBotEvents(bot, true);
    } catch (error) {
        botLogger.error(`Ошибка создания резервного бота: ${error.message}`);
        botLogger.error(error.stack);
    }
}

// ==================== НАСТРОЙКА СОБЫТИЙ БОТА ====================
function setupBotEvents(bot, isBackup) {
    const botType = isBackup ? 'Резервный' : 'Основной';

    bot.on('login', () => {
        botLogger.success(`${botType} бот ${bot.username} авторизован на сервере`);
        botState.reconnectAttempts = 0;

        // Защита от запрещённых символов
        const originalChat = bot.chat.bind(bot);
        bot.chat = function(message) {
            if (!message) return;
            const safeMessage = String(message)
                .replace(/\n/g, ' ')
                .replace(/\r/g, ' ')
                .replace(/\t/g, ' ')
                .substring(0, 255);
            return originalChat(safeMessage);
        };

        if (isBackup) {
            botState.isBackupBotActive = true;
        } else {
            botState.isMainBotActive = true;
            botState.isMainBotBanned = false;
        }

        if (process.send) {
            process.send({
                type: 'ready',
                botType: isBackup ? 'backup' : 'main',
                username: bot.username,
            });
        }

        setTimeout(() => {
            const loginCommand = process.env.MINECRAFT_LOGIN_COMMAND;
            if (loginCommand) {
                botLogger.info(`${botType} бот: выполняем вход...`);
                bot.chat(loginCommand);
            }
        }, 2000);

        setTimeout(() => {
            if (!isBackup) {
                botLogger.info(`${botType} бот: подключаемся к серверу клана...`);
                bot.chat(config.clan.serverCommand || '/s3');
            }
        }, 5000);

        setTimeout(() => {
            if (!isBackup) {
                const welcomeMessage = utils.formatClanMessage(
                    `&#76C519Бот успешно запущен и готов к работе! &#D4D4D4| &#80C4C5Используйте &#FFB800/help &#80C4C5для списка команд`
                );
                bot.chat(`/cc ${welcomeMessage}`);
            } else {
                bot.chat(`/cc &#CA4E4E[БЭКАП] Основной бот забанен. Функционал ограничен.`);
            }
        }, 8000);

        initializeHandlers(bot, isBackup);
        startPeriodicTasks(bot, isBackup);
    });

    // ==================== СОБЫТИЕ: СООБЩЕНИЕ В ЧАТЕ ====================
    bot.on('message', (jsonMsg) => {
        const message = jsonMsg.toString().trim();
        if (!message || message.length === 0) return;

        // Логируем все сообщения (для отладки)
        botLogger.debug(`[CHAT] ${message.substring(0, 200)}`);

        // Проверка на перемещение в лобби
        if (utils.isMovedToLobby(message)) {
            handleLobbyKick(bot, isBackup, message);
            return;
        }

        // Проверка на бан
        if (message.includes('забанен') || message.includes('заблокирован') || message.includes('бан')) {
            if (message.toLowerCase().includes(bot.username.toLowerCase())) {
                handleBotBan(bot, isBackup, message);
                return;
            }
        }

        // Передаём сообщение в обработчик чата
        if (chatHandler) {
            try {
                chatHandler(bot, message, jsonMsg, isBackup);
            } catch (error) {
                botLogger.error(`Ошибка в chatHandler: ${error.message}`);
            }
        }
    });

    // ==================== СОБЫТИЕ: КИК ====================
    bot.on('kicked', (reason) => {
        const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
        botLogger.warn(`${botType} бот кикнут: ${reasonStr}`);
        botState.lastDisconnectReason = reasonStr;
        botState.lastDisconnectTime = new Date();

        if (isBackup) {
            botState.isBackupBotActive = false;
        } else {
            botState.isMainBotActive = false;
        }

        // Проверка на бан
        if (reasonStr.toLowerCase().includes('ban') || reasonStr.toLowerCase().includes('бан')) {
            if (!isBackup) {
                botState.isMainBotBanned = true;
                botLogger.warn('Основной бот забанен! Запускаем резервного...');
                initBackupBot();
            }
        }

        // Переподключение
        const isLobbyKick = reasonStr.includes('лобби') || reasonStr.includes('lobby');
        const delay = isLobbyKick ? LOBBY_RECONNECT_DELAY : RECONNECT_DELAY;
        scheduleReconnect(isBackup, delay);
    });

    // ==================== СОБЫТИЕ: ОТКЛЮЧЕНИЕ ====================
    bot.on('end', (reason) => {
        botLogger.warn(`${botType} бот отключён: ${reason}`);
        botState.lastDisconnectReason = reason;
        botState.lastDisconnectTime = new Date();

        if (isBackup) {
            botState.isBackupBotActive = false;
        } else {
            botState.isMainBotActive = false;
        }

        // Проверка времени — возможна перезагрузка сервера
        const now = new Date();
        const restartHour = parseInt(RESTART_TIME.split(':')[0]);
        const restartMinute = parseInt(RESTART_TIME.split(':')[1]);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour === restartHour && currentMinute >= 0 && currentMinute <= 15) {
            botState.isServerRestarting = true;
            botLogger.info('Обнаружена перезагрузка сервера. Ожидание...');
            scheduleReconnect(isBackup, RESTART_RECONNECT_DELAY);
            return;
        }

        scheduleReconnect(isBackup);
    });

    // ==================== СОБЫТИЕ: ОШИБКА ====================
    bot.on('error', (err) => {
        botLogger.error(`${botType} бот: ошибка — ${err.message}`);
        botLogger.error(err.stack);

        // Не завершаем процесс при ошибке бота
        if (isBackup) {
            botState.isBackupBotActive = false;
        } else {
            botState.isMainBotActive = false;
        }
    });

    // ==================== СОБЫТИЕ: СПАВН ====================
    bot.on('spawn', () => {
        botLogger.info(`${botType} бот появился в мире`);

        // Телепортация на точку (если указана)
        // ВАЖНО: замените координаты на свои
        // setTimeout(() => {
        //     bot.chat('/tppos 0 64 0');
        // }, 2000);
    });

    // ==================== СОБЫТИЕ: ЗДОРОВЬЕ ====================
    bot.on('health', () => {
        // Авто-регенерация (если нужно)
        // if (bot.health < 10) {
        //     bot.chat('/heal');
        // }
    });

    // ==================== СОБЫТИЕ: СМЕРТЬ ====================
    bot.on('death', () => {
        botLogger.warn(`${botType} бот умер!`);
        // Авто-респавн
        setTimeout(() => {
            bot.chat('/respawn');
        }, 1000);
    });
}

// ==================== ОБРАБОТКА КИКА В ЛОББИ ====================
function handleLobbyKick(bot, isBackup, message) {
    botLogger.warn(`Бот перемещён в лобби: ${message}`);

    if (isBackup) {
        botState.isBackupBotActive = false;
    } else {
        botState.isMainBotActive = false;
    }

    // Пробуем сразу переподключиться к серверу
    setTimeout(() => {
        if (bot && bot.connected) {
            botLogger.info('Попытка вернуться на сервер клана...');
            bot.chat(config.clan.serverCommand || '/s3');
        } else {
            scheduleReconnect(isBackup, LOBBY_RECONNECT_DELAY);
        }
    }, 3000);
}

// ==================== ОБРАБОТКА БАНА БОТА ====================
function handleBotBan(bot, isBackup, message) {
    botLogger.error(`Бот забанен: ${message}`);

    if (!isBackup) {
        botState.isMainBotBanned = true;
        botState.isMainBotActive = false;
        botLogger.warn('Запуск резервного бота для уведомлений...');
        initBackupBot();
    } else {
        botState.isBackupBotActive = false;
        botLogger.error('Резервный бот тоже забанен! Требуется ручное вмешательство.');
    }
}

// ==================== ПЛАНИРОВАНИЕ ПЕРЕПОДКЛЮЧЕНИЯ ====================
function scheduleReconnect(isBackup, delay = RECONNECT_DELAY) {
    botState.reconnectAttempts++;

    if (botState.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        botLogger.error(`Достигнут лимит попыток переподключения (${MAX_RECONNECT_ATTEMPTS}). Остановка.`);
        if (process.send) {
            process.send({
                type: 'error',
                data: `Minecraft бот: превышен лимит переподключений (${MAX_RECONNECT_ATTEMPTS})`,
            });
        }
        return;
    }

    botLogger.info(
        `Планирование переподключения ${isBackup ? 'резервного' : 'основного'} бота ` +
        `через ${delay / 1000}с (попытка ${botState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    );

    setTimeout(() => {
        if (botState.isGlobalFrozen) {
            botLogger.warn('Глобальная заморозка. Переподключение отменено.');
            return;
        }

        if (isBackup) {
            initBackupBot();
        } else if (!botState.isMainBotBanned) {
            initMainBot();
        }
    }, delay);
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================
function startPeriodicTasks(bot, isBackup) {
    if (isBackup) return;

    // PayDay каждый час
    setInterval(() => {
        if (paydayHandler && !botState.isGlobalFrozen) {
            try {
                paydayHandler.processPayday(bot);
            } catch (error) {
                botLogger.error(`Ошибка PayDay: ${error.message}`);
            }
        }
    }, config.payday.intervalHours * 3600000);

    // Проверка регионов каждый час
    setInterval(() => {
        if (regionChecker && !botState.isGlobalFrozen) {
            try {
                regionChecker.checkAllRegions(bot);
            } catch (error) {
                botLogger.error(`Ошибка проверки регионов: ${error.message}`);
            }
        }
    }, 3600000);

    // Сброс дневных лимитов персонала (в полночь)
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            botLogger.info('Сброс дневных лимитов персонала');
            db.staff.resetDailyLimits();
            db.cooldowns.clear();
        }
    }, 60000);

    // Очистка истёкших наказаний каждые 5 минут
    setInterval(() => {
        try {
            db.punishments.removeAllExpired();
        } catch (error) {
            botLogger.error(`Ошибка очистки наказаний: ${error.message}`);
        }
    }, 300000);

    // Проверка истекающих лицензий (каждые 6 часов)
    setInterval(() => {
        if (licenseHandler) {
            try {
                licenseHandler.checkExpiringLicenses(bot);
            } catch (error) {
                botLogger.error(`Ошибка проверки лицензий: ${error.message}`);
            }
        }
    }, 21600000);

    // Heartbeat родительскому процессу
    setInterval(() => {
        if (process.send) {
            process.send({
                type: 'heartbeat',
                botType: isBackup ? 'backup' : 'main',
                username: bot.username,
                uptime: Math.floor((Date.now() - botState.startTime) / 1000),
            });
        }
    }, 30000);

    // Очистка кэша сообщений (каждую минуту)
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of botState.chatMessageCache) {
            if (now - value.timestamp > 60000) {
                botState.chatMessageCache.delete(key);
            }
        }
    }, 60000);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ====================
function initializeHandlers(bot, isBackup) {
    if (isBackup) return;

    try {
    chatHandler = require('./chatHandler');
    botLogger.success('chatHandler загружен');
} catch(e) {
    botLogger.error('ОШИБКА chatHandler: ' + e.message);
    botLogger.error(e.stack);
}

try {
    commandProcessor = require('./commands/index');
    botLogger.success('commandProcessor загружен, тип: ' + typeof commandProcessor);
    if (commandProcessor && typeof commandProcessor.processCommand === 'function') {
        botLogger.success('processCommand найден');
    } else {
        botLogger.error('processCommand НЕ НАЙДЕН в commandProcessor');
    }


        // Остальные модули пробуем загрузить но не падаем при ошибке
        try { paydayHandler = require('./payday'); } catch(e) { botLogger.warn('payday не загружен: ' + e.message); }
        try { moderationHandler = require('./moderation'); } catch(e) { botLogger.warn('moderation не загружен: ' + e.message); }
        try { propertyHandler = require('./property'); } catch(e) { botLogger.warn('property не загружен: ' + e.message); }
        try { businessHandler = require('./businesses'); } catch(e) { botLogger.warn('businesses не загружен: ' + e.message); }
        try { officeHandler = require('./offices'); } catch(e) { botLogger.warn('offices не загружен: ' + e.message); }
        try { licenseHandler = require('./licenses'); } catch(e) { botLogger.warn('licenses не загружен: ' + e.message); }
        try { verificationHandler = require('../discord/verification'); } catch(e) { botLogger.warn('discord/verification не загружен: ' + e.message); }
        try { regionChecker = require('./regionChecker'); } catch(e) { botLogger.warn('regionChecker не загружен: ' + e.message); }

        // Передаём бота в обработчики
        if (paydayHandler && paydayHandler.setBot) paydayHandler.setBot(bot);
        if (moderationHandler && moderationHandler.setBot) moderationHandler.setBot(bot);
        if (propertyHandler && propertyHandler.setBot) propertyHandler.setBot(bot);
        if (regionChecker && regionChecker.setBot) regionChecker.setBot(bot);

        botLogger.success('Все доступные обработчики инициализированы');
    } catch (error) {
        botLogger.error('КРИТИЧЕСКАЯ ошибка: ' + error.message);
        botLogger.error(error.stack);
    }
}

// ==================== IPC: ОБРАБОТКА СООБЩЕНИЙ ОТ РОДИТЕЛЯ ====================
process.on('message', (message) => {
    if (!message || !message.type) return;

    switch (message.type) {
        case 'init':
            botLogger.info(`Получено init-сообщение от оркестратора: ${JSON.stringify(message)}`);
            break;

        case 'graceful_shutdown':
            botLogger.warn('Получен запрос на завершение от оркестратора');
            gracefulShutdown(message.restart);
            break;

        case 'heartbeat':
            // Отвечаем статусом
            if (process.send) {
                process.send({
                    type: 'stats',
                    data: {
                        mainBotActive: botState.isMainBotActive,
                        backupBotActive: botState.isBackupBotActive,
                        mainBotBanned: botState.isMainBotBanned,
                        reconnectAttempts: botState.reconnectAttempts,
                        uptime: Math.floor((Date.now() - botState.startTime) / 1000),
                    },
                });
            }
            break;

        case 'command':
            // Выполнение команды от веб-панели
            if (message.command && botState.mainBot && botState.mainBot.connected) {
                botState.mainBot.chat(message.command);
                botLogger.info(`Выполнена команда от веб-панели: ${message.command}`);
            }
            break;

        case 'restart_bot':
            botLogger.warn('Получен запрос на перезапуск бота');
            if (botState.mainBot && botState.mainBot.connected) {
                botState.mainBot.quit('Restart requested');
            }
            botState.reconnectAttempts = 0;
            setTimeout(() => initMainBot(), 5000);
            break;

        case 'global_freeze':
            botState.isGlobalFrozen = message.enabled;
            botLogger.warn(`Глобальная заморозка: ${message.enabled ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}`);
            break;

        default:
            botLogger.debug(`Неизвестный тип IPC-сообщения: ${message.type}`);
    }
});

// ==================== GRACEFUL SHUTDOWN ====================
function gracefulShutdown(restart = false) {
    botLogger.warn('Выполнение graceful shutdown...');

    // Останавливаем основного бота
    if (botState.mainBot && botState.mainBot.connected) {
        try {
            botState.mainBot.chat('/cc &#CA4E4EБот отключается для обслуживания...');
        } catch (e) {}
        setTimeout(() => {
            try { botState.mainBot.quit('Graceful shutdown'); } catch (e) {}
        }, 2000);
    }

    // Останавливаем резервного бота
    if (botState.backupBot && botState.backupBot.connected) {
        setTimeout(() => {
            try { botState.backupBot.quit('Graceful shutdown'); } catch (e) {}
        }, 2000);
    }

    if (!restart) {
        // Отправляем подтверждение родителю
        if (process.send) {
            process.send({ type: 'shutdown', reason: 'graceful' });
        }

        // Завершаем процесс через некоторое время
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    } else {
        // Перезапуск
        botState.isMainBotActive = false;
        botState.isBackupBotActive = false;
        botState.reconnectAttempts = 0;

        if (process.send) {
            process.send({ type: 'restart', reason: 'graceful' });
        }

        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
}

// ==================== ОБРАБОТЧИКИ ПРОЦЕССА ====================
process.on('SIGINT', () => {
    botLogger.warn('Получен SIGINT');
    gracefulShutdown(false);
});

process.on('SIGTERM', () => {
    botLogger.warn('Получен SIGTERM');
    gracefulShutdown(false);
});

process.on('uncaughtException', (err) => {
    botLogger.error(`Необработанное исключение: ${err.message}`);
    botLogger.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
    botLogger.error(`Необработанный Promise rejection: ${reason}`);
});

// ==================== ЭКСПОРТ СОСТОЯНИЯ ====================
function getState() {
    return {
        mainBotActive: botState.isMainBotActive,
        backupBotActive: botState.isBackupBotActive,
        mainBotBanned: botState.isMainBotBanned,
        reconnectAttempts: botState.reconnectAttempts,
        isGlobalFrozen: botState.isGlobalFrozen,
        uptime: Math.floor((Date.now() - botState.startTime) / 1000),
        lastDisconnectReason: botState.lastDisconnectReason,
        lastDisconnectTime: botState.lastDisconnectTime,
    };
}

// ==================== ЗАПУСК ====================
botLogger.info('╔══════════════════════════════════════════╗');
botLogger.info('║  MINECRAFT BOT — RESISTANCE CITY v5.0.0 ║');
botLogger.info('╚══════════════════════════════════════════╝');
botLogger.info(`Сервер: ${SERVER_HOST}:${SERVER_PORT}`);
botLogger.info(`Основной бот: ${BOT_USERNAME}`);
botLogger.info(`Резервный бот: ${BACKUP_USERNAME}`);
botLogger.info(`Прокси: ${config.minecraft.proxy.enabled ? 'включен' : 'выключен'}`);

// Запуск основного бота
initMainBot();

// Проверка каждые 5 минут — не упал ли бот без события end
setInterval(() => {
    if (!botState.isMainBotActive && !botState.isMainBotBanned && !botState.isGlobalFrozen) {
        botLogger.warn('Основной бот не активен. Попытка переподключения...');
        initMainBot();
    }

    if (botState.isMainBotBanned && !botState.isBackupBotActive && !botState.isGlobalFrozen) {
        botLogger.warn('Резервный бот не активен. Попытка запуска...');
        initBackupBot();
    }
}, 300000);

module.exports = {
    getState,
    initMainBot,
    initBackupBot,
    gracefulShutdown,
    botState,
};