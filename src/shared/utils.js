// src/shared/utils.js
// Вспомогательные функции для форматирования, валидации и т.д.

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
    return `💰 ${formatNumber(Math.floor(amount))}₽`;
}

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
// Проверка заблокирован ли игрок в RP
async function isRPFrozen(nick, db) {
    const player = await db.get(
        `SELECT is_frozen FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [nick]
    );
    return player ? player.is_frozen === 1 : false;
}

// Проверка с отправкой сообщения
async function checkRPFrozen(sender, bot, db) {
    const isFrozen = await isRPFrozen(sender, db);
    if (isFrozen) {
        bot.chat(`/msg ${sender} &4&l|&c Ваш RP профиль заморожен!`);
        bot.chat(`/msg ${sender} &4&l|&c Вы не можете использовать RP команды`);
        bot.chat(`/msg ${sender} &7&l|&f Обратитесь к администрации для разморозки`);
        return true;
    }
    return false;
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

// Проверка, находится ли игрок на дежурстве
async function isOnDuty(nick, db) {
    const profile = await db.get('SELECT on_duty FROM rp_players WHERE minecraft_nick = ?', [nick]);
    return profile ? profile.on_duty === 1 : false;
}

// Получение структуры игрока
async function getPlayerStructure(nick, db) {
    const profile = await db.get('SELECT structure, job_rank FROM rp_players WHERE minecraft_nick = ?', [nick]);
    if (!profile) return { structure: 'Гражданин', rank: 'Нет' };
    return {
        structure: profile.structure,
        rank: profile.job_rank
    };
}

// Градиентные цвета для сообщений (совместимость с &hex)
function colorize(text, gradientStart, gradientEnd) {
    // Простая реализация — возвращаем текст с HEX кодом
    // На сервере должен быть плагин, поддерживающий &hex
    return `&#${gradientStart}${text}&r`;
}

// Разбор команды из сообщения
function parseCommand(message) {
    if (!message || !message.startsWith('/')) return null;
    
    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    return { command, args, raw: message };
}

// Проверка на спам (простая версия)
class SpamDetector {
    constructor(maxMessagesPerMinute = 3, cooldownSeconds = 30) {
        this.maxMessages = maxMessagesPerMinute;
        this.cooldownSeconds = cooldownSeconds;
        this.userMessages = new Map();
    }
    
    check(nick) {
        const now = Date.now();
        const userData = this.userMessages.get(nick) || { timestamps: [], mutedUntil: 0 };
        
        // Проверяем, не в муте ли пользователь
        if (userData.mutedUntil > now) {
            return { isSpam: true, remainingSeconds: Math.ceil((userData.mutedUntil - now) / 1000) };
        }
        
        // Очищаем старые сообщения (старше 60 секунд)
        userData.timestamps = userData.timestamps.filter(t => now - t < 60000);
        
        // Добавляем новое сообщение
        userData.timestamps.push(now);
        
        // Проверяем, не спамит ли
        if (userData.timestamps.length > this.maxMessages) {
            userData.mutedUntil = now + this.cooldownSeconds * 1000;
            this.userMessages.set(nick, userData);
            return { isSpam: true, remainingSeconds: this.cooldownSeconds };
        }
        
        this.userMessages.set(nick, userData);
        return { isSpam: false };
    }
    
    // Снять мут
    unmute(nick) {
        const userData = this.userMessages.get(nick);
        if (userData) {
            userData.mutedUntil = 0;
            this.userMessages.set(nick, userData);
        }
    }
}

module.exports = {
    formatTime,
    formatDate,
    formatNumber,
    formatMoney,
    generateCode,
    sleep,
    debounce,
    throttle,
    isValidMinecraftNick,
    isValidAmount,
    escapeMarkdown,
    truncateMessage,
    parseTimeString,
    isOnDuty,
    getPlayerStructure,
    colorize,
    parseCommand,
    SpamDetector,
    isRPFrozen,
    checkRPFrozen
};