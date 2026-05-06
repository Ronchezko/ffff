// src/minecraft/moderation.js — Полный модуль автомодерации Resistance City v5.0.0
// Многоуровневая защита от спама, флуда, злоупотреблений
// Автоматические предупреждения, муты, кики, чёрные списки
// Полное логирование всех действий

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;
let isInitialized = false;

// Кэши для отслеживания нарушений
const messageHistory = new Map();       // История сообщений
const commandHistory = new Map();        // История команд
const joinLeaveHistory = new Map();      // История входов/выходов
const muteTimers = new Map();            // Таймеры авто-размута
const floodDetection = new Map();        // Детектор флуда
const duplicateDetection = new Map();    // Детектор дубликатов
const capsDetection = new Map();         // Детектор CAPS
const mentionDetection = new Map();      // Детектор упоминаний

// ==================== КОНСТАНТЫ ====================
const SPAM_WINDOW_MS = 60000;
const COMMAND_SPAM_WINDOW_MS = 10000;
const MAX_COMMANDS_PER_WINDOW = 5;
const COMMAND_BLOCK_DURATION_MS = 30000;
const MAX_SIMILAR_MESSAGES = 3;
const SIMILAR_WINDOW_MS = 30000;
const MAX_MESSAGE_LENGTH = 300;
const WARNING_EXPIRY_MS = 3600000;
const FLOOD_WINDOW_MS = 5000;
const MAX_FLOOD_MESSAGES = 5;
const CAPS_RATIO_THRESHOLD = 0.7;
const MIN_MESSAGE_LENGTH_FOR_CAPS = 10;
const MAX_MENTIONS_IN_MESSAGE = 5;

// ==================== НАСТРОЙКИ ИЗ БД ====================
function getAutoModConfig() {
    return {
        enabled: db.settings.getBoolean('auto_mod_enabled'),
        maxMessagesPerMinute: config.autoMod.maxMessagesPerMinute || 3,
        warnCountBeforeMute: config.autoMod.warnCountBeforeMute || 3,
        muteDurationMinutes: config.autoMod.muteDurationMinutes || 30,
        blacklistJoinLeaveLimit: config.autoMod.blacklistJoinLeaveLimit || 3,
        blacklistResetHours: config.autoMod.blacklistResetHours || 12,
        blacklistDurationHours: config.autoMod.blacklistDurationHours || 6,
        floodDetection: db.settings.getBoolean('auto_mod_flood_detection') !== false,
        capsDetection: db.settings.getBoolean('auto_mod_caps_detection') !== false,
        mentionDetection: db.settings.getBoolean('auto_mod_mention_detection') !== false,
        duplicateDetection: db.settings.getBoolean('auto_mod_duplicate_detection') !== false,
    };
}

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
    if (!isInitialized) {
        isInitialized = true;
        startPeriodicTasks();
        logger.success('Модуль модерации инициализирован');
    }
}

// ==================== ОСНОВНАЯ ПРОВЕРКА ====================

/**
 * Полная проверка сообщения на все виды нарушений
 * @param {string} username - Имя игрока
 * @param {string} source - 'clan_chat' или 'private_message'
 * @param {string} messageContent - Текст сообщения
 * @returns {object} Результат проверки
 */
function checkSpam(username, source = 'clan_chat', messageContent = '') {
    const now = Date.now();
    const config_am = getAutoModConfig();

    // Проверка отключения
    if (!config_am.enabled) {
        return { isSpam: false, action: 'disabled' };
    }

    // Проверка иммунитета (админы и кураторы не проверяются)
    if (permissions.isAdmin(username, db) || permissions.isCurator(username, db)) {
        return { isSpam: false, action: 'immune' };
    }

    const key = `${username.toLowerCase()}_${source}`;

    // Инициализация записи
    if (!messageHistory.has(key)) {
        messageHistory.set(key, {
            messages: [],
            warnings: [],
            muteUntil: null,
            totalMessages: 0,
            lastCleanup: now,
            createdAt: now,
        });
    }

    const history = messageHistory.get(key);

    // Проверка активного мута
    const muteCheck = checkActiveMute(history, now, username, source);
    if (muteCheck.blocked) {
        return muteCheck;
    }

    // Очистка старых записей
    cleanupHistory(history, now);

    // Последовательные проверки (от самых критичных)
    
    // 1. Проверка длины сообщения
    if (messageContent) {
        const lengthCheck = checkMessageLength(username, source, messageContent, history, now, config_am);
        if (lengthCheck.isSpam) return lengthCheck;
    }

    // 2. Проверка флуда (мгновенный поток)
    if (messageContent && config_am.floodDetection) {
        const floodCheck = checkFlood(username, source, messageContent, history, now, config_am);
        if (floodCheck.isSpam) return floodCheck;
    }

    // 3. Проверка дубликатов
    if (messageContent && config_am.duplicateDetection) {
        const duplicateCheck = checkDuplicates(username, source, messageContent, history, now, config_am);
        if (duplicateCheck.isSpam) return duplicateCheck;
    }

    // 4. Проверка CAPS
    if (messageContent && config_am.capsDetection) {
        const capsCheck = checkCaps(username, source, messageContent, history, now, config_am);
        if (capsCheck.isSpam) return capsCheck;
    }

    // 5. Проверка упоминаний
    if (messageContent && config_am.mentionDetection && source === 'clan_chat') {
        const mentionCheck = checkMentions(username, source, messageContent, history, now, config_am);
        if (mentionCheck.isSpam) return mentionCheck;
    }

    // 6. Проверка частоты сообщений
    const frequencyCheck = checkMessageFrequency(username, source, messageContent, history, now, config_am);
    if (frequencyCheck.isSpam) return frequencyCheck;

    // Всё чисто
    return { isSpam: false, action: 'none' };
}

// ==================== ПРОВЕРКА АКТИВНОГО МУТА ====================
function checkActiveMute(history, now, username, source) {
    if (history.muteUntil && history.muteUntil > now) {
        const remainingMinutes = Math.ceil((history.muteUntil - now) / 60000);
        const remainingSeconds = Math.ceil((history.muteUntil - now) / 1000);

        return {
            isSpam: true,
            action: 'blocked',
            reason: 'already_muted',
            remainingMinutes,
            remainingSeconds,
            message: `Вы заглушены ещё на ${remainingMinutes} мин.`,
        };
    }

    // Проверка БД (на случай перезапуска бота)
    if (!history.muteUntil || history.muteUntil <= now) {
        const activePunishments = db.punishments.getActive(username);
        const activeMute = activePunishments.find(
            p => (p.type === 'mute' || p.type === 'pm_mute') && p.is_active === 1
        );

        if (activeMute && activeMute.expires_at) {
            const expiresAt = new Date(activeMute.expires_at).getTime();
            if (expiresAt > now) {
                history.muteUntil = expiresAt;
                const remainingMinutes = Math.ceil((expiresAt - now) / 60000);

                return {
                    isSpam: true,
                    action: 'blocked',
                    reason: 'already_muted_db',
                    remainingMinutes,
                };
            } else {
                // Мут истёк, но не снят в БД
                db.punishments.remove(activeMute.id, 'AutoMod');
                history.muteUntil = null;
            }
        } else {
            history.muteUntil = null;
        }
    }

    return { blocked: false };
}

// ==================== ПРОВЕРКА ДЛИНЫ СООБЩЕНИЯ ====================
function checkMessageLength(username, source, messageContent, history, now, config_am) {
    if (messageContent.length > MAX_MESSAGE_LENGTH) {
        history.warnings.push({
            type: 'message_length',
            timestamp: now,
            severity: 'medium',
            detail: `Длина: ${messageContent.length} (макс: ${MAX_MESSAGE_LENGTH})`,
        });

        logger.debug(`Moderation: ${username} — слишком длинное сообщение (${messageContent.length} символов)`);

        const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

        return {
            isSpam: true,
            action: thresholdResult.muted ? 'mute' : 'warn',
            reason: 'message_too_long',
            length: messageContent.length,
            maxLength: MAX_MESSAGE_LENGTH,
            ...thresholdResult,
        };
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА ФЛУДА ====================
function checkFlood(username, source, messageContent, history, now, config_am) {
    const floodKey = `${username.toLowerCase()}_${source}_flood`;

    if (!floodDetection.has(floodKey)) {
        floodDetection.set(floodKey, {
            messages: [],
            lastFloodWarning: 0,
        });
    }

    const floodData = floodDetection.get(floodKey);

    // Очистка старых
    floodData.messages = floodData.messages.filter(
        m => now - m.timestamp < FLOOD_WINDOW_MS
    );

    floodData.messages.push({
        timestamp: now,
        length: messageContent.length,
    });

    if (floodData.messages.length >= MAX_FLOOD_MESSAGES) {
        const timeSpan = now - floodData.messages[0].timestamp;
        const rate = floodData.messages.length / (timeSpan / 1000);

        // Предупреждение за флуд не чаще раза в 30 секунд
        if (now - floodData.lastFloodWarning > 30000) {
            floodData.lastFloodWarning = now;

            history.warnings.push({
                type: 'flood',
                timestamp: now,
                severity: 'high',
                detail: `${floodData.messages.length} сообщений за ${(timeSpan / 1000).toFixed(1)}с (${rate.toFixed(1)}/с)`,
            });

            logger.warn(`Moderation: ${username} — флуд! ${floodData.messages.length} сообщений за ${(timeSpan / 1000).toFixed(1)}с`);

            const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

            return {
                isSpam: true,
                action: thresholdResult.muted ? 'mute' : 'warn',
                reason: 'flood',
                messageCount: floodData.messages.length,
                timeSpan: (timeSpan / 1000).toFixed(1),
                rate: rate.toFixed(1),
                ...thresholdResult,
            };
        }
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА ДУБЛИКАТОВ ====================
function checkDuplicates(username, source, messageContent, history, now, config_am) {
    if (messageContent.length < 5) return { isSpam: false };

    const dupKey = `${username.toLowerCase()}_${source}_dup`;

    if (!duplicateDetection.has(dupKey)) {
        duplicateDetection.set(dupKey, {
            messages: new Map(),
            lastDuplicateWarning: 0,
        });
    }

    const dupData = duplicateDetection.get(dupKey);

    // Очистка старых
    for (const [content, data] of dupData.messages) {
        if (now - data.lastTimestamp > SIMILAR_WINDOW_MS * 2) {
            dupData.messages.delete(content);
        }
    }

    const normalizedContent = messageContent.trim().toLowerCase();

    if (!dupData.messages.has(normalizedContent)) {
        dupData.messages.set(normalizedContent, {
            count: 1,
            firstTimestamp: now,
            lastTimestamp: now,
        });
    } else {
        const dup = dupData.messages.get(normalizedContent);
        dup.count++;
        dup.lastTimestamp = now;

        if (dup.count >= MAX_SIMILAR_MESSAGES) {
            if (now - dupData.lastDuplicateWarning > 30000) {
                dupData.lastDuplicateWarning = now;

                history.warnings.push({
                    type: 'duplicate',
                    timestamp: now,
                    severity: 'medium',
                    detail: `Повторено ${dup.count} раз: "${messageContent.substring(0, 50)}"`,
                });

                logger.debug(`Moderation: ${username} — дубликаты (${dup.count}x): "${messageContent.substring(0, 50)}"`);

                const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

                return {
                    isSpam: true,
                    action: thresholdResult.muted ? 'mute' : 'warn',
                    reason: 'duplicate_messages',
                    count: dup.count,
                    ...thresholdResult,
                };
            }
        }
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА CAPS ====================
function checkCaps(username, source, messageContent, history, now, config_am) {
    if (messageContent.length < MIN_MESSAGE_LENGTH_FOR_CAPS) return { isSpam: false };

    // Считаем заглавные буквы (без учёта цветовых кодов)
    const cleanContent = messageContent.replace(/&[0-9a-fk-or#x]/gi, '').replace(/&#[0-9a-fA-F]{6}/g, '');
    const letters = cleanContent.match(/[A-Za-zА-Яа-я]/g) || [];
    const caps = cleanContent.match(/[A-ZА-Я]/g) || [];

    if (letters.length === 0) return { isSpam: false };

    const capsRatio = caps.length / letters.length;

    if (capsRatio > CAPS_RATIO_THRESHOLD) {
        const capsKey = `${username.toLowerCase()}_${source}_caps`;

        if (!capsDetection.has(capsKey)) {
            capsDetection.set(capsKey, {
                warnings: [],
                lastCapsWarning: 0,
            });
        }

        const capsData = capsDetection.get(capsKey);

        if (now - capsData.lastCapsWarning > 30000) {
            capsData.lastCapsWarning = now;
            capsData.warnings.push({ timestamp: now, ratio: capsRatio });

            history.warnings.push({
                type: 'caps',
                timestamp: now,
                severity: 'low',
                detail: `CAPS: ${(capsRatio * 100).toFixed(0)}% (${caps.length}/${letters.length})`,
            });

            logger.debug(`Moderation: ${username} — CAPS ${(capsRatio * 100).toFixed(0)}%`);

            const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

            return {
                isSpam: true,
                action: thresholdResult.muted ? 'mute' : 'warn',
                reason: 'caps',
                capsRatio: (capsRatio * 100).toFixed(0),
                ...thresholdResult,
            };
        }
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА УПОМИНАНИЙ ====================
function checkMentions(username, source, messageContent, history, now, config_am) {
    // Считаем @упоминания (если поддерживаются сервером)
    const mentions = messageContent.match(/@\S+/g) || [];

    if (mentions.length > MAX_MENTIONS_IN_MESSAGE) {
        history.warnings.push({
            type: 'mentions',
            timestamp: now,
            severity: 'medium',
            detail: `Упоминаний: ${mentions.length} (макс: ${MAX_MENTIONS_IN_MESSAGE})`,
        });

        logger.debug(`Moderation: ${username} — спам упоминаниями (${mentions.length})`);

        const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

        return {
            isSpam: true,
            action: thresholdResult.muted ? 'mute' : 'warn',
            reason: 'mention_spam',
            mentionCount: mentions.length,
            maxMentions: MAX_MENTIONS_IN_MESSAGE,
            ...thresholdResult,
        };
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА ЧАСТОТЫ СООБЩЕНИЙ ====================
function checkMessageFrequency(username, source, messageContent, history, now, config_am) {
    const recentMessages = history.messages.filter(
        m => now - m.timestamp < SPAM_WINDOW_MS
    );

    // Добавление текущего
    history.messages.push({
        timestamp: now,
        content: messageContent.substring(0, 100),
        length: messageContent.length,
    });
    history.totalMessages++;

    if (recentMessages.length >= config_am.maxMessagesPerMinute) {
        const oldestInWindow = recentMessages[0];
        const timeSpan = now - oldestInWindow.timestamp;
        const rate = recentMessages.length / (timeSpan / 1000);

        history.warnings.push({
            type: 'frequency',
            timestamp: now,
            severity: 'medium',
            detail: `${recentMessages.length} сообщений за ${(timeSpan / 1000).toFixed(1)}с`,
        });

        logger.debug(`Moderation: ${username} — частота ${recentMessages.length}/${config_am.maxMessagesPerMinute} за ${(timeSpan / 1000).toFixed(1)}с`);

        const thresholdResult = checkWarningThreshold(username, source, history, now, config_am);

        return {
            isSpam: true,
            action: thresholdResult.muted ? 'mute' : 'warn',
            reason: 'message_frequency',
            messageCount: recentMessages.length,
            maxMessages: config_am.maxMessagesPerMinute,
            timeSpan: (timeSpan / 1000).toFixed(1),
            ...thresholdResult,
        };
    }

    return { isSpam: false };
}

// ==================== ПРОВЕРКА ПОРОГА ПРЕДУПРЕЖДЕНИЙ ====================
function checkWarningThreshold(username, source, history, now, config_am) {
    // Очистка старых предупреждений
    history.warnings = history.warnings.filter(
        w => now - w.timestamp < WARNING_EXPIRY_MS
    );

    const warnCount = history.warnings.length;
    const maxWarns = config_am.warnCountBeforeMute;

    if (warnCount >= maxWarns) {
        const muteDurationMs = config_am.muteDurationMinutes * 60000;
        history.muteUntil = now + muteDurationMs;

        // Логирование типов нарушений
        const warnTypes = history.warnings.map(w => w.type).join(', ');

        logger.info(`AutoMod: ${username} заглушен на ${config_am.muteDurationMinutes} мин. Нарушения: ${warnTypes}`);

        // Применяем мут
        applyMute(username, source, config_am.muteDurationMinutes,
            `Автомодерация: ${warnCount} нарушений (${warnTypes})`, 'AutoMod');

        // Сохраняем статистику
        logModerationAction('auto_mute', username, 'AutoMod',
            config_am.muteDurationMinutes, warnTypes);

        return {
            muted: true,
            warnCount,
            maxWarns,
            duration: config_am.muteDurationMinutes,
            warnTypes,
        };
    }

    // Отправка предупреждения в ЛС при 2/3
    if (warnCount === maxWarns - 1 && botInstance && botInstance.connected) {
        try {
            botInstance.chat(`/msg ${username} &#FFB800⚠ Предупреждение ${warnCount}/${maxWarns}! Следующее нарушение — мут.`);
        } catch (e) {}
    }

    return {
        muted: false,
        warnCount,
        maxWarns,
        remaining: maxWarns - warnCount,
    };
}

// ==================== ОЧИСТКА ИСТОРИИ ====================
function cleanupHistory(history, now) {
    // Очистка сообщений старше 2 минут
    history.messages = history.messages.filter(
        m => now - m.timestamp < SPAM_WINDOW_MS * 2
    );

    // Очистка предупреждений старше часа
    history.warnings = history.warnings.filter(
        w => now - w.timestamp < WARNING_EXPIRY_MS
    );

    // Ограничение размера
    if (history.messages.length > 200) {
        history.messages = history.messages.slice(-100);
    }
    if (history.warnings.length > 50) {
        history.warnings = history.warnings.slice(-25);
    }

    history.lastCleanup = now;
}

// ==================== ПРОВЕРКА КОМАНД ====================
function checkCommandSpam(username) {
    const key = username.toLowerCase();
    const now = Date.now();

    // Иммунитет для персонала
    if (permissions.isAdmin(username, db) || permissions.isCurator(username, db)) {
        return { blocked: false, immune: true };
    }

    if (!commandHistory.has(key)) {
        commandHistory.set(key, {
            commands: [],
            blockedUntil: null,
            blockCount: 0,
            totalCommands: 0,
            lastCleanup: now,
        });
    }

    const history = commandHistory.get(key);

    // Проверка блокировки
    if (history.blockedUntil && history.blockedUntil > now) {
        const remaining = Math.ceil((history.blockedUntil - now) / 1000);
        return {
            blocked: true,
            remaining,
            reason: 'command_cooldown',
            blockCount: history.blockCount,
        };
    }

    // Очистка
    history.commands = history.commands.filter(
        c => now - c.timestamp < COMMAND_SPAM_WINDOW_MS
    );

    // Добавление
    history.commands.push({
        timestamp: now,
        time: new Date().toISOString(),
    });
    history.totalCommands++;

    // Проверка
    if (history.commands.length > MAX_COMMANDS_PER_WINDOW) {
        history.blockCount++;
        const multiplier = Math.min(history.blockCount, 5);
        const blockDuration = COMMAND_BLOCK_DURATION_MS * multiplier;
        history.blockedUntil = now + blockDuration;

        logger.info(`AutoMod: ${username} заблокирован за спам команд (блок #${history.blockCount}, ${blockDuration / 1000}с)`);

        return {
            blocked: true,
            remaining: Math.ceil(blockDuration / 1000),
            reason: 'command_spam',
            blockCount: history.blockCount,
            duration: blockDuration / 1000,
        };
    }

    return { blocked: false };
}

// ==================== ПРОВЕРКА ВХОДОВ/ВЫХОДОВ ====================
function checkJoinLeaveSpam(username, actionType) {
    const key = username.toLowerCase();
    const now = Date.now();
    const config_am = getAutoModConfig();

    if (!joinLeaveHistory.has(key)) {
        joinLeaveHistory.set(key, {
            actions: [],
            blockedUntil: null,
            totalActions: 0,
            lastAction: null,
            createdAt: now,
        });
    }

    const history = joinLeaveHistory.get(key);

    // Проверка блокировки
    if (history.blockedUntil && history.blockedUntil > now) {
        const remainingHours = Math.ceil((history.blockedUntil - now) / 3600000);
        const remainingMinutes = Math.ceil((history.blockedUntil - now) / 60000);
        return {
            isSpam: true,
            blocked: true,
            reason: 'join_leave_blacklist',
            remainingHours,
            remainingMinutes,
        };
    }

    // Очистка старых
    const resetMs = config_am.blacklistResetHours * 3600000;
    history.actions = history.actions.filter(a => now - a.timestamp < resetMs);

    // Добавление
    history.actions.push({
        type: actionType,
        timestamp: now,
        time: new Date().toISOString(),
    });
    history.totalActions++;
    history.lastAction = actionType;

    // Проверка
    if (history.actions.length >= config_am.blacklistJoinLeaveLimit) {
        const durationMs = config_am.blacklistDurationHours * 3600000;
        history.blockedUntil = now + durationMs;

        logger.warn(`AutoMod: ${username} в ЧС за спам входом/выходом (${history.actions.length} раз за ${config_am.blacklistResetHours}ч)`);

        // Автоматически добавляем в ЧС
        db.punishments.add(username, 'blacklist',
            config_am.blacklistDurationHours * 60,
            `Автомодерация: спам входом/выходом (${history.actions.length} раз)`,
            'AutoMod');

        logModerationAction('auto_blacklist', username, 'AutoMod',
            config_am.blacklistDurationHours * 60,
            `Спам входом/выходом: ${history.actions.length} раз`);

        return {
            isSpam: true,
            blocked: true,
            reason: 'join_leave_spam_blacklist',
            durationHours: config_am.blacklistDurationHours,
            actionCount: history.actions.length,
        };
    }

    return {
        isSpam: false,
        blocked: false,
        actionCount: history.actions.length,
        remaining: config_am.blacklistJoinLeaveLimit - history.actions.length,
    };
}

// ==================== ПРИМЕНЕНИЕ НАКАЗАНИЙ ====================

function applyMute(username, source, durationMinutes, reason, issuer) {
    if (!botInstance || !botInstance.connected) return false;

    const durationMs = durationMinutes * 60000;
    const now = Date.now();
    const key = `${username.toLowerCase()}_${source}`;

    // Обновление кэша
    if (!messageHistory.has(key)) {
        messageHistory.set(key, {
            messages: [], warnings: [], muteUntil: null,
            totalMessages: 0, lastCleanup: now, createdAt: now,
        });
    }
    messageHistory.get(key).muteUntil = now + durationMs;

    // БД
    const muteType = source === 'private_message' ? 'pm_mute' : 'mute';
    db.punishments.add(username, muteType, durationMinutes, reason, issuer);

    // Игровой мут
    if (source === 'clan_chat' || source === 'cc') {
        botInstance.chat(`/c mute ${username} ${reason}`);
    }

    // Таймер
    const timerKey = `${username.toLowerCase()}_${muteType}`;
    const existingTimer = muteTimers.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
        applyUnmute(username, source, 'AutoMod');
        muteTimers.delete(timerKey);

        if (botInstance && botInstance.connected) {
            try {
                botInstance.chat(`/msg ${username} &#76C519Ваш мут истёк. Пожалуйста, соблюдайте правила.`);
            } catch (e) {}
        }
    }, durationMs);

    muteTimers.set(timerKey, timer);

    logger.info(`Модерация: ${username} замучен (${source}) на ${durationMinutes} мин. Причина: ${reason}`);

    return true;
}

function applyUnmute(username, source, issuer) {
    if (!botInstance || !botInstance.connected) return false;

    const key = `${username.toLowerCase()}_${source}`;
    if (messageHistory.has(key)) {
        const history = messageHistory.get(key);
        history.muteUntil = null;
        history.warnings = [];
        history.messages = [];
    }

    // Игровой размут
    if (source === 'clan_chat' || source === 'cc') {
        botInstance.chat(`/c unmute ${username}`);
    }

    // БД
    const activePunishments = db.punishments.getActive(username);
    const muteRecord = activePunishments.find(
        p => (p.type === 'mute' || p.type === 'pm_mute') && p.is_active === 1
    );
    if (muteRecord) {
        db.punishments.remove(muteRecord.id, issuer);
    }

    logger.info(`Модерация: ${username} размучен (${source})`);

    return true;
}

// ==================== ЛОГИРОВАНИЕ ====================
function logModerationAction(action, target, issuer, duration, reason) {
    try {
        if (process.send) {
            process.send({
                type: 'discord_log',
                channel: 'moderation',
                data: {
                    action,
                    target,
                    issuer,
                    duration,
                    reason,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    } catch (error) {
        logger.error(`Ошибка логирования в Discord: ${error.message}`);
    }
}

// ==================== РУЧНЫЕ МЕТОДЫ (ДЛЯ КОМАНД) ====================
function mutePlayer(bot, username, durationMinutes, reason, issuer) {
    return applyMute(username, 'clan_chat', durationMinutes, reason, issuer);
}

function unmutePlayer(bot, username, issuer) {
    return applyUnmute(username, 'clan_chat', issuer);
}

function kickFromClan(bot, username, reason, issuer) {
    const b = bot || botInstance;
    if (!b || !b.connected) return { success: false, reason: 'bot_not_connected' };

    b.chat(`/c kick ${username}`);
    db.punishments.add(username, 'kick', null, reason, issuer);

    logModerationAction('kick', username, issuer, 0, reason);
    logger.info(`${issuer} кикнул ${username}. Причина: ${reason}`);

    return { success: true };
}

function blacklistPlayer(bot, username, durationMinutes, reason, issuer) {
    const b = bot || botInstance;
    if (!b || !b.connected) return { success: false, reason: 'bot_not_connected' };

    db.punishments.add(username, 'blacklist', durationMinutes, reason, issuer);
    b.chat(`/c kick ${username}`);

    logModerationAction('blacklist', username, issuer, durationMinutes, reason);
    logger.warn(`${issuer} добавил ${username} в ЧС на ${durationMinutes} мин. Причина: ${reason}`);

    return { success: true };
}

// ==================== СТАТИСТИКА ====================
function getModerationStats() {
    const now = Date.now();
    let totalTracked = 0, mutedCount = 0, warnedCount = 0;
    let totalMessages = 0, totalWarnings = 0;

    for (const [key, history] of messageHistory) {
        totalTracked++;
        totalMessages += history.totalMessages || 0;
        totalWarnings += history.warnings.length;
        if (history.muteUntil && history.muteUntil > now) mutedCount++;
        if (history.warnings.length > 0) warnedCount++;
    }

    return {
        tracked: totalTracked,
        muted: mutedCount,
        warned: warnedCount,
        totalMessages,
        totalWarnings,
        joinLeaveTracked: joinLeaveHistory.size,
        commandTracked: commandHistory.size,
        activeTimers: muteTimers.size,
        dbActivePunishments: db.all(
            "SELECT COUNT(*) as count FROM punishment_logs WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
        )[0]?.count || 0,
        uptime: process.uptime(),
    };
}

// ==================== СБРОС ДАННЫХ ====================
function resetPlayerModeration(username) {
    const lower = username.toLowerCase();
    const keys = [`${lower}_clan_chat`, `${lower}_private_message`];

    for (const key of keys) {
        messageHistory.delete(key);
        floodDetection.delete(`${key}_flood`);
        duplicateDetection.delete(`${key}_dup`);
        capsDetection.delete(`${key}_caps`);
    }

    commandHistory.delete(lower);
    joinLeaveHistory.delete(lower);

    for (const [timerKey, timer] of muteTimers) {
        if (timerKey.startsWith(lower)) {
            clearTimeout(timer);
            muteTimers.delete(timerKey);
        }
    }

    logger.info(`Данные модерации сброшены для ${username}`);
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================
function startPeriodicTasks() {
    setInterval(cleanupAllCaches, 60000);

    // Сброс дневных лимитов персонала в полночь
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            db.staff.resetDailyLimits();
            logger.info('Сброшены дневные лимиты персонала');
        }
    }, 60000);

    // Очистка истёкших наказаний
    setInterval(() => {
        const removed = db.punishments.removeAllExpired();
        if (removed.changes > 0) {
            logger.debug(`Очищено истёкших наказаний: ${removed.changes}`);
        }
    }, 300000);

    logger.success('Периодические задачи модерации запущены');
}

function cleanupAllCaches() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, history] of messageHistory) {
        if (history.muteUntil && history.muteUntil < now) {
            history.muteUntil = null;
            history.warnings = [];
            history.messages = [];
            cleaned++;
        }
        cleanupHistory(history, now);
    }

    for (const [key, history] of commandHistory) {
        if (history.blockedUntil && history.blockedUntil < now) {
            history.blockedUntil = null;
            history.commands = [];
            cleaned++;
        }
    }

    for (const [key, history] of joinLeaveHistory) {
        if (history.blockedUntil && history.blockedUntil < now) {
            joinLeaveHistory.delete(key);
            cleaned++;
        }
    }

    // Удаление неактивных записей
    for (const [key, history] of messageHistory) {
        if (history.lastCleanup && now - history.lastCleanup > 86400000 &&
            !history.muteUntil && history.warnings.length === 0 && history.messages.length === 0) {
            messageHistory.delete(key);
            cleaned++;
        }
    }

    for (const [key, history] of commandHistory) {
        if (now - history.lastCleanup > 86400000 && !history.blockedUntil && history.commands.length === 0) {
            commandHistory.delete(key);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.debug(`Очистка кэша модерации: ${cleaned} записей`);
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    checkSpam,
    checkCommandSpam,
    checkJoinLeaveSpam,
    mutePlayer,
    unmutePlayer,
    kickFromClan,
    blacklistPlayer,
    applyMute,
    applyUnmute,
    getModerationStats,
    resetPlayerModeration,
    getMessageHistory: () => messageHistory,
    getJoinLeaveHistory: () => joinLeaveHistory,
    getCommandHistory: () => commandHistory,
    getMuteTimers: () => muteTimers,
    getAutoModConfig,
};