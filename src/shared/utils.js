// src/shared/utils.js — Общие утилиты Resistance City
// Форматирование сообщений, работа с цветами, парсинг чата, валидация

'use strict';

const config = require('../config');

// ==================== ФОРМАТИРОВАНИЕ ЦВЕТОВ ====================

/**
 * Преобразовать HEX-цвет в Minecraft-формат (&x&r&r&g&g&b&b)
 * @param {string} hex - Цвет в формате #RRGGBB или RRGGBB
 * @returns {string} Minecraft-формат цвета
 */
function hexToMc(hex) {
    if (!hex) return '';
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '';
    return '&x' + clean.split('').map(c => '&' + c).join('');
}

/**
 * Применить градиент к тексту
 * @param {string} text - Исходный текст
 * @param {string} startHex - Начальный цвет (RRGGBB)
 * @param {string} endHex - Конечный цвет (RRGGBB)
 * @returns {string} Текст с градиентом в Minecraft-формате
 */
function gradientText(text, startHex, endHex) {
    if (!text || text.length === 0) return '';

    const startR = parseInt(startHex.substring(0, 2), 16);
    const startG = parseInt(startHex.substring(2, 4), 16);
    const startB = parseInt(startHex.substring(4, 6), 16);
    const endR = parseInt(endHex.substring(0, 2), 16);
    const endG = parseInt(endHex.substring(2, 4), 16);
    const endB = parseInt(endHex.substring(4, 6), 16);

    let result = '';
    const steps = text.length - 1 || 1;

    for (let i = 0; i < text.length; i++) {
        const ratio = i / steps;
        const r = Math.round(startR + (endR - startR) * ratio);
        const g = Math.round(startG + (endG - startG) * ratio);
        const b = Math.round(startB + (endB - startB) * ratio);
        const hex = r.toString(16).padStart(2, '0') +
                   g.toString(16).padStart(2, '0') +
                   b.toString(16).padStart(2, '0');
        result += hexToMc(hex) + text[i];
    }

    return result;
}

/**
 * Форматировать имя клана с градиентом
 * @returns {string} Отформатированное имя клана
 */
function formatClanName() {
    return config.clan.fullColor;
}

// ==================== ФОРМАТИРОВАНИЕ СООБЩЕНИЙ ====================

/**
 * Создать префикс сообщения от бота
 * @returns {string} Префикс с градиентом
 */
function botPrefix() {
    return '&#FF0202| &#76C519';
}

/**
 * Отформатировать сообщение об ошибке команды
 * @param {string} username - Имя пользователя
 * @param {string} command - Неправильная команда
 * @returns {string} Отформатированное сообщение
 */
function formatUnknownCommand(username, command) {
    const shortCommand = command.length > 8 ? command.substring(0, 8) + '...' : command;
    return `${botPrefix()}&#C58383 ${username}&#D4D4D4, неизвестная команда: &c'&#CA4E4E${shortCommand}&c'&#D4D4D4. Напишите &c'&#80C4C5/help&c'&#D4D4D4 для списка команд&r`;
}

/**
 * Отформатировать сообщение об отсутствии прав
 * @param {string} username - Имя пользователя
 * @returns {string} Отформатированное сообщение
 */
function formatNoPermission(username) {
    return `${botPrefix()}&#C58383 ${username}&#D4D4D4, у вас нет прав для использования этой команды&r`;
}

/**
 * Отформатировать сообщение об ошибке использования команды
 * @param {string} username - Имя пользователя
 * @param {string} usage - Правильное использование
 * @returns {string} Отформатированное сообщение
 */
function formatUsageError(username, usage) {
    return `${botPrefix()}&#C58383 ${username}&#D4D4D4, использование: &c'&#80C4C5${usage}&c'&r`;
}

/**
 * Отформатировать успешное сообщение
 * @param {string} username - Имя пользователя
 * @param {string} message - Сообщение
 * @returns {string} Отформатированное сообщение
 */
function formatSuccess(username, message) {
    return `${botPrefix()}&#76C519 ${username}&#D4D4D4, ${message}&r`;
}

/**
 * Отформатировать информационное сообщение
 * @param {string} username - Имя пользователя
 * @param {string} message - Сообщение
 * @returns {string} Отформатированное сообщение
 */
function formatInfo(username, message) {
    return `${botPrefix()}&#76C519 ${username}&#80C4C5, ${message}&r`;
}

/**
 * Отформатировать сообщение об ошибке
 * @param {string} username - Имя пользователя
 * @param {string} message - Сообщение об ошибке
 * @returns {string} Отформатированное сообщение
 */
function formatError(username, message) {
    return `${botPrefix()}&#C58383 ${username}&#CA4E4E, ${message}&r`;
}

/**
 * Отформатировать клановое сообщение от бота
 * @param {string} message - Сообщение
 * @returns {string} Отформатированное клановое сообщение
 */
function formatClanMessage(message) {
    return `&#6343d4&lR&#6b44d9&le&#7345de&ls&#7b47e2&li&#8348e7&ls&#8a49ec&lt&#924af1&la&#9a4cf5&ln&#a24dfa&lc&#aa4eff&le &#D4D4D4| ${message}`;
}

// ==================== ПАРСИНГ ЧАТА ====================

/**
 * Парсинг кланового сообщения
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseClanMessage(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "КЛАН: Никнейм: Сообщение"
    const simpleMatch = message.match(/^КЛАН:\s+(\S+):\s+(.+)$/);
    if (simpleMatch) {
        return {
            type: 'clan_chat',
            username: simpleMatch[1],
            rank: null,
            message: simpleMatch[2].trim(),
            raw: message,
        };
    }

    // Формат: "КЛАН: Ранг Никнейм: Сообщение"
    const rankMatch = message.match(/^КЛАН:\s+(.+?)\s+(\S+):\s+(.+)$/);
    if (rankMatch) {
        return {
            type: 'clan_chat',
            username: rankMatch[2],
            rank: rankMatch[1],
            message: rankMatch[3].trim(),
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг личного сообщения
 * @param {string} message - Сообщение из чата
 * @param {string} botUsername - Имя бота
 * @returns {object|null} Распарсенное сообщение или null
 */
function parsePrivateMessage(message, botUsername) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] [никнейм -> я] сообщение"
    const normalMatch = message.match(/^\[✉\]\s*\[(\S+)\s+->\s+я\]\s+(.+)$/);
    if (normalMatch) {
        return {
            type: 'private_message',
            sender: normalMatch[1],
            isNickChanged: false,
            message: normalMatch[2].trim(),
            raw: message,
        };
    }

    // Формат с изменённым никнеймом: "[*] [~~ghdfgs -> я] Сообщение"
    const changedMatch = message.match(/^\[✉\]\s*\[(~~\S+)\s+->\s+я\]\s+(.+)$/);
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
 * Парсинг результата команды /realname
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseRealnameResult(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] ~~ghdfgs является Никнейм"
    const match = message.match(/^\[✉\]\s*~~(\S+)\s+является\s+(\S+)$/);
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
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseClanApplication(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] Игрок Никнейм подал заявку на вступление в ваш клан."
    const match = message.match(/^\[✉\]\s*Игрок\s+(\S+)\s+подал заявку на вступление в ваш клан\.?$/);
    if (match) {
        return {
            username: match[1],
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг входа в клан
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseClanJoin(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] Никнейм присоединился к клану."
    const match = message.match(/^\[✉\]\s*(\S+)\s+присоединился к клану\.?$/);
    if (match) {
        return {
            username: match[1],
            type: 'join',
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг выхода из клана
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseClanLeave(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] Никнейм покинул клан."
    const match = message.match(/^\[✉\]\s*(\S+)\s+покинул клан\.?$/);
    if (match) {
        return {
            username: match[1],
            type: 'leave',
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг убийства
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseKill(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "Никнейм убил игрока Никнейм"
    const match = message.match(/^(\S+)\s+убил игрока\s+(\S+)/);
    if (match) {
        return {
            killer: match[1],
            victim: match[2],
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг сообщения о перемещении в лобби
 * @param {string} message - Сообщение из чата
 * @returns {boolean} Перемещён ли в лобби
 */
function isMovedToLobby(message) {
    if (!message || typeof message !== 'string') return false;
    return message.includes('Ты перемещен в лобби') || message.includes('перемещён в лобби');
}

/**
 * Парсинг сообщения об исключении из клана (кик)
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseClanKick(message) {
    if (!message || typeof message !== 'string') return null;

    // Формат: "[*] Игрок Никнейм был исключён из клана."
    const match = message.match(/^\[✉\]\s*Игрок\s+(\S+)\s+был исключён из клана\.?$/);
    if (match) {
        return {
            username: match[1],
            raw: message,
        };
    }

    return null;
}

/**
 * Парсинг информации о регионе (/rg i)
 * @param {string} message - Сообщение из чата
 * @returns {object|null} Распарсенное сообщение или null
 */
function parseRegionInfo(message) {
    if (!message || typeof message !== 'string') return null;

    // Ищем строку "Участники: Никнейм, Никнейм2"
    const match = message.match(/Участники:\s+(.+)$/);
    if (match) {
        const members = match[1].split(',').map(m => m.trim()).filter(m => m.length > 0);
        return {
            members: members,
            raw: message,
        };
    }

    return null;
}

// ==================== ВАЛИДАЦИЯ ====================

/**
 * Нормализовать имя пользователя (нижний регистр)
 * @param {string} username - Имя пользователя
 * @returns {string} Нормализованное имя
 */
function normalizeUsername(username) {
    if (!username || typeof username !== 'string') return '';
    return username.toLowerCase().trim();
}

/**
 * Проверить, является ли строка валидным никнеймом Minecraft
 * @param {string} username - Имя пользователя
 * @returns {boolean} Валидный ли никнейм
 */
function isValidMinecraftUsername(username) {
    if (!username || typeof username !== 'string') return false;
    // Никнейм Minecraft: 3-16 символов, только буквы, цифры и подчёркивание
    return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

/**
 * Проверить, является ли строка числом
 * @param {string} value - Значение
 * @returns {boolean} Является ли числом
 */
function isNumeric(value) {
    if (value === undefined || value === null) return false;
    return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Безопасно преобразовать строку в число
 * @param {string} value - Значение
 * @param {number} defaultValue - Значение по умолчанию
 * @returns {number} Число или значение по умолчанию
 */
function safeParseNumber(value, defaultValue = 0) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Безопасно преобразовать строку в целое число
 * @param {string} value - Значение
 * @param {number} defaultValue - Значение по умолчанию
 * @returns {number} Целое число или значение по умолчанию
 */
function safeParseInt(value, defaultValue = 0) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Проверить, является ли значение валидным ID имущества
 * @param {string|number} propertyId - ID имущества
 * @returns {boolean} Валидный ли ID
 */
function isValidPropertyId(propertyId) {
    const id = String(propertyId);
    return config.propertyPrices.hasOwnProperty(id);
}

/**
 * Проверить валидность суммы перевода
 * @param {number} amount - Сумма
 * @returns {boolean} Валидная ли сумма
 */
function isValidTransferAmount(amount) {
    return amount > 0 && amount <= config.economy.maxTransferAmount;
}

// ==================== ВРЕМЯ И ДАТЫ ====================

/**
 * Форматировать длительность в читаемый вид
 * @param {number} minutes - Минуты
 * @returns {string} Отформатированная длительность
 */
function formatDuration(minutes) {
    if (minutes <= 0) return '0 мин';

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} дн`);
    if (hours > 0) parts.push(`${hours} ч`);
    if (mins > 0) parts.push(`${mins} мин`);

    return parts.join(' ');
}

/**
 * Форматировать дату в читаемый вид
 * @param {Date|string} date - Дата
 * @returns {string} Отформатированная дата
 */
function formatDate(date) {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';

    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/**
 * Рассчитать оставшееся время до даты
 * @param {Date|string} date - Целевая дата
 * @returns {string} Оставшееся время в читаемом виде
 */
function timeUntil(date) {
    if (!date) return '—';
    const target = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(target.getTime())) return '—';

    const now = new Date();
    const diffMs = target - now;

    if (diffMs <= 0) return 'истекло';

    const minutes = Math.floor(diffMs / 60000);
    return formatDuration(minutes);
}

/**
 * Проверить, прошла ли указанная дата
 * @param {Date|string} date - Дата для проверки
 * @returns {boolean} Прошла ли дата
 */
function isExpired(date) {
    if (!date) return true;
    const target = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(target.getTime())) return true;
    return target < new Date();
}

// ==================== РАБОТА С МАССИВАМИ И СТРОКАМИ ====================

/**
 * Разбить строку команды на аргументы с учётом кавычек
 * @param {string} input - Строка команды
 * @returns {string[]} Массив аргументов
 */
function parseArguments(input) {
    if (!input || typeof input !== 'string') return [];

    const args = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            continue;
        }

        if (char === quoteChar && inQuote) {
            inQuote = false;
            quoteChar = '';
            continue;
        }

        if (char === ' ' && !inQuote) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (current.length > 0) {
        args.push(current);
    }

    return args;
}

/**
 * Обрезать строку до указанной длины с многоточием
 * @param {string} str - Исходная строка
 * @param {number} maxLength - Максимальная длина
 * @returns {string} Обрезанная строка
 */
function truncate(str, maxLength = 100) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Экранировать специальные символы Minecraft-форматирования
 * @param {string} str - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeMcFormatting(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/&/g, '&').replace(/§/g, '&');
}

/**
 * Сгенерировать случайную строку
 * @param {number} length - Длина строки
 * @returns {string} Случайная строка
 */
function randomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Сгенерировать случайное число в диапазоне
 * @param {number} min - Минимальное значение
 * @param {number} max - Максимальное значение
 * @returns {number} Случайное число
 */
function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================== ФОРМАТИРОВАНИЕ ЧИСЕЛ ====================

/**
 * Форматировать число с разделителями тысяч
 * @param {number} num - Число
 * @returns {string} Отформатированное число
 */
function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Форматировать денежную сумму
 * @param {number} amount - Сумма
 * @returns {string} Отформатированная сумма
 */
function formatMoney(amount) {
    if (amount === undefined || amount === null) return '0 ₽';
    return formatNumber(Math.round(amount * 100) / 100) + ' ₽';
}

// ==================== ПРОВЕРКИ ОКРУЖЕНИЯ ====================

/**
 * Проверить, является ли текущее время рабочим (по расписанию)
 * @returns {boolean} Рабочее ли время
 */
function isWorkTime() {
    const now = new Date();
    const hour = now.getHours();
    const mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;

    const { workHours } = config.payday;

    for (const period of workHours) {
        if (mskHour >= period.start && mskHour < period.end) {
            return true;
        }
    }

    return false;
}

/**
 * Проверить, является ли текущее время перерывом
 * @returns {boolean} Время перерыва ли
 */
function isBreakTime() {
    const now = new Date();
    const hour = now.getHours();
    const mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;

    const { breakHours } = config.payday;
    return mskHour >= breakHours.start && mskHour < breakHours.end;
}

/**
 * Проверить, является ли текущее время временем отдыха
 * @returns {boolean} Время отдыха ли
 */
function isRestTime() {
    const now = new Date();
    const hour = now.getHours();
    const mskHour = (hour + (now.getTimezoneOffset() / 60) + 3 + 24) % 24;

    const { restHours } = config.payday;

    if (restHours.start > restHours.end) {
        // Период с переходом через полночь (23:00 - 14:00)
        return mskHour >= restHours.start || mskHour < restHours.end;
    }

    return mskHour >= restHours.start && mskHour < restHours.end;
}

// ==================== ДЕБАГ-УТИЛИТЫ ====================

/**
 * Безопасное логирование объекта (без циклических ссылок)
 * @param {object} obj - Объект для логирования
 * @returns {string} Строковое представление
 */
function safeStringify(obj) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        }, 2);
    } catch (error) {
        return String(obj);
    }
}

/**
 * Измерить время выполнения функции
 * @param {Function} fn - Функция для измерения
 * @param {string} label - Метка
 * @returns {*} Результат функции
 */
function measureTime(fn, label = 'Function') {
    const start = Date.now();
    const result = fn();
    const end = Date.now();
    console.log(`[PERF] ${label}: ${end - start}ms`);
    return result;
}

module.exports = {
    // Форматирование цветов
    hexToMc,
    gradientText,
    formatClanName,

    // Форматирование сообщений
    botPrefix,
    formatUnknownCommand,
    formatNoPermission,
    formatUsageError,
    formatSuccess,
    formatInfo,
    formatError,
    formatClanMessage,

    // Парсинг чата
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

    // Валидация
    normalizeUsername,
    isValidMinecraftUsername,
    isNumeric,
    safeParseNumber,
    safeParseInt,
    isValidPropertyId,
    isValidTransferAmount,

    // Время и даты
    formatDuration,
    formatDate,
    timeUntil,
    isExpired,

    // Строки и массивы
    parseArguments,
    truncate,
    escapeMcFormatting,
    randomString,
    randomNumber,

    // Форматирование чисел
    formatNumber,
    formatMoney,

    // Проверки окружения
    isWorkTime,
    isBreakTime,
    isRestTime,

    // Дебаг-утилиты
    safeStringify,
    measureTime,
};