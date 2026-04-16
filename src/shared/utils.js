// src/shared/utils.js
// Вспомогательные функции для форматирования, валидации и т.д.

// ============================================
// ФУНКЦИЯ ОЧИСТКИ НИКА (регистронезависимая)
// ============================================

function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}

// ============================================
// ФОРМАТИРОВАНИЕ
// ============================================

// Форматирование времени
function formatTime(seconds) {
    if (!seconds) return '0 сек';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours} ч`);
    if (minutes > 0) parts.push(`${minutes} мин`);
    if (secs > 0 && hours === 0) parts.push(`${secs} сек`);
    
    return parts.join(' ');
}

// Форматирование даты
function formatDate(date, format = 'DD.MM.YYYY HH:MM') {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return format
        .replace('DD', day)
        .replace('MM', month)
        .replace('YYYY', year)
        .replace('HH', hours)
        .replace('MM', minutes);
}

// Форматирование числа с разделителями
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Форматирование валюты
function formatMoney(amount) {
    return `${formatNumber(Math.floor(amount))}₽`;
}

// ============================================
// ГЕНЕРАЦИЯ И ЗАДЕРЖКИ
// ============================================

// Генерация случайного кода
function generateCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Задержка (promise)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// ОГРАНИЧЕНИЕ ВЫЗОВОВ
// ============================================

// Ограничение количества вызовов (debounce)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Ограничение частоты вызовов (throttle)
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================
// ВАЛИДАЦИЯ
// ============================================

// Валидация никнейма Minecraft
function isValidMinecraftNick(nick) {
    if (!nick || typeof nick !== 'string') return false;
    return /^[a-zA-Z0-9_]{3,16}$/.test(nick);
}

// Валидация суммы (положительное число)
function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && num <= 1000000;
}

// ============================================
// ОБРАБОТКА ТЕКСТА
// ============================================

// Эскейп специальных символов для чата
function escapeMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`');
}

// Ограничение длины сообщения с многоточием
function truncateMessage(message, maxLength = 50) {
    if (!message) return '';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
}

// ============================================
// ПАРСИНГ
// ============================================

// Парсинг времени из строки (1h, 30m, 1d)
function parseTimeString(timeStr) {
    const match = timeStr.match(/^(\d+)([hmd])$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    switch(unit) {
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// Разбор команды из сообщения
function parseCommand(message) {
    if (!message || !message.startsWith('/')) return null;
    
    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    return { command, args, raw: message };
}

// ============================================
// RP ПРОВЕРКИ
// ============================================

// Проверка заблокирован ли игрок в RP
async function isRPFrozen(nick, db) {
    const cleanNickname = cleanNick(nick);
    const player = await db.get(
        `SELECT is_frozen FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [cleanNickname]
    );
    return player ? player.is_frozen === 1 : false;
}

// Проверка с отправкой сообщения
async function checkRPFrozen(nick, bot, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    
    if (!profile) {
        if (bot) {
            await sleep(500);
            bot.chat(`/msg ${nick} &4&l|&c Вы не зарегистрированы в RolePlay!`);
            await sleep(500);
            bot.chat(`/msg ${nick} &7&l|&f Используйте &e/rp &fдля регистрации`);
        }
        return true;
    }
    
    const isFrozen = profile.is_frozen === 1;
    if (isFrozen && bot) {
        await sleep(500);
        bot.chat(`/msg ${nick} &4&l|&c Ваш RP профиль заморожен!`);
        await sleep(500);
        bot.chat(`/msg ${nick} &4&l|&c Вы не можете использовать RP команды`);
    }
    return isFrozen;
}

// Проверка, находится ли игрок в клане
async function isInClan(nick, db) {
    const cleanNickname = cleanNick(nick);
    const member = await db.getClanMember(cleanNickname);
    return !!member;
}

// Проверка, находится ли игрок в RP
async function isInRP(nick, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    return !!profile;
}

// Проверка, находится ли игрок на дежурстве
async function isOnDuty(nick, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    return profile ? profile.on_duty === 1 : false;
}

// Получение структуры игрока
async function getPlayerStructure(nick, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) return { structure: 'Гражданин', rank: 'Нет' };
    return {
        structure: profile.structure,
        rank: profile.job_rank
    };
}

// Комплексная проверка клана и RP
async function checkClanAndRP(nick, db, bot, requireRP = false) {
    const cleanNickname = cleanNick(nick);
    
    // Проверка в клане
    const inClan = await isInClan(cleanNickname, db);
    if (!inClan) {
        if (bot) {
            await sleep(500);
            bot.chat(`/msg ${nick} &4&l|&c Вы не состоите в клане Resistance!`);
        }
        return { allowed: false, reason: 'not_in_clan' };
    }
    
    // Проверка RP если требуется
    if (requireRP) {
        const inRP = await isInRP(cleanNickname, db);
        if (!inRP) {
            if (bot) {
                await sleep(500);
                bot.chat(`/msg ${nick} &4&l|&c Вы не зарегистрированы в RolePlay!`);
                await sleep(500);
                bot.chat(`/msg ${nick} &7&l|&f Используйте &e/rp &fдля регистрации`);
            }
            return { allowed: false, reason: 'not_in_rp' };
        }
        
        const isFrozen = await isRPFrozen(cleanNickname, db);
        if (isFrozen) {
            if (bot) {
                await sleep(500);
                bot.chat(`/msg ${nick} &4&l|&c Ваш RP профиль заморожен!`);
                await sleep(500);
                bot.chat(`/msg ${nick} &4&l|&c Вы не можете использовать RP команды`);
            }
            return { allowed: false, reason: 'frozen' };
        }
    }
    
    return { allowed: true };
}

// ============================================
// ГРАДИЕНТЫ (совместимость с &hex)
// ============================================

// Градиентные цвета для сообщений
function colorize(text, gradientStart, gradientEnd) {
    return `&#${gradientStart}${text}&r`;
}

// ============================================
// КЛАСС SPAM DETECTOR
// ============================================

class SpamDetector {
    constructor(maxMessagesPerMinute = 3, cooldownSeconds = 30) {
        this.maxMessages = maxMessagesPerMinute;
        this.cooldownSeconds = cooldownSeconds;
        this.userMessages = new Map();
    }
    
    check(nick) {
        const cleanNickname = cleanNick(nick);
        const now = Date.now();
        const userData = this.userMessages.get(cleanNickname) || { timestamps: [], mutedUntil: 0 };
        
        if (userData.mutedUntil > now) {
            return { isSpam: true, remainingSeconds: Math.ceil((userData.mutedUntil - now) / 1000) };
        }
        
        userData.timestamps = userData.timestamps.filter(t => now - t < 60000);
        userData.timestamps.push(now);
        
        if (userData.timestamps.length > this.maxMessages) {
            userData.mutedUntil = now + this.cooldownSeconds * 1000;
            this.userMessages.set(cleanNickname, userData);
            return { isSpam: true, remainingSeconds: this.cooldownSeconds };
        }
        
        this.userMessages.set(cleanNickname, userData);
        return { isSpam: false };
    }
    
    unmute(nick) {
        const cleanNickname = cleanNick(nick);
        const userData = this.userMessages.get(cleanNickname);
        if (userData) {
            userData.mutedUntil = 0;
            this.userMessages.set(cleanNickname, userData);
        }
    }
    
    reset(nick) {
        const cleanNickname = cleanNick(nick);
        this.userMessages.delete(cleanNickname);
    }
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ С ЗАДЕРЖКОЙ
// ============================================

async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await sleep(400);
}

async function sendClanMessage(bot, message) {
    bot.chat(`/cc ${message}`);
    await sleep(300);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    // Очистка ника
    cleanNick,
    
    // Форматирование
    formatTime,
    formatDate,
    formatNumber,
    formatMoney,
    
    // Генерация и задержки
    generateCode,
    sleep,
    
    // Ограничения
    debounce,
    throttle,
    
    // Валидация
    isValidMinecraftNick,
    isValidAmount,
    
    // Обработка текста
    escapeMarkdown,
    truncateMessage,
    
    // Парсинг
    parseTimeString,
    parseCommand,
    
    // RP проверки
    isRPFrozen,
    checkRPFrozen,
    isInClan,
    isInRP,
    isOnDuty,
    getPlayerStructure,
    checkClanAndRP,
    
    // Градиенты
    colorize,
    
    // SpamDetector
    SpamDetector,
    
    // Отправка сообщений
    sendMessage,
    sendClanMessage
};