// src/shared/logger.js — Единый логгер для всей экосистемы Resistance City
// Поддерживает: console, файлы, IPC (отправка родительскому процессу), Discord webhook
// Уровни: debug, info, warn, error, success, critical

'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment');

// ==================== КОНФИГУРАЦИЯ ====================
const LOGS_DIR = process.env.LOGS_DIR || path.join(__dirname, '..', '..', 'logs');
const PROCESS_NAME = process.env.PROCESS_NAME || 'UnknownProcess';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    SUCCESS: 4,
    CRITICAL: 5,
};
const CURRENT_LOG_LEVEL = NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;
const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ
const LOG_RETENTION_DAYS = 30; // Хранить логи 30 дней

// ==================== СОЗДАНИЕ ПАПКИ ЛОГОВ ====================
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ==================== ОЧИСТКА СТАРЫХ ЛОГОВ ====================
function cleanOldLogs() {
    try {
        const files = fs.readdirSync(LOGS_DIR);
        const cutoffDate = moment().subtract(LOG_RETENTION_DAYS, 'days');

        files.forEach((file) => {
            const filePath = path.join(LOGS_DIR, file);
            const stats = fs.statSync(filePath);
            if (stats.mtime < cutoffDate) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (error) {
        // Игнорируем ошибки очистки
    }
}

// Очистка при запуске и раз в день
cleanOldLogs();
setInterval(cleanOldLogs, 86400000); // Раз в 24 часа

// ==================== РОТАЦИЯ ЛОГ-ФАЙЛОВ ====================
function rotateLogFile(logFilePath) {
    try {
        if (fs.existsSync(logFilePath)) {
            const stats = fs.statSync(logFilePath);
            if (stats.size > MAX_LOG_FILE_SIZE) {
                const backupPath = logFilePath.replace('.log', `-${moment().format('YYYY-MM-DD-HHmmss')}.log`);
                fs.renameSync(logFilePath, backupPath);
            }
        }
    } catch (error) {
        // Игнорируем ошибки ротации
    }
}

// ==================== ФОРМАТИРОВАНИЕ СООБЩЕНИЙ ====================
function formatMessage(level, processName, ...args) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
    const message = args
        .map((arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        })
        .join(' ');

    return {
        timestamp,
        level,
        processName,
        message,
        formatted: `[${timestamp}] [${level}] [${processName}] ${message}`,
    };
}

// ==================== ЗАПИСЬ В ФАЙЛ ====================
function writeToFile(formattedMessage, level) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const logFileName = `${PROCESS_NAME.toLowerCase()}-${today}.log`;
        const logFilePath = path.join(LOGS_DIR, logFileName);

        // Ротация при необходимости
        rotateLogFile(logFilePath);

        fs.appendFileSync(logFilePath, formattedMessage + '\n', 'utf8');
    } catch (error) {
        console.error(`[LOGGER] Ошибка записи в файл: ${error.message}`);
    }
}

// ==================== ВЫВОД В КОНСОЛЬ ====================
function writeToConsole(level, processName, message) {
    const prefix = chalk.gray(`[${moment().format('HH:mm:ss')}]`);
    const processTag = chalk.cyan(`[${processName}]`);

    let levelColor;
    let levelTag;

    switch (level) {
        case 'DEBUG':
            levelColor = chalk.magenta;
            levelTag = '[DEBUG]';
            break;
        case 'INFO':
            levelColor = chalk.blue;
            levelTag = '[INFO]';
            break;
        case 'WARN':
            levelColor = chalk.yellow;
            levelTag = '[WARN]';
            break;
        case 'ERROR':
            levelColor = chalk.red;
            levelTag = '[ERROR]';
            break;
        case 'SUCCESS':
            levelColor = chalk.green;
            levelTag = '[SUCCESS]';
            break;
        case 'CRITICAL':
            levelColor = chalk.bgRed.white;
            levelTag = '[CRITICAL]';
            break;
        default:
            levelColor = chalk.white;
            levelTag = `[${level}]`;
    }

    const output = `${prefix} ${processTag} ${levelColor(levelTag)} ${message}`;

    if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(output);
    } else {
        console.log(output);
    }
}

// ==================== ОТПРАВКА РОДИТЕЛЬСКОМУ ПРОЦЕССУ (IPC) ====================
function sendToParent(level, message) {
    if (process.send) {
        try {
            process.send({
                type: 'log',
                level: level.toLowerCase(),
                data: message,
                processName: PROCESS_NAME,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            // Игнорируем ошибки отправки (родитель может быть недоступен)
        }
    }
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ЛОГИРОВАНИЯ ====================
function log(level, levelValue, ...args) {
    if (levelValue < CURRENT_LOG_LEVEL) {
        return; // Пропускаем сообщения ниже текущего уровня
    }

    const { formatted, message } = formatMessage(level, PROCESS_NAME, ...args);

    // Вывод в консоль
    writeToConsole(level, PROCESS_NAME, message);

    // Запись в файл (все уровни)
    writeToFile(formatted, level);

    // Отправка родительскому процессу для централизованного логирования
    if (levelValue >= LOG_LEVELS.WARN) {
        sendToParent(level, message);
    }
}

// ==================== ПУБЛИЧНЫЙ API ЛОГГЕРА ====================
const logger = {
    /**
     * Отладочная информация (только в development)
     */
    debug(...args) {
        log('DEBUG', LOG_LEVELS.DEBUG, ...args);
    },

    /**
     * Информационное сообщение
     */
    info(...args) {
        log('INFO', LOG_LEVELS.INFO, ...args);
    },

    /**
     * Предупреждение
     */
    warn(...args) {
        log('WARN', LOG_LEVELS.WARN, ...args);
    },

    /**
     * Ошибка (не критическая)
     */
    error(...args) {
        log('ERROR', LOG_LEVELS.ERROR, ...args);
    },

    /**
     * Успешная операция
     */
    success(...args) {
        log('SUCCESS', LOG_LEVELS.SUCCESS, ...args);
    },

    /**
     * Критическая ошибка (требует внимания)
     */
    critical(...args) {
        log('CRITICAL', LOG_LEVELS.CRITICAL, ...args);
    },

    /**
     * Логирование с указанием уровня
     */
    log(level, ...args) {
        const levelUpper = level.toUpperCase();
        const levelValue = LOG_LEVELS[levelUpper] !== undefined ? LOG_LEVELS[levelUpper] : LOG_LEVELS.INFO;
        log(levelUpper, levelValue, ...args);
    },

    /**
     * Создать дочерний логгер с указанным именем процесса
     */
    child(processName) {
        return createLogger(processName);
    },

    /**
     * Получить путь к текущей папке логов
     */
    getLogsDir() {
        return LOGS_DIR;
    },

    /**
     * Получить все логи за определённую дату
     */
    getLogs(date) {
        const dateStr = typeof date === 'string' ? date : moment(date).format('YYYY-MM-DD');
        const logFileName = `${PROCESS_NAME.toLowerCase()}-${dateStr}.log`;
        const logFilePath = path.join(LOGS_DIR, logFileName);

        try {
            if (fs.existsSync(logFilePath)) {
                return fs.readFileSync(logFilePath, 'utf8');
            }
            return '';
        } catch (error) {
            return '';
        }
    },

    /**
     * Очистить все логи
     */
    clearLogs() {
        try {
            const files = fs.readdirSync(LOGS_DIR);
            files.forEach((file) => {
                fs.unlinkSync(path.join(LOGS_DIR, file));
            });
            logger.info('Все логи очищены');
        } catch (error) {
            logger.error(`Ошибка очистки логов: ${error.message}`);
        }
    },
};

// ==================== ФУНКЦИЯ СОЗДАНИЯ ДОЧЕРНЕГО ЛОГГЕРА ====================
function createLogger(processName) {
    const childProcessName = processName || PROCESS_NAME;

    return {
        debug(...args) {
            logWithName('DEBUG', LOG_LEVELS.DEBUG, childProcessName, ...args);
        },
        info(...args) {
            logWithName('INFO', LOG_LEVELS.INFO, childProcessName, ...args);
        },
        warn(...args) {
            logWithName('WARN', LOG_LEVELS.WARN, childProcessName, ...args);
        },
        error(...args) {
            logWithName('ERROR', LOG_LEVELS.ERROR, childProcessName, ...args);
        },
        success(...args) {
            logWithName('SUCCESS', LOG_LEVELS.SUCCESS, childProcessName, ...args);
        },
        critical(...args) {
            logWithName('CRITICAL', LOG_LEVELS.CRITICAL, childProcessName, ...args);
        },
    };
}

function logWithName(level, levelValue, processName, ...args) {
    if (levelValue < CURRENT_LOG_LEVEL) return;

    const { formatted, message } = formatMessage(level, processName, ...args);
    writeToConsole(level, processName, message);
    writeToFile(formatted, level);

    if (levelValue >= LOG_LEVELS.WARN) {
        sendToParent(level, message);
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    logger,
    createLogger,
    LOG_LEVELS,
};