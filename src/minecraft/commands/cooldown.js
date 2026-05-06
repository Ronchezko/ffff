// src/minecraft/commands/cooldown.js — Система кулдаунов команд Resistance City v5.0.0
// Отслеживание времени последнего использования команд
// Глобальные и персональные кулдауны

'use strict';

const config = require('../../config');
const db = require('../../database');
const { logger } = require('../../shared/logger');

// ==================== КЭШ КУЛДАУНОВ ====================
const cooldownCache = new Map();
const globalCooldowns = new Map();

// ==================== КОНСТАНТЫ ====================
const DEFAULT_COOLDOWNS = {
    '/fly': { duration: 120000, type: 'global', description: 'Флай (на клан)' },
    '/10t': { duration: 300000, type: 'global', description: '10 тысяч (на клан)' },
    '/pay': { duration: 15000, type: 'personal', description: 'Перевод денег' },
};

// ==================== ПРОВЕРКА КУЛДАУНА ====================

/**
 * Проверить кулдаун для команды
 * @returns {object} { onCooldown: boolean, remaining: number (секунд) }
 */
function checkCooldown(username, command, customDuration) {
    var config_amd = config.autoMod || {};
    var now = Date.now();

    // Нормализация команды
    var normalizedCommand = normalizeCommand(command);

    // Проверка глобального кулдауна
    if (DEFAULT_COOLDOWNS[normalizedCommand] && DEFAULT_COOLDOWNS[normalizedCommand].type === 'global') {
        var globalKey = 'global_' + normalizedCommand;
        if (globalCooldowns.has(globalKey)) {
            var globalExpiry = globalCooldowns.get(globalKey);
            if (now < globalExpiry) {
                var remaining = Math.ceil((globalExpiry - now) / 1000);
                return {
                    onCooldown: true,
                    remaining: remaining,
                    type: 'global',
                    message: 'Кулдаун на клан: ' + remaining + 'с',
                };
            }
        }
    }

    // Проверка персонального кулдауна
    var personalKey = username.toLowerCase() + '_' + normalizedCommand;
    if (cooldownCache.has(personalKey)) {
        var personalExpiry = cooldownCache.get(personalKey);
        if (now < personalExpiry) {
            var personalRemaining = Math.ceil((personalExpiry - now) / 1000);
            return {
                onCooldown: true,
                remaining: personalRemaining,
                type: 'personal',
                message: 'Подождите ' + personalRemaining + 'с',
            };
        }
    }

    // Проверка в БД
    var dbCooldown = db.cooldowns ? db.cooldowns.get(username, normalizedCommand) : null;
    if (dbCooldown) {
        var dbRemaining = Math.ceil((dbCooldown - now) / 1000);
        if (dbRemaining > 0) {
            return {
                onCooldown: true,
                remaining: dbRemaining,
                type: 'database',
                message: 'Подождите ' + dbRemaining + 'с',
            };
        }
    }

    return { onCooldown: false, remaining: 0 };
}

// ==================== УСТАНОВКА КУЛДАУНА ====================

/**
 * Установить кулдаун для команды
 */
function setCooldown(username, command, customDuration) {
    var normalizedCommand = normalizeCommand(command);
    var now = Date.now();

    // Определение длительности
    var duration = customDuration;
    if (!duration && DEFAULT_COOLDOWNS[normalizedCommand]) {
        duration = DEFAULT_COOLDOWNS[normalizedCommand].duration;
    }
    if (!duration) {
        duration = 3000; // По умолчанию 3 секунды
    }

    var expiry = now + duration;

    // Глобальный кулдаун
    if (DEFAULT_COOLDOWNS[normalizedCommand] && DEFAULT_COOLDOWNS[normalizedCommand].type === 'global') {
        globalCooldowns.set('global_' + normalizedCommand, expiry);
    }

    // Персональный кулдаун
    var personalKey = username.toLowerCase() + '_' + normalizedCommand;
    cooldownCache.set(personalKey, expiry);

    // Сохранение в БД для долгих кулдаунов (> 60 секунд)
    if (duration > 60000 && db.cooldowns) {
        db.cooldowns.set(username, normalizedCommand, Math.ceil(duration / 1000));
    }

    // Авто-очистка
    setTimeout(function() {
        cooldownCache.delete(personalKey);
        if (DEFAULT_COOLDOWNS[normalizedCommand] && DEFAULT_COOLDOWNS[normalizedCommand].type === 'global') {
            if (globalCooldowns.get('global_' + normalizedCommand) <= expiry) {
                globalCooldowns.delete('global_' + normalizedCommand);
            }
        }
    }, duration + 1000);

    return { success: true, duration: duration, expiresAt: new Date(expiry).toISOString() };
}

// ==================== СБРОС КУЛДАУНОВ ====================

function resetCooldown(username, command) {
    if (!username && !command) {
        // Полный сброс
        cooldownCache.clear();
        globalCooldowns.clear();
        if (db.cooldowns) db.cooldowns.clear();
        logger.info('Все кулдауны сброшены');
        return { success: true, message: 'Все кулдауны сброшены' };
    }

    var normalizedCommand = command ? normalizeCommand(command) : null;

    if (normalizedCommand) {
        // Сброс конкретной команды
        if (username) {
            cooldownCache.delete(username.toLowerCase() + '_' + normalizedCommand);
        }
        globalCooldowns.delete('global_' + normalizedCommand);
        if (db.cooldowns && username) {
            db.cooldowns.clear(username);
        }
        logger.info('Кулдаун сброшен: ' + (username || 'global') + ' - ' + normalizedCommand);
        return { success: true, message: 'Кулдаун сброшен' };
    }

    if (username) {
        // Сброс всех кулдаунов игрока
        var prefix = username.toLowerCase() + '_';
        var keysToDelete = [];
        cooldownCache.forEach(function(value, key) {
            if (key.indexOf(prefix) === 0) {
                keysToDelete.push(key);
            }
        });
        for (var i = 0; i < keysToDelete.length; i++) {
            cooldownCache.delete(keysToDelete[i]);
        }
        if (db.cooldowns) db.cooldowns.clear(username);
        logger.info('Кулдауны сброшены для игрока: ' + username);
        return { success: true, message: 'Кулдауны сброшены для ' + username };
    }

    return { success: false, message: 'Укажите имя игрока или команду' };
}

// ==================== СТАТИСТИКА ====================

function getCooldownStats() {
    var now = Date.now();
    var activePersonal = 0;
    var activeGlobal = 0;

    cooldownCache.forEach(function(expiry) {
        if (expiry > now) activePersonal++;
    });

    globalCooldowns.forEach(function(expiry) {
        if (expiry > now) activeGlobal++;
    });

    return {
        activePersonalCooldowns: activePersonal,
        activeGlobalCooldowns: activeGlobal,
        totalTracked: cooldownCache.size + globalCooldowns.size,
    };
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function normalizeCommand(command) {
    if (!command) return '';
    var normalized = command.toLowerCase().trim();
    if (normalized.indexOf('/') !== 0) {
        normalized = '/' + normalized;
    }
    return normalized;
}

// ==================== ОЧИСТКА УСТАРЕВШИХ ====================
setInterval(function() {
    var now = Date.now();
    var removedCount = 0;

    cooldownCache.forEach(function(expiry, key) {
        if (expiry <= now) {
            cooldownCache.delete(key);
            removedCount++;
        }
    });

    globalCooldowns.forEach(function(expiry, key) {
        if (expiry <= now) {
            globalCooldowns.delete(key);
            removedCount++;
        }
    });

    if (removedCount > 0) {
        logger.debug('Очищено устаревших кулдаунов: ' + removedCount);
    }
}, 30000);

// ==================== ЭКСПОРТ ====================
module.exports = {
    checkCooldown,
    setCooldown,
    resetCooldown,
    getCooldownStats,
    DEFAULT_COOLDOWNS,
};