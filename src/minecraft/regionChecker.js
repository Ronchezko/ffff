// src/minecraft/regionChecker.js — Проверка регионов имущества Resistance City v5.0.0
// Периодическая проверка владельцев и сожителей регионов
// Сверка с базой данных, исправление несоответствий

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;
let isChecking = false;
let checkQueue = [];
let currentCheckIndex = 0;
let checkIntervalId = null;

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
}

// ==================== ЗАПУСК ПРОВЕРКИ ВСЕХ РЕГИОНОВ ====================

/**
 * Запустить проверку всех регионов
 */
function checkAllRegions(bot) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) {
        logger.warn('RegionChecker: бот не подключён, проверка отложена');
        return;
    }

    if (isChecking) {
        logger.debug('RegionChecker: проверка уже выполняется');
        return;
    }

    const properties = db.properties.getAll();
    const ownedProperties = properties.filter(p => p.is_owned && p.owner);

    if (ownedProperties.length === 0) {
        logger.debug('RegionChecker: нет занятого имущества для проверки');
        return;
    }

    isChecking = true;
    checkQueue = [...ownedProperties];
    currentCheckIndex = 0;

    logger.info(`RegionChecker: начало проверки ${checkQueue.length} регионов`);

    checkNextRegion(bot);
}

/**
 * Проверить следующий регион в очереди
 */
function checkNextRegion(bot) {
    if (currentCheckIndex >= checkQueue.length) {
        // Проверка завершена
        logger.info(`RegionChecker: проверка завершена (${checkQueue.length} регионов)`);
        isChecking = false;
        checkQueue = [];
        currentCheckIndex = 0;
        return;
    }

    const property = checkQueue[currentCheckIndex];
    const regionName = property.region_name || `${config.clan.regionPrefix}${property.property_id}`;

    // Устанавливаем ожидание ответа
    bot._pendingRegionCheck = {
        propertyId: property.property_id,
        regionName: regionName,
        expectedOwner: property.owner,
        expectedCoOwner1: property.co_owner_1,
        expectedCoOwner2: property.co_owner_2,
        callback: (members) => handleRegionInfo(bot, property, members),
        timestamp: Date.now(),
    };

    // Отправляем запрос
    bot.chat(`/rg info ${regionName}`);

    // Таймаут (10 секунд)
    const timeoutId = setTimeout(() => {
        if (bot._pendingRegionCheck &&
            bot._pendingRegionCheck.propertyId === property.property_id) {
            logger.warn(`RegionChecker: таймаут для региона ${regionName}`);
            bot._pendingRegionCheck = null;
            currentCheckIndex++;
            setTimeout(() => checkNextRegion(bot), 2000);
        }
    }, 10000);

    // Сохраняем ID таймаута
    if (bot._pendingRegionCheck) {
        bot._pendingRegionCheck.timeoutId = timeoutId;
    }
}

/**
 * Обработать информацию о регионе
 */
function handleRegionInfo(bot, property, members) {
    const regionName = property.region_name || `${config.clan.regionPrefix}${property.property_id}`;

    logger.debug(`RegionChecker: регион ${regionName}, участники: ${members.join(', ')}`);

    // Проверка владельца
    const expectedOwner = property.owner_lower;
    const hasOwner = members.some(m => m.toLowerCase() === expectedOwner);

    if (!hasOwner && property.owner) {
        logger.warn(`RegionChecker: владелец ${property.owner} отсутствует в регионе ${regionName}! Добавляем...`);

        if (botInstance && botInstance.connected) {
            botInstance.chat(`/rg addmember ${regionName} ${property.owner}`);
        }
    }

    // Проверка сожителя 1
    if (property.co_owner_1) {
        const hasCoOwner1 = members.some(m => m.toLowerCase() === property.co_owner_1_lower);
        if (!hasCoOwner1) {
            logger.warn(`RegionChecker: сожитель ${property.co_owner_1} отсутствует в регионе ${regionName}!`);
            if (botInstance && botInstance.connected) {
                botInstance.chat(`/rg addmember ${regionName} ${property.co_owner_1}`);
            }
        }
    }

    // Проверка сожителя 2
    if (property.co_owner_2) {
        const hasCoOwner2 = members.some(m => m.toLowerCase() === property.co_owner_2_lower);
        if (!hasCoOwner2) {
            logger.warn(`RegionChecker: сожитель ${property.co_owner_2} отсутствует в регионе ${regionName}!`);
            if (botInstance && botInstance.connected) {
                botInstance.chat(`/rg addmember ${regionName} ${property.co_owner_2}`);
            }
        }
    }

    // Проверка лишних участников (которых нет в БД)
    const allowedMembers = [
        property.owner_lower,
        property.co_owner_1_lower,
        property.co_owner_2_lower,
    ].filter(Boolean);

    // Также разрешаем бота
    const botUsernames = [
        (process.env.MINECRAFT_USERNAME || '').toLowerCase(),
        (process.env.MINECRAFT_BACKUP_USERNAME || '').toLowerCase(),
    ].filter(Boolean);

    for (const member of members) {
        const memberLower = member.toLowerCase();

        if (allowedMembers.includes(memberLower)) continue;
        if (botUsernames.includes(memberLower)) continue;

        // Лишний участник
        logger.warn(`RegionChecker: лишний участник ${member} в регионе ${regionName}! Удаляем...`);

        if (botInstance && botInstance.connected) {
            botInstance.chat(`/rg removemember ${regionName} ${member}`);
        }
    }

    // Переход к следующему
    currentCheckIndex++;
    setTimeout(() => checkNextRegion(bot), 3000);
}

// ==================== ПРОВЕРКА ОДНОГО РЕГИОНА ====================

/**
 * Проверить конкретный регион
 */
function checkSingleRegion(bot, propertyId, callback) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) {
        if (callback) callback({ success: false, reason: 'bot_not_connected' });
        return;
    }

    const property = db.properties.get(propertyId);
    if (!property || !property.is_owned) {
        if (callback) callback({ success: false, reason: 'property_not_found' });
        return;
    }

    const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;

    bot._pendingRegionCheck = {
        propertyId: propertyId,
        regionName: regionName,
        callback: (members) => {
            handleRegionInfo(bot, property, members);
            if (callback) callback({ success: true, members });
        },
        timestamp: Date.now(),
    };

    bot.chat(`/rg info ${regionName}`);

    // Таймаут
    setTimeout(() => {
        if (bot._pendingRegionCheck && bot._pendingRegionCheck.propertyId === propertyId) {
            bot._pendingRegionCheck = null;
            if (callback) callback({ success: false, reason: 'timeout' });
        }
    }, 10000);
}

// ==================== СИНХРОНИЗАЦИЯ РЕГИОНА ====================

/**
 * Синхронизировать регион с данными БД
 */
function syncRegion(bot, propertyId) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) return { success: false, reason: 'bot_not_connected' };

    const property = db.properties.get(propertyId);
    if (!property || !property.is_owned) {
        return { success: false, reason: 'property_not_owned' };
    }

    const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;

    // Добавляем владельца
    if (property.owner) {
        bot.chat(`/rg addmember ${regionName} ${property.owner}`);
    }

    // Добавляем сожителей
    if (property.co_owner_1) {
        bot.chat(`/rg addmember ${regionName} ${property.co_owner_1}`);
    }
    if (property.co_owner_2) {
        bot.chat(`/rg addmember ${regionName} ${property.co_owner_2}`);
    }

    logger.info(`RegionChecker: синхронизирован регион ${regionName}`);

    return { success: true };
}

// ==================== ПЕРИОДИЧЕСКАЯ ПРОВЕРКА ====================

function startPeriodicCheck(bot, intervalMs = 3600000) {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
    }

    botInstance = bot;

    // Первая проверка через 30 секунд после запуска
    setTimeout(() => {
        checkAllRegions(bot);
    }, 30000);

    // Периодическая проверка
    checkIntervalId = setInterval(() => {
        checkAllRegions(bot);
    }, intervalMs);

    logger.info(`RegionChecker: периодическая проверка запущена (интервал: ${intervalMs / 1000}с)`);
}

function stopPeriodicCheck() {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }
    isChecking = false;
    checkQueue = [];
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    checkAllRegions,
    checkSingleRegion,
    syncRegion,
    startPeriodicCheck,
    stopPeriodicCheck,
    isChecking: () => isChecking,
};