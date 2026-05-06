// src/discord/logger.js — Модуль логирования Discord Resistance City v5.0.0
// Централизованная отправка логов в каналы Discord
// Логи модерации, экономики, персонала, ошибок

'use strict';

const { EmbedBuilder, WebhookClient } = require('discord.js');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const utils = require('../shared/utils');

const logLogger = createLogger('DiscordLogger');

// ==================== КЭШ КАНАЛОВ ====================
const channelCache = new Map();

// ==================== ТИПЫ ЛОГОВ ====================
const LOG_TYPES = {
    MODERATION: 'moderation',
    ECONOMY: 'economy',
    STAFF: 'staff',
    ERROR: 'error',
    CLAN: 'clan',
    VERIFICATION: 'verification',
    SYSTEM: 'system',
};

// ==================== ПОЛУЧЕНИЕ КАНАЛА ====================

async function getLogChannel(client, type) {
    const cacheKey = `${type}_channel`;

    if (channelCache.has(cacheKey)) {
        const channel = channelCache.get(cacheKey);
        try {
            await channel.fetch();
            return channel;
        } catch (e) {
            channelCache.delete(cacheKey);
        }
    }

    let channelId;

    switch (type) {
        case LOG_TYPES.MODERATION:
            channelId = process.env.MODERATION_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
            break;
        case LOG_TYPES.ECONOMY:
            channelId = process.env.ECONOMY_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
            break;
        case LOG_TYPES.STAFF:
            channelId = process.env.STAFF_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
            break;
        case LOG_TYPES.CLAN:
            channelId = process.env.CLAN_UPDATES_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
            break;
        case LOG_TYPES.VERIFICATION:
            channelId = process.env.VERIFICATION_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
            break;
        default:
            channelId = process.env.LOG_CHANNEL_ID;
    }

    if (!channelId) return null;

    try {
        const channel = await client.channels.fetch(channelId);
        if (channel) {
            channelCache.set(cacheKey, channel);
            // Инвалидация кэша через 5 минут
            setTimeout(() => channelCache.delete(cacheKey), 300000);
            return channel;
        }
    } catch (error) {
        logLogger.error(`Не удалось получить канал ${type}: ${error.message}`);
    }

    return null;
}

// ==================== ФОРМАТИРОВАНИЕ EMBED ====================

function createLogEmbed(title, description, color, fields = [], footer = null) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();

    if (description) embed.setDescription(description);
    if (footer) embed.setFooter({ text: footer });
    if (fields.length > 0) embed.addFields(fields);

    return embed;
}

// ==================== ОТПРАВКА ЛОГОВ ====================

/**
 * Отправить лог модерации
 */
async function logModeration(client, data) {
    const channel = await getLogChannel(client, LOG_TYPES.MODERATION);
    if (!channel) return;

    const typeColors = {
        'mute': '#FFB800',
        'unmute': '#76C519',
        'kick': '#CA4E4E',
        'blacklist': '#000000',
        'unblacklist': '#76C519',
        'warn': '#FFB800',
        'auto_mute': '#FFB800',
        'auto_blacklist': '#000000',
    };

    const typeNames = {
        'mute': '🔇 Мут',
        'unmute': '🔊 Размут',
        'kick': '👢 Кик',
        'blacklist': '🚫 Чёрный список',
        'unblacklist': '✅ Снятие ЧС',
        'warn': '⚠ Предупреждение',
        'auto_mute': '🤖 Авто-мут',
        'auto_blacklist': '🤖 Авто-ЧС',
    };

    const color = typeColors[data.type] || '#D4D4D4';
    const title = typeNames[data.type] || data.type;

    const fields = [
        { name: 'Нарушитель', value: data.target || 'Неизвестно', inline: true },
        { name: 'Модератор', value: data.issuer || 'AutoMod', inline: true },
    ];

    if (data.reason) {
        fields.push({ name: 'Причина', value: data.reason, inline: false });
    }

    if (data.duration && data.duration > 0) {
        fields.push({
            name: 'Длительность',
            value: utils.formatDuration(data.duration),
            inline: true,
        });
    }

    const embed = createLogEmbed(title, null, color, fields);

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logLogger.error(`Ошибка отправки лога модерации: ${error.message}`);
    }
}

/**
 * Отправить лог экономики
 */
async function logEconomy(client, data) {
    const channel = await getLogChannel(client, LOG_TYPES.ECONOMY);
    if (!channel) return;

    const typeColors = {
        'transfer': '#80C4C5',
        'payday': '#76C519',
        'fine': '#CA4E4E',
        'grant': '#FFB800',
        'property_buy': '#6343d4',
        'property_sell': '#FFB800',
        'admin_give': '#FFB800',
        'admin_remove': '#CA4E4E',
    };

    const color = typeColors[data.type] || '#D4D4D4';

    const fields = [
        { name: 'Тип', value: data.type || 'Неизвестно', inline: true },
    ];

    if (data.username) fields.push({ name: 'Игрок', value: data.username, inline: true });
    if (data.amount) fields.push({ name: 'Сумма', value: utils.formatMoney(data.amount), inline: true });
    if (data.reason) fields.push({ name: 'Описание', value: data.reason, inline: false });

    const embed = createLogEmbed('💰 Экономическая операция', null, color, fields);

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logLogger.error(`Ошибка отправки экономического лога: ${error.message}`);
    }
}

/**
 * Отправить лог персонала
 */
async function logStaff(client, data) {
    const channel = await getLogChannel(client, LOG_TYPES.STAFF);
    if (!channel) return;

    const fields = [];

    if (data.username) fields.push({ name: 'Сотрудник', value: data.username, inline: true });
    if (data.action) fields.push({ name: 'Действие', value: data.action, inline: true });
    if (data.issuer) fields.push({ name: 'Инициатор', value: data.issuer, inline: true });
    if (data.reason) fields.push({ name: 'Причина', value: data.reason, inline: false });
    if (data.detail) fields.push({ name: 'Детали', value: data.detail, inline: false });

    const embed = createLogEmbed(
        '👥 Действие с персоналом',
        data.message || null,
        '#80C4C5',
        fields
    );

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logLogger.error(`Ошибка отправки лога персонала: ${error.message}`);
    }
}

/**
 * Отправить лог клана
 */
async function logClan(client, data) {
    const channel = await getLogChannel(client, LOG_TYPES.CLAN);
    if (!channel) return;

    const fields = [];
    if (data.username) fields.push({ name: 'Игрок', value: data.username, inline: true });
    if (data.event) fields.push({ name: 'Событие', value: data.event, inline: true });
    if (data.detail) fields.push({ name: 'Детали', value: data.detail, inline: false });

    const embed = createLogEmbed(
        '🏰 Событие клана',
        data.message || null,
        '#6343d4',
        fields
    );

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logLogger.error(`Ошибка отправки лога клана: ${error.message}`);
    }
}

/**
 * Отправить лог ошибки
 */
async function logError(client, errorData) {
    const channel = await getLogChannel(client, LOG_TYPES.ERROR);
    if (!channel) return;

    const embed = createLogEmbed(
        '⚠ Ошибка системы',
        `\`\`\`\n${errorData.message || 'Неизвестная ошибка'}\n\`\`\``,
        '#CA4E4E',
        [
            { name: 'Модуль', value: errorData.module || 'Неизвестно', inline: true },
            { name: 'Время', value: new Date().toISOString(), inline: true },
        ]
    );

    if (errorData.stack) {
        embed.addFields({
            name: 'Стек',
            value: `\`\`\`\n${errorData.stack.substring(0, 1000)}\n\`\`\``,
            inline: false,
        });
    }

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        // Последняя попытка — в консоль
        console.error('[DiscordLogger] Критическая ошибка логирования:', error.message);
    }
}

/**
 * Отправить системный лог
 */
async function logSystem(client, data) {
    const channel = await getLogChannel(client, LOG_TYPES.SYSTEM);
    if (!channel) return;

    const embed = createLogEmbed(
        '🔧 Системное сообщение',
        data.message || 'Нет описания',
        '#D4D4D4',
        data.fields || []
    );

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logLogger.error(`Ошибка отправки системного лога: ${error.message}`);
    }
}

// ==================== ОБЩАЯ ФУНКЦИЯ ====================

/**
 * Отправить лог (автоматически определяет тип)
 */
async function sendLog(client, type, data) {
    switch (type) {
        case LOG_TYPES.MODERATION:
            return logModeration(client, data);
        case LOG_TYPES.ECONOMY:
            return logEconomy(client, data);
        case LOG_TYPES.STAFF:
            return logStaff(client, data);
        case LOG_TYPES.CLAN:
            return logClan(client, data);
        case LOG_TYPES.ERROR:
            return logError(client, data);
        case LOG_TYPES.SYSTEM:
            return logSystem(client, data);
        default:
            logLogger.warn(`Неизвестный тип лога: ${type}`);
            return logSystem(client, { message: `[${type}] ${JSON.stringify(data)}` });
    }
}

// ==================== ОЧИСТКА КЭША ====================
function clearChannelCache() {
    channelCache.clear();
    logLogger.debug('Кэш каналов очищен');
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    LOG_TYPES,
    logModeration,
    logEconomy,
    logStaff,
    logClan,
    logError,
    logSystem,
    sendLog,
    clearChannelCache,
    getLogChannel,
};