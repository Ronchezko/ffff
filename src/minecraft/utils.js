// src/minecraft/utils.js — Утилиты Minecraft-бота Resistance City v5.0.0
// Парсинг чата, работа с командами, форматирование сообщений

'use strict';

const config = require('../config');
const { logger } = require('../shared/logger');

// ==================== ПАРСИНГ ЧАТА ====================

/**
 * Парсинг кланового сообщения
 * Формат: "КЛАН: Никнейм: Сообщение"
 * Формат с рангом: "КЛАН: Ранг Никнейм: Сообщение"
 */
function parseClanMessage(message) {
    if (!message || typeof message !== 'string') return null;

    // С рангом
    var rankMatch = message.match(/^КЛАН:\s+(.+?)\s+(\S+):\s+(.+)$/);
    if (rankMatch) {
        return {
            type: 'clan_chat',
            username: rankMatch[2],
            rank: rankMatch[1],
            message: rankMatch[3].trim(),
            raw: message,
        };
    }

    // Без ранга
    var simpleMatch = message.match(/^КЛАН:\s+(\S+):\s+(.+)$/);
    if (simpleMatch) {
        return {
            type: 'clan_chat',
            username: simpleMatch[1],
            rank: null,
            message: simpleMatch[2].trim(),
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг личного сообщения
 * Формат: "[*] [никнейм -> я] сообщение"
 * Формат с изменённым ником: "[*] [~~ghdfgs -> я] Сообщение"
 */
function parsePrivateMessage(message, botUsername) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] [никнейм -> я] сообщение"
    var normalMatch = message.match(/^\[✉\]\s*\[(\S+)\s*->\s*я\]\s*(.+)$/);
    if (!normalMatch) {
        // Альтернативный формат: "[*] [никнейм -> я] сообщение" (без символа конверта)
        normalMatch = message.match(/^\[\*\]\s*\[(\S+)\s*->\s*я\]\s*(.+)$/);
    }
    if (normalMatch) {
        return {
            type: 'private_message',
            sender: normalMatch[1],
            isNickChanged: false,
            message: normalMatch[2].trim(),
            raw: message,
        };
    }

    // Изменённый ник: "[*] [~~ghdfgs -> я] Сообщение"
    var changedMatch = message.match(/^\[✉\]\s*\[(~~\S+)\s*->\s*я\]\s*(.+)$/);
    if (!changedMatch) {
        changedMatch = message.match(/^\[\*\]\s*\[(~~\S+)\s*->\s*я\]\s*(.+)$/);
    }
    if (changedMatch) {
        return {
            type: 'private_message',
            sender: changedMatch[1],
            isNickChanged: true,
            changedNick: changedMatch[1].replace(/^~~/, ''),
            message: changedMatch[2].trim(),
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг /realname
 * Формат: "[*] ~~ghdfgs является Никнейм"
 */
function parseRealnameResult(message) {
    if (!message || typeof message !== 'string') return null;

    var match = message.match(/^\[✉\]\s*~~(\S+)\s+является\s+(\S+)$/);
    if (match) {
        return {
            changedNick: match[1],
            realUsername: match[2],
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг заявки в клан
 */
function parseClanApplication(message) {
    if (!message) return null;
    var match = message.match(/^\[✉\]\s*Игрок\s+(\S+)\s+подал заявку на вступление в ваш клан\.?$/);
    if (match) {
        return { username: match[1], raw: message };
    }
    return null;
}

/**
 * Парсинг входа в клан
 */
function parseClanJoin(message) {
    if (!message) return null;
    var match = message.match(/^\[✉\]\s*(\S+)\s+присоединился к клану\.?$/);
    if (match) {
        return { username: match[1], type: 'join', raw: message };
    }
    return null;
}

/**
 * Парсинг выхода из клана
 */
function parseClanLeave(message) {
    if (!message) return null;
    var match = message.match(/^\[✉\]\s*(\S+)\s+покинул клан\.?$/);
    if (match) {
        return { username: match[1], type: 'leave', raw: message };
    }
    return null;
}

/**
 * Парсинг убийства
 */
function parseKill(message) {
    if (!message) return null;
    var match = message.match(/^(\S+)\s+убил игрока\s+(\S+)/);
    if (match) {
        return { killer: match[1], victim: match[2], raw: message };
    }
    return null;
}

/**
 * Проверка перемещения в лобби
 */
function isMovedToLobby(message) {
    if (!message) return false;
    return message.indexOf('Ты перемещен в лобби') !== -1 ||
           message.indexOf('перемещён в лобби') !== -1;
}

/**
 * Парсинг кика из клана
 */
function parseClanKick(message) {
    if (!message) return null;
    var match = message.match(/^\[✉\]\s*Игрок\s+(\S+)\s+был исключён из клана\.?$/);
    if (match) {
        return { username: match[1], raw: message };
    }
    return null;
}

/**
 * Парсинг информации о регионе
 */
function parseRegionInfo(message) {
    if (!message) return null;
    var match = message.match(/Участники:\s+(.+)$/);
    if (match) {
        var members = match[1].split(',').map(function(m) {
            return m.trim();
        }).filter(function(m) {
            return m.length > 0;
        });
        return { members: members, raw: message };
    }
    return null;
}

// ==================== ФОРМАТИРОВАНИЕ СООБЩЕНИЙ ====================

function formatClanMessage(message) {
    return config.clan.fullColor + ' &7| ' + message;
}

function formatUnknownCommand(username, command) {
    var shortCommand = command.length > 8 ? command.substring(0, 8) + '...' : command;
    return '&#FF0202| &#76C519' + username + '&#D4D4D4, неизвестная команда: &c\'&#CA4E4E' + shortCommand + '&c\'&#D4D4D4. Напишите &c\'&#80C4C5/help&c\'&#D4D4D4 для списка команд&r';
}

function formatNoPermission(username) {
    return '&#FF0202| &#C58383' + username + '&#D4D4D4, у вас нет прав для использования этой команды&r';
}

function formatUsageError(username, usage) {
    return '&#FF0202| &#C58383' + username + '&#D4D4D4, использование: &c\'&#80C4C5' + usage + '&c\'&r';
}

function formatSuccess(username, message) {
    return '&#FF0202| &#76C519' + username + '&#D4D4D4, ' + message + '&r';
}

function formatInfo(username, message) {
    return '&#FF0202| &#76C519' + username + '&#80C4C5, ' + message + '&r';
}

function formatError(username, message) {
    return '&#FF0202| &#C58383' + username + '&#CA4E4E, ' + message + '&r';
}

// ==================== ВАЛИДАЦИЯ ====================

function normalizeUsername(username) {
    if (!username) return '';
    return username.toLowerCase().trim();
}

function isValidMinecraftUsername(username) {
    if (!username) return false;
    return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

function isValidPropertyId(propertyId) {
    var id = String(propertyId);
    return config.propertyPrices.hasOwnProperty(id);
}

function isValidTransferAmount(amount) {
    return amount > 0 && amount <= config.economy.maxTransferAmount;
}

// ==================== ФОРМАТИРОВАНИЕ ЧИСЕЛ ====================

function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('ru-RU');
}

function formatMoney(amount) {
    if (amount === undefined || amount === null) return '0 ₽';
    return Math.round(amount * 100) / 100 + ' ₽';
}

function formatDuration(minutes) {
    if (minutes <= 0) return '0 мин';
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    var mins = minutes % 60;
    var parts = [];
    if (days > 0) parts.push(days + ' дн');
    if (hours > 0) parts.push(hours + ' ч');
    if (mins > 0) parts.push(mins + ' мин');
    return parts.join(' ') || '0 мин';
}

function formatDate(date) {
    if (!date) return '—';
    var d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes;
}

function timeUntil(date) {
    if (!date) return '—';
    var target = new Date(date);
    if (isNaN(target.getTime())) return '—';
    var diff = target - Date.now();
    if (diff <= 0) return 'истекло';
    var minutes = Math.floor(diff / 60000);
    return formatDuration(minutes);
}

function isExpired(date) {
    if (!date) return true;
    var target = new Date(date);
    if (isNaN(target.getTime())) return true;
    return target < new Date();
}

// ==================== ПРОВЕРКИ ВРЕМЕНИ ====================

function isWorkTime() {
    var now = new Date();
    var hour = now.getHours();
    var mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;
    var workHours = config.payday.workHours;
    for (var i = 0; i < workHours.length; i++) {
        if (mskHour >= workHours[i].start && mskHour < workHours[i].end) {
            return true;
        }
    }
    return false;
}

function isBreakTime() {
    var now = new Date();
    var hour = now.getHours();
    var mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;
    var breakHours = config.payday.breakHours;
    return mskHour >= breakHours.start && mskHour < breakHours.end;
}

function isRestTime() {
    var now = new Date();
    var hour = now.getHours();
    var mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;
    var restHours = config.payday.restHours;
    if (restHours.start > restHours.end) {
        return mskHour >= restHours.start || mskHour < restHours.end;
    }
    return mskHour >= restHours.start && mskHour < restHours.end;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    parseClanMessage,
    parsePrivateMessage,
    parseRealnameResult,
    parseClanApplication,
    parseClanJoin,
    parseClanLeave,
    parseKill,
    isMovedToLobby,
    parseClanKick,
    parseRegionInfo,
    formatClanMessage,
    formatUnknownCommand,
    formatNoPermission,
    formatUsageError,
    formatSuccess,
    formatInfo,
    formatError,
    normalizeUsername,
    isValidMinecraftUsername,
    isValidPropertyId,
    isValidTransferAmount,
    formatNumber,
    formatMoney,
    formatDuration,
    formatDate,
    timeUntil,
    isExpired,
    isWorkTime,
    isBreakTime,
    isRestTime,
};