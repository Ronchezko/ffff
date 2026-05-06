// src/main.js — Главный оркестратор экосистемы Resistance City v5.0.0
// Запускает и управляет всеми дочерними процессами: Discord бот, Minecraft бот, Веб-сервер
// Обеспечивает graceful shutdown, автоматический перезапуск при падениях и изоляцию процессов

'use strict';

// ==================== ЗАГРУЗКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ====================
require('dotenv').config();

// ==================== ИМПОРТЫ ====================
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
let chalk;
try {
    chalk = require('chalk');
} catch (e) {
    // Fallback если chalk v5+ (ESM)
    chalk = {
        gray: (text) => `\x1b[90m${text}\x1b[0m`,
        blue: (text) => `\x1b[34m${text}\x1b[0m`,
        yellow: (text) => `\x1b[33m${text}\x1b[0m`,
        red: (text) => `\x1b[31m${text}\x1b[0m`,
        green: (text) => `\x1b[32m${text}\x1b[0m`,
        magenta: (text) => `\x1b[35m${text}\x1b[0m`,
        cyan: (text) => `\x1b[36m${text}\x1b[0m`,
        white: (text) => `\x1b[37m${text}\x1b[0m`,
        bgRed: { white: (text) => `\x1b[41m\x1b[37m${text}\x1b[0m` },
    };
}

// ==================== КОНСТАНТЫ ====================
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const PROCESS_RESTART_WINDOW_MS = 60000; // Окно для подсчёта перезапусков (1 минута)
const MAX_RESTARTS_IN_WINDOW = 5; // Максимум перезапусков в окне
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15000; // Таймаут для принудительного завершения

// ==================== СОЗДАНИЕ ПАПКИ ДЛЯ ЛОГОВ ====================
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log(chalk.green(`[ORCHESTRATOR] Создана папка логов: ${LOGS_DIR}`));
}

// ==================== ЛОГГЕР ГЛАВНОГО ПРОЦЕССА ====================
const logger = {
    _log(level, color, tag, ...args) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const prefix = `${chalk.gray(`[${timestamp}]`)} ${color(`[${tag}]`)}`;
        console.log(prefix, ...args);

        // Запись в файл
        const logFile = path.join(LOGS_DIR, `orchestrator-${new Date().toISOString().substring(0, 10)}.log`);
        const logLine = `[${timestamp}] [${tag}] [${level}] ${args.join(' ')}\n`;
        fs.appendFileSync(logFile, logLine);
    },
    info(...args) {
        this._log('INFO', chalk.blue, 'ORCHESTRATOR', ...args);
    },
    warn(...args) {
        this._log('WARN', chalk.yellow, 'ORCHESTRATOR', ...args);
    },
    error(...args) {
        this._log('ERROR', chalk.red, 'ORCHESTRATOR', ...args);
    },
    success(...args) {
        this._log('SUCCESS', chalk.green, 'ORCHESTRATOR', ...args);
    },
    debug(...args) {
        if (process.env.NODE_ENV === 'development') {
            this._log('DEBUG', chalk.magenta, 'ORCHESTRATOR', ...args);
        }
    },
};

// ==================== КОНФИГУРАЦИЯ ПРОЦЕССОВ ====================
const PROCESS_DEFINITIONS = {
    DISCORD: {
        name: 'DiscordBot',
        description: 'Discord бот для команд, верификации и логирования',
        path: path.join(__dirname, 'discord', 'index.js'),
        restartDelayMs: 10000,
        critical: true,
        autoRestart: true,
    },
    MINECRAFT: {
        name: 'MinecraftBot',
        description: 'Minecraft бот на Mineflayer для внутриигрового взаимодействия',
        path: path.join(__dirname, 'minecraft', 'index.js'),
        restartDelayMs: 30000,
        critical: true,
        autoRestart: true,
    },
    WEBSERVER: {
        name: 'WebServer',
        description: 'Веб-сервер с админ-панелью и публичным сайтом',
        path: path.join(__dirname, 'web', 'server.js'),
        restartDelayMs: 5000,
        critical: false,
        autoRestart: true,
    },
};

// ==================== СОСТОЯНИЕ ПРОЦЕССОВ ====================
const processState = {};
const children = {};
const restartHistory = {};
let isShuttingDown = false;

// Инициализация состояния для каждого процесса
Object.values(PROCESS_DEFINITIONS).forEach((def) => {
    processState[def.name] = {
        status: 'stopped',
        pid: null,
        startCount: 0,
        crashCount: 0,
        lastStartTime: null,
        lastCrashTime: null,
        lastCrashReason: null,
    };
    restartHistory[def.name] = [];
});

// ==================== ФУНКЦИИ УПРАВЛЕНИЯ ПРОЦЕССАМИ ====================

/**
 * Проверяет, не превышен ли лимит перезапусков в заданном окне
 */
function isRestartLimitExceeded(processName) {
    const now = Date.now();
    const windowStart = now - PROCESS_RESTART_WINDOW_MS;

    // Очищаем старые записи
    restartHistory[processName] = restartHistory[processName].filter(
        (timestamp) => timestamp > windowStart
    );

    // Добавляем текущую
    restartHistory[processName].push(now);

    // Проверяем лимит
    if (restartHistory[processName].length > MAX_RESTARTS_IN_WINDOW) {
        logger.error(
            `${processName}: превышен лимит перезапусков ` +
            `(${restartHistory[processName].length}/${MAX_RESTARTS_IN_WINDOW} за ${PROCESS_RESTART_WINDOW_MS / 1000}с)`
        );
        return true;
    }
    return false;
}

/**
 * Запускает дочерний процесс
 */
function startProcess(processName) {
    if (isShuttingDown) {
        logger.warn(`Пропуск запуска ${processName} — выполняется завершение системы`);
        return;
    }

    const def = PROCESS_DEFINITIONS[Object.keys(PROCESS_DEFINITIONS).find(
        (key) => PROCESS_DEFINITIONS[key].name === processName
    )];

    if (!def) {
        logger.error(`Неизвестный процесс: ${processName}`);
        return;
    }

    // Проверка, не запущен ли уже
    if (children[processName] && children[processName].connected) {
        logger.warn(`${processName} уже запущен (PID: ${children[processName].pid}). Пропускаем.`);
        return;
    }

    // Проверка лимита перезапусков
    if (isRestartLimitExceeded(processName)) {
        logger.error(`${processName}: ПРЕВЫШЕН ЛИМИТ ПЕРЕЗАПУСКОВ. Требуется ручное вмешательство.`);
        processState[processName].status = 'failed';
        return;
    }

    // Проверка существования файла
    if (!fs.existsSync(def.path)) {
        logger.error(`${processName}: файл не найден: ${def.path}`);
        processState[processName].status = 'error';
        return;
    }

    logger.info(`Запуск ${processName} (${def.description})...`);

    try {
        const child = fork(def.path, [], {
            silent: true,
            env: {
                ...process.env,
                PROCESS_NAME: processName,
                PROCESS_START_TIME: new Date().toISOString(),
            },
            stdio: 'pipe',
        });

        // Сохраняем ссылку
        children[processName] = child;

        // Обновляем состояние
        processState[processName] = {
            ...processState[processName],
            status: 'running',
            pid: child.pid,
            startCount: processState[processName].startCount + 1,
            lastStartTime: new Date().toISOString(),
            lastCrashReason: null,
        };

        logger.success(`${processName} запущен (PID: ${child.pid})`);

        // Обработка stdout
        if (child.stdout) {
            child.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                lines.forEach((line) => {
                    if (line) {
                        console.log(chalk.cyan(`[${processName}]`) + ` ${line}`);
                    }
                });
            });
        }

        // Обработка stderr
        if (child.stderr) {
            child.stderr.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                lines.forEach((line) => {
                    if (line) {
                        console.log(chalk.red(`[${processName}:STDERR]`) + ` ${line}`);
                    }
                });
            });
        }

        // Обработка сообщений от дочернего процесса (IPC)
        child.on('message', (message) => {
            handleChildMessage(processName, message);
        });

        // Обработка завершения процесса
        child.on('exit', (code, signal) => {
            handleChildExit(processName, code, signal, def);
        });

        // Обработка ошибок процесса
        child.on('error', (err) => {
            logger.error(`${processName}: ошибка запуска — ${err.message}`);
            processState[processName].status = 'error';
            processState[processName].lastCrashReason = err.message;
        });

        // Отправляем приветственное сообщение дочернему процессу
        child.send({
            type: 'init',
            processName: processName,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        logger.error(`${processName}: исключение при запуске — ${error.message}`);
        logger.error(error.stack);
        processState[processName].status = 'error';
        processState[processName].lastCrashReason = error.message;
    }
}

/**
 * Обрабатывает IPC-сообщения от дочернего процесса
 */
function handleChildMessage(processName, message) {
    if (!message || !message.type) return;

    logger.debug(`${processName}: получено IPC-сообщение типа "${message.type}"`);

    switch (message.type) {
        case 'ready':
            logger.success(`${processName}: подтвердил готовность к работе`);
            processState[processName].status = 'ready';
            break;

        case 'shutdown':
            logger.warn(`${processName}: запросил graceful shutdown (причина: ${message.reason || 'не указана'})`);
            stopProcess(processName, false);
            break;

        case 'restart':
            logger.warn(`${processName}: запросил перезапуск (причина: ${message.reason || 'не указана'})`);
            stopProcess(processName, true);
            break;

        case 'heartbeat':
            // Обновляем время последней активности
            processState[processName].lastHeartbeat = new Date().toISOString();
            break;

        case 'error':
            logger.error(`${processName}: сообщил об ошибке — ${message.data || message.error || 'неизвестная ошибка'}`);
            processState[processName].lastError = message.data || message.error;
            break;

        case 'log':
            if (message.level === 'error') {
                logger.error(`[${processName}:IPC] ${message.data}`);
            } else if (message.level === 'warn') {
                logger.warn(`[${processName}:IPC] ${message.data}`);
            } else {
                logger.info(`[${processName}:IPC] ${message.data}`);
            }
            break;

        case 'stats':
            // Получаем статистику от дочернего процесса
            if (message.data) {
                processState[processName].stats = message.data;
            }
            break;

        default:
            logger.debug(`${processName}: неизвестный тип IPC-сообщения: ${message.type}`);
    }
}

/**
 * Обрабатывает завершение дочернего процесса
 */
function handleChildExit(processName, code, signal, def) {
    const exitReason = signal
        ? `сигнал ${signal}`
        : `код ${code}`;

    if (code === 0 && !signal) {
        logger.info(`${processName}: завершился нормально (${exitReason})`);
    } else {
        logger.warn(`${processName}: аварийное завершение (${exitReason})`);
        processState[processName].crashCount++;
        processState[processName].lastCrashTime = new Date().toISOString();
        processState[processName].lastCrashReason = exitReason;
    }

    processState[processName].status = 'stopped';
    processState[processName].pid = null;
    delete children[processName];

    // Автоматический перезапуск
    if (!isShuttingDown && def.autoRestart && !shutdownFlags[processName]) {
        const delay = def.restartDelayMs;
        logger.warn(`${processName}: перезапуск через ${delay / 1000}с...`);
        setTimeout(() => startProcess(processName), delay);
    }
}

/**
 * Останавливает дочерний процесс
 */
function stopProcess(processName, restart = false) {
    const child = children[processName];
    if (!child || !child.connected) {
        logger.warn(`${processName}: не запущен, остановка не требуется`);
        delete children[processName];
        return;
    }

    logger.info(`Остановка ${processName}${restart ? ' (с последующим перезапуском)' : ''}...`);

    if (!restart) {
        shutdownFlags[processName] = true;
    }

    try {
        // Отправляем запрос на graceful shutdown
        child.send({
            type: 'graceful_shutdown',
            restart: restart,
            timestamp: new Date().toISOString(),
        });

        // Если процесс не завершился за 10 секунд — принудительно
        const forceKillTimeout = setTimeout(() => {
            if (children[processName] && children[processName].connected) {
                logger.warn(`${processName}: принудительное завершение (SIGTERM)...`);
                child.kill('SIGTERM');

                // Ещё через 5 секунд — SIGKILL
                setTimeout(() => {
                    if (children[processName] && children[processName].connected) {
                        logger.warn(`${processName}: жёсткое завершение (SIGKILL)...`);
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, 10000);

        // Очищаем таймер при нормальном завершении
        child.once('exit', () => {
            clearTimeout(forceKillTimeout);
        });

    } catch (error) {
        logger.error(`${processName}: ошибка при остановке — ${error.message}`);
        try {
            child.kill('SIGKILL');
        } catch (e) {
            // Игнорируем ошибки принудительного завершения
        }
    }
}

// Объект для флагов завершения (не перезапускать)
const shutdownFlags = {};

// ==================== ЗАПУСК ВСЕХ ПРОЦЕССОВ ====================
function startAllProcesses() {
    logger.success('══════════════════════════════════════════════');
    logger.success('  RESISTANCE CITY ECOSYSTEM v5.0.0');
    logger.success('  Свободный Город «Сопротивление»');
    logger.success('  Запуск экосистемы...');
    logger.success('══════════════════════════════════════════════');

    const processList = Object.values(PROCESS_DEFINITIONS);

    // Сбрасываем флаги
    Object.keys(shutdownFlags).forEach((key) => delete shutdownFlags[key]);

    // Сбрасываем историю перезапусков
    Object.keys(restartHistory).forEach((key) => {
        restartHistory[key] = [];
    });

    // Последовательный запуск с задержкой для предотвращения конфликтов
    processList.forEach((def, index) => {
        const delay = index * 2000; // 2 секунды между запусками
        logger.info(`Планирование запуска ${def.name} через ${delay / 1000}с...`);
        setTimeout(() => startProcess(def.name), delay);
    });

    logger.info('Все процессы запланированы к запуску');
}

// ==================== GRACEFUL SHUTDOWN ====================
function gracefulShutdownAll(signal) {
    if (isShuttingDown) {
        logger.warn('Завершение уже выполняется...');
        return;
    }

    isShuttingDown = true;
    logger.warn(`╔══════════════════════════════════════════╗`);
    logger.warn(`║  Получен сигнал ${signal}. Завершение...     ║`);
    logger.warn(`╚══════════════════════════════════════════╝`);

    const processNames = Object.keys(children);

    if (processNames.length === 0) {
        logger.info('Нет активных процессов. Завершение.');
        process.exit(0);
    }

    logger.info(`Активных процессов для остановки: ${processNames.length}`);

    // Останавливаем все процессы
    processNames.forEach((name) => {
        logger.info(`Отправка сигнала остановки для ${name}...`);
        stopProcess(name, false);
    });

    // Таймер принудительного завершения
    logger.warn(`Принудительное завершение основного процесса через ${GRACEFUL_SHUTDOWN_TIMEOUT_MS / 1000}с, если процессы не остановятся...`);

    const forceExitTimeout = setTimeout(() => {
        const remainingProcesses = Object.keys(children).filter(
            (name) => children[name] && children[name].connected
        );
        if (remainingProcesses.length > 0) {
            logger.warn(`Принудительное завершение. Осталось процессов: ${remainingProcesses.join(', ')}`);
            remainingProcesses.forEach((name) => {
                try {
                    children[name].kill('SIGKILL');
                } catch (e) {
                    // Игнорируем
                }
            });
        }
        process.exit(0);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    // Не блокируем выход
    forceExitTimeout.unref();
}

// ==================== ОБРАБОТЧИКИ СИГНАЛОВ ====================
process.on('SIGINT', () => {
    logger.warn('Получен SIGINT (Ctrl+C)');
    gracefulShutdownAll('SIGINT');
});

process.on('SIGTERM', () => {
    logger.warn('Получен SIGTERM');
    gracefulShutdownAll('SIGTERM');
});

process.on('SIGQUIT', () => {
    logger.warn('Получен SIGQUIT');
    gracefulShutdownAll('SIGQUIT');
});

// ==================== ОБРАБОТЧИКИ НЕОБРАБОТАННЫХ ОШИБОК ====================
process.on('uncaughtException', (err) => {
    logger.error('╔════════ НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ ════════╗');
    logger.error(`║  ${err.message}`);
    if (err.stack) {
        err.stack.split('\n').forEach((line) => logger.error(`║  ${line.trim()}`));
    }
    logger.error('╚══════════════════════════════════════════╝');

    // Записываем в файл
    const crashLogFile = path.join(LOGS_DIR, `crash-${new Date().toISOString().replace(/:/g, '-')}.log`);
    fs.writeFileSync(crashLogFile, `Uncaught Exception:\n${err.stack || err.message}\n\n`);
    logger.error(`Детали записаны в: ${crashLogFile}`);

    // Не завершаем процесс, но логируем
    // process.exit(1); // Раскомментировать для строгого режима
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('╔════ НЕОБРАБОТАННЫЙ PROMISE REJECTION ════╗');
    logger.error(`║  Reason: ${reason}`);
    if (reason && reason.stack) {
        reason.stack.split('\n').forEach((line) => logger.error(`║  ${line.trim()}`));
    }
    logger.error('╚══════════════════════════════════════════╝');

    const crashLogFile = path.join(LOGS_DIR, `rejection-${new Date().toISOString().replace(/:/g, '-')}.log`);
    fs.writeFileSync(crashLogFile,
        `Unhandled Rejection:\n${reason?.stack || reason}\n\nPromise: ${promise}\n`);
});

process.on('warning', (warning) => {
    logger.warn(`Process Warning: ${warning.name} - ${warning.message}`);
    if (warning.stack) {
        logger.debug(warning.stack);
    }
});

// ==================== МОНИТОРИНГ ПРОЦЕССОВ ====================
setInterval(() => {
    const runningProcesses = Object.keys(children).filter(
        (name) => children[name] && children[name].connected
    );

    // Отправляем heartbeat всем дочерним процессам
    runningProcesses.forEach((name) => {
        try {
            children[name].send({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
            });
        } catch (e) {
            // Процесс мог упасть между проверкой и отправкой
            logger.debug(`${name}: ошибка heartbeat — ${e.message}`);
        }
    });

    // Проверяем критические процессы
    Object.values(PROCESS_DEFINITIONS).forEach((def) => {
        if (def.critical && processState[def.name].status !== 'running' &&
            processState[def.name].status !== 'ready' && !isShuttingDown && !shutdownFlags[def.name]) {
            logger.warn(`${def.name}: критический процесс не запущен. Попытка восстановления...`);
            startProcess(def.name);
        }
    });
}, 30000); // Каждые 30 секунд

// ==================== API ДЛЯ ВНЕШНЕГО УПРАВЛЕНИЯ ====================

/**
 * Получить состояние всех процессов
 */
function getProcessesStatus() {
    const status = {};
    Object.keys(processState).forEach((name) => {
        status[name] = {
            ...processState[name],
            isRunning: !!(children[name] && children[name].connected),
            pid: children[name] ? children[name].pid : null,
        };
    });
    return status;
}

/**
 * Перезапустить конкретный процесс
 */
function restartProcess(processName) {
    logger.info(`Запрошен перезапуск процесса: ${processName}`);
    if (children[processName] && children[processName].connected) {
        stopProcess(processName, true);
    } else {
        startProcess(processName);
    }
}

/**
 * Полностью остановить систему
 */
function shutdown() {
    gracefulShutdownAll('API_REQUEST');
}

// ==================== СТАРТ СИСТЕМЫ ====================
logger.info('Оркестратор Resistance City инициализирован');
logger.info(`Окружение: ${process.env.NODE_ENV || 'development'}`);
logger.info(`Временная зона: ${process.env.TIMEZONE || 'не указана'}`);
logger.info(`Путь к БД: ${process.env.DB_PATH || './data/hohols.db'}`);

startAllProcesses();

// ==================== ЭКСПОРТЫ ====================
module.exports = {
    startProcess,
    stopProcess,
    restartProcess,
    startAllProcesses,
    gracefulShutdownAll,
    shutdown,
    getProcessesStatus,
    getChildren: () => children,
    getProcessState: () => processState,
    logger,
};