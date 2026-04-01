// src/minecraft/moderation.js
// Система авто-модерации с 3 предупреждениями и защитой от спама

const utils = require('../shared/utils');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
    enabled: true,
    
    // Клановый чат
    clanChat: {
        messagesPerMinute: 10,          // 10 сообщений в минуту
        warnCount: 3,                   // 3 предупреждения → мут
        muteMinutes: 5,                 // мут на 5 минут
        warnCooldown: 15,               // пауза между предупреждениями 15 сек
        capsPercent: 75,
        minMessageLength: 8,
        repeatSameMessage: 3,
        repeatWindow: 30000,
        maxMentions: 6
    },
    
    // Личные сообщения
    privateChat: {
        sameCommandCooldown: 12,        // 12 сек между одинаковыми командами
        maxSameCommandWarnings: 3,      // 3 одинаковые команды → блокировка
        warnCooldown: 20,               // пауза между предупреждениями 20 сек
        invalidCommandsPerMinute: 6,
        warnCount: 3,                   // 3 предупреждения → блокировка
        ignoreMinutes: 5                // блокировка на 5 минут
    },
    
    // Сообщения (в клановый чат)
    messages: {
        warning: '&e⚠️ [Модерация] &c{player} &7, {reason} &eПредупреждение {current}/{max}',
        cooldown: '&e⏱️ [Модерация] &c{player} &7, {reason} &eПодождите {seconds} секунд',
        mute: '&c🔇 [Модерация] &e{player} &cполучил мут на {minutes} минут. Причина: {reason}',
        unmute: '&a🔊 [Модерация] &e{player} &aразмучен автоматически',
        ignore: '&c🔇 [Модерация] &e{player} &cзаблокированы команды на {minutes} минут. Причина: {reason}'
    },
    
    // Нецензурная лексика
    profanity: {
        severe: ['сука', 'блядь', 'хуй', 'пизда', 'ебать', 'нахуй', 'залупа'],
        moderate: ['дурак', 'идиот', 'тупой', 'лох', 'дебил', 'кретин'],
        mild: ['блин', 'черт', 'ёлки-палки', 'жопа', 'хрен']
    },
    
    // Уровни доверия
    trustLevels: {
        newbie: { multiplier: 1.0, warnThreshold: 3 },
        regular: { multiplier: 1.3, warnThreshold: 3 },
        trusted: { multiplier: 1.8, warnThreshold: 3 },
        vip: { multiplier: 2.5, warnThreshold: 3 },
        staff: { multiplier: 999, warnThreshold: 999 }
    }
};

// ============================================
// ХРАНИЛИЩА
// ============================================

const playerStats = new Map();
const pendingUnmutes = new Map();

// ============================================
// ОСНОВНОЙ КЛАСС
// ============================================

class ModerationSystem {
    constructor(bot, db, addLog) {
        this.bot = bot;
        this.db = db;
        this.addLog = addLog;
        this.config = CONFIG;
    }
    
    // ============================================
    // ОЧИСТКА НИКНЕЙМА
    // ============================================
    
    cleanNickname(nick) {
        if (!nick) return '';
        let cleaned = nick;
        cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
        cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
        cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
        cleaned = cleaned.replace(/[⌜⌟ﾠ𐓏✦🌟🔧🛠🍁⭐]/g, '');
        cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
        return cleaned.trim();
    }
    
    // ============================================
    // ПОЛУЧЕНИЕ СТАТИСТИКИ
    // ============================================
    
    getStats(nick) {
        if (!playerStats.has(nick)) {
            playerStats.set(nick, {
                // Клановый чат
                clanMessages: [],
                clanWarnings: 0,
                clanLastWarnTime: 0,
                clanMutedUntil: 0,
                clanCooldownUntil: 0,
                
                // ЛС
                privateCommands: [],
                privateInvalidCommands: [],
                privateLastCommand: '',
                privateLastCommandTime: 0,
                privateSameCommandCount: 0,
                privateWarnings: 0,
                privateLastWarnTime: 0,
                privateIgnoredUntil: 0,
                
                lastViolation: 0,
                trustScore: 50
            });
        }
        return playerStats.get(nick);
    }
    
    // ============================================
    // УРОВЕНЬ ДОВЕРИЯ
    // ============================================
    
    async getTrustLevel(nick) {
        const cleanNick = this.cleanNickname(nick);
        try {
            const staffRank = await this.db.getStaffRank?.(cleanNick) || { rank_level: 0 };
            if (staffRank.rank_level >= 1) {
                return { level: 'staff', multiplier: 999, warnThreshold: 999 };
            }
        } catch (err) {}
        
        let score = playerStats.get(nick)?.trustScore || 50;
        const stats = playerStats.get(nick);
        
        if (stats && stats.lastViolation) {
            const hoursClean = (Date.now() - stats.lastViolation) / (60 * 60 * 1000);
            if (hoursClean > 24) score = Math.min(100, score + 5);
            if (hoursClean > 72) score = Math.min(100, score + 10);
            score = Math.max(0, score - (stats.clanWarnings + stats.privateWarnings) * 5);
        }
        
        if (score >= 80) return { level: 'vip', multiplier: 2.5, warnThreshold: 3 };
        if (score >= 65) return { level: 'trusted', multiplier: 1.8, warnThreshold: 3 };
        if (score >= 40) return { level: 'regular', multiplier: 1.3, warnThreshold: 3 };
        return { level: 'newbie', multiplier: 1.0, warnThreshold: 3 };
    }
    
    // ============================================
    // ПРОВЕРКА МУТА
    // ============================================
    
    async isMuted(nick) {
        const stats = this.getStats(nick);
        const now = Date.now();
        const cleanNick = this.cleanNickname(nick);
        
        if (stats.clanMutedUntil > now) return true;
        if (stats.privateIgnoredUntil > now) return true;
        
        try {
            const mute = await this.db.isMuted?.(cleanNick);
            if (mute && mute.expires_at) {
                const expires = new Date(mute.expires_at).getTime();
                if (expires > now) {
                    stats.clanMutedUntil = expires;
                    return true;
                }
            }
        } catch (err) {}
        
        return false;
    }
    
    // ============================================
    // ВЫДАЧА МУТА
    // ============================================
    
    async applyMute(nick, minutes, reason, source = 'clan') {
        const stats = this.getStats(nick);
        const now = Date.now();
        const muteUntil = now + minutes * 60 * 1000;
        const cleanNick = this.cleanNickname(nick);
        
        if (source === 'clan') {
            stats.clanMutedUntil = muteUntil;
            stats.clanWarnings = 0;
        } else {
            stats.privateIgnoredUntil = muteUntil;
            stats.privateWarnings = 0;
        }
        
        await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', minutes);
        
        // Отправляем команду мута с ЧИСТЫМ ником
        this.bot.chat(`/c mute ${cleanNick} ${reason}`);
        
        // Уведомления в ЛС и клановый чат
        this.bot.chat(`/msg ${nick} &c🔇 Вы получили мут на ${minutes} минут. Причина: ${reason}`);
        
        const message = this.config.messages.mute
            .replace('{player}', nick)
            .replace('{minutes}', minutes)
            .replace('{reason}', reason);
        this.bot.chat(`/cc ${message}`);
        
        const timeoutId = setTimeout(async () => {
            await this.removeMute(nick);
        }, minutes * 60 * 1000);
        
        pendingUnmutes.set(cleanNick, timeoutId);
        this.addLog(`🔇 Мут ${cleanNick} на ${minutes} мин (${source}): ${reason}`, 'warn');
    }
    
    async removeMute(nick) {
        const stats = this.getStats(nick);
        const now = Date.now();
        const cleanNick = this.cleanNickname(nick);
        
        if (pendingUnmutes.has(cleanNick)) {
            clearTimeout(pendingUnmutes.get(cleanNick));
            pendingUnmutes.delete(cleanNick);
        }
        
        let wasMuted = false;
        if (stats.clanMutedUntil > now) { stats.clanMutedUntil = 0; wasMuted = true; }
        if (stats.privateIgnoredUntil > now) { stats.privateIgnoredUntil = 0; wasMuted = true; }
        
        if (wasMuted) {
            stats.clanWarnings = 0;
            stats.privateWarnings = 0;
            stats.privateSameCommandCount = 0;
            
            await this.db.removePunishment?.(cleanNick, 'mute', 'system', 'Автоматическое снятие');
            this.bot.chat(`/c unmute ${cleanNick}`);
            this.bot.chat(`/msg ${nick} &a✅ Ваш мут снят. Можете снова пользоваться чатом!`);
            
            const message = this.config.messages.unmute.replace('{player}', nick);
            this.bot.chat(`/cc ${message}`);
            this.addLog(`🔊 Размут ${cleanNick}`, 'info');
        }
    }
    
    // ============================================
    // ПРОВЕРКА КЛАНОВОГО ЧАТА
    // ============================================
    
    async checkClanChat(nick, message) {
        if (!this.config.enabled) return { allowed: true };
        if (await this.isMuted(nick)) return { allowed: false, reason: 'Вы в муте' };
        
        const stats = this.getStats(nick);
        const trust = await this.getTrustLevel(nick);
        const now = Date.now();
        
        // Проверка кулдауна после предупреждения
        if (stats.clanCooldownUntil > now) {
            const remaining = Math.ceil((stats.clanCooldownUntil - now) / 1000);
            const cooldownMsg = this.config.messages.cooldown
                .replace('{player}', nick)
                .replace('{reason}', 'пожалуйста, не спамьте')
                .replace('{seconds}', remaining);
            this.bot.chat(`/cc ${cooldownMsg}`);
            return { allowed: false, reason: 'Кулдаун после предупреждения' };
        }
        
        // Очистка старых сообщений
        stats.clanMessages = stats.clanMessages.filter(t => now - t < 60000);
        stats.clanMessages.push(now);
        
        const limit = Math.floor(this.config.clanChat.messagesPerMinute * trust.multiplier);
        
        // Сбор нарушений
        let violation = null;
        
        if (stats.clanMessages.length > limit) {
            violation = { type: 'spam', reason: `Спам сообщениями (${stats.clanMessages.length} за минуту)` };
        } else if (this.checkCaps(message)) {
            violation = { type: 'caps', reason: 'Чрезмерное использование CAPS' };
        } else if (this.checkRepeatMessage(stats, message)) {
            violation = { type: 'repeat', reason: 'Повторение одинаковых сообщений' };
        }
        
        const mentionCount = (message.match(/@\w+/g) || []).length;
        if (mentionCount > this.config.clanChat.maxMentions && !violation) {
            violation = { type: 'mention', reason: `Спам упоминаниями (${mentionCount})` };
        }
        
        const profanityCheck = this.checkProfanity(message);
        if (profanityCheck.detected && !violation) {
            violation = { type: 'profanity', reason: profanityCheck.message, level: profanityCheck.level };
        }
        
        if (violation) {
            return await this.handleClanViolation(nick, violation, stats, trust);
        }
        
        return { allowed: true };
    }
    
    async handleClanViolation(nick, violation, stats, trust) {
        const now = Date.now();
        const warnThreshold = Math.ceil(this.config.clanChat.warnCount / trust.multiplier);
        
        stats.clanWarnings++;
        stats.lastViolation = now;
        
        // Отправляем предупреждение в клановый чат
        const warnMessage = this.config.messages.warning
            .replace('{player}', nick)
            .replace('{reason}', violation.reason)
            .replace('{current}', stats.clanWarnings)
            .replace('{max}', warnThreshold);
        this.bot.chat(`/cc ${warnMessage}`);
        
        this.addLog(`⚠️ [CLAN] ${nick}: ${violation.reason} (${stats.clanWarnings}/${warnThreshold})`, 'debug');
        
        // Устанавливаем кулдаун на 15 секунд после предупреждения
        stats.clanCooldownUntil = now + this.config.clanChat.warnCooldown * 1000;
        stats.clanLastWarnTime = now;
        
        // Если достигнут порог (3 предупреждения) — мут
        if (stats.clanWarnings >= warnThreshold) {
            await this.applyMute(nick, this.config.clanChat.muteMinutes, violation.reason, 'clan');
            return { allowed: false, reason: 'Мут за нарушения в чате' };
        }
        
        return { allowed: true, warned: true };
    }
    
    // ============================================
    // ПРОВЕРКА ЛИЧНЫХ СООБЩЕНИЙ
    // ============================================
    
    async checkPrivateCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        if (await this.isMuted(nick)) {
            return { allowed: false, reason: 'Вы в муте', shouldIgnore: true };
        }
        
        const stats = this.getStats(nick);
        const now = Date.now();
        
        if (stats.privateIgnoredUntil > now) {
            return { allowed: false, reason: 'Ваши команды временно заблокированы', shouldIgnore: true };
        }
        
        // Проверка на одинаковые команды (3 раза подряд)
        if (stats.privateLastCommand === command && stats.privateLastCommandTime > 0) {
            const timeSince = now - stats.privateLastCommandTime;
            const cooldown = this.config.privateChat.sameCommandCooldown * 1000;
            
            if (timeSince < cooldown) {
                stats.privateSameCommandCount++;
                const remaining = Math.ceil((cooldown - timeSince) / 1000);
                
                // Если 3 одинаковые команды подряд → сразу блокировка
                if (stats.privateSameCommandCount >= this.config.privateChat.maxSameCommandWarnings) {
                    await this.handlePrivateViolation(nick, `Повтор команды "${command}" (3 раза подряд)`, stats, true);
                    return { allowed: false, reason: 'Команды временно заблокированы', shouldIgnore: true };
                }
                
                // Предупреждение в клановый чат о кулдауне
                const cooldownMsg = this.config.messages.cooldown
                    .replace('{player}', nick)
                    .replace('{reason}', `повтор команды "${command}"`)
                    .replace('{seconds}', remaining);
                this.bot.chat(`/cc ${cooldownMsg}`);
                
                return { 
                    allowed: false, 
                    reason: `Повтор команды. Подождите ${remaining} секунд`,
                    cooldown: remaining,
                    shouldIgnore: false
                };
            } else {
                // Сброс счётчика, если прошло достаточно времени
                stats.privateSameCommandCount = 0;
            }
        } else {
            stats.privateSameCommandCount = 0;
        }
        
        stats.privateLastCommand = command;
        stats.privateLastCommandTime = now;
        
        return { allowed: true };
    }
    
    async checkInvalidCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        
        const stats = this.getStats(nick);
        const now = Date.now();
        
        if (stats.privateIgnoredUntil > now) {
            return { allowed: false, reason: 'Ваши команды временно заблокированы', shouldIgnore: true };
        }
        
        stats.privateInvalidCommands = stats.privateInvalidCommands.filter(t => now - t < 60000);
        stats.privateInvalidCommands.push(now);
        
        const limit = this.config.privateChat.invalidCommandsPerMinute;
        
        if (stats.privateInvalidCommands.length > limit) {
            const result = await this.handlePrivateViolation(nick, `Спам неверными командами (${stats.privateInvalidCommands.length} за минуту)`, stats, false);
            if (result.blocked) {
                return { allowed: false, reason: 'Ваши команды временно заблокированы', shouldIgnore: true };
            }
        }
        
        return { allowed: true };
    }
    
    async handlePrivateViolation(nick, reason, stats, isImmediateBlock = false) {
        const now = Date.now();
        
        if (now - stats.privateLastWarnTime < this.config.privateChat.warnCooldown * 1000 && !isImmediateBlock) {
            return { blocked: false, warned: false };
        }
        
        stats.privateLastWarnTime = now;
        stats.privateWarnings++;
        stats.lastViolation = now;
        
        // Предупреждение в клановый чат
        const warnMessage = this.config.messages.warning
            .replace('{player}', nick)
            .replace('{reason}', reason)
            .replace('{current}', stats.privateWarnings)
            .replace('{max}', this.config.privateChat.warnCount);
        this.bot.chat(`/cc ${warnMessage}`);
        
        this.addLog(`⚠️ [PRIVATE] ${nick}: ${reason} (${stats.privateWarnings}/${this.config.privateChat.warnCount})`, 'debug');
        
        // Блокировка после 3 предупреждений или при 3 одинаковых командах
        if (stats.privateWarnings >= this.config.privateChat.warnCount || isImmediateBlock) {
            const ignoreUntil = now + this.config.privateChat.ignoreMinutes * 60 * 1000;
            stats.privateIgnoredUntil = ignoreUntil;
            stats.privateWarnings = 0;
            stats.privateSameCommandCount = 0;
            const cleanNick = this.cleanNickname(nick);
            
            await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', this.config.privateChat.ignoreMinutes);
            
            const message = this.config.messages.ignore
                .replace('{player}', nick)
                .replace('{minutes}', this.config.privateChat.ignoreMinutes)
                .replace('{reason}', reason);
            this.bot.chat(`/cc ${message}`);
            this.bot.chat(`/msg ${nick} &c🔇 Ваши команды заблокированы на ${this.config.privateChat.ignoreMinutes} минут. Причина: ${reason}`);
            
            setTimeout(async () => {
                if (stats.privateIgnoredUntil > 0) {
                    stats.privateIgnoredUntil = 0;
                    await this.db.removePunishment?.(cleanNick, 'mute', 'system', 'Автоматическое снятие');
                    this.bot.chat(`/msg ${nick} &a✅ Ваши команды снова доступны!`);
                    this.bot.chat(`/cc &a🔊 &e${nick} &aразблокированы автоматически.`);
                }
            }, this.config.privateChat.ignoreMinutes * 60 * 1000);
            
            return { blocked: true };
        }
        
        return { blocked: false, warned: true };
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    checkCaps(message) {
        const letters = message.replace(/[^a-zA-Zа-яА-Я]/g, '');
        if (letters.length < this.config.clanChat.minMessageLength) return false;
        const capsCount = (message.match(/[A-ZА-Я]/g) || []).length;
        const capsPercent = (capsCount / letters.length) * 100;
        return capsPercent > this.config.clanChat.capsPercent;
    }
    
    checkRepeatMessage(stats, message) {
        if (stats.lastClanMessage === message && (Date.now() - stats.lastClanMessageTime) < this.config.clanChat.repeatWindow) {
            stats.repeatCount = (stats.repeatCount || 0) + 1;
            if (stats.repeatCount >= this.config.clanChat.repeatSameMessage) {
                stats.repeatCount = 0;
                return true;
            }
        } else {
            stats.repeatCount = 1;
            stats.lastClanMessage = message;
            stats.lastClanMessageTime = Date.now();
        }
        return false;
    }
    
    checkProfanity(message) {
        const lowerMsg = message.toLowerCase();
        for (const word of this.config.profanity.severe) {
            if (lowerMsg.includes(word)) return { detected: true, level: 'severe', message: `Нецензурная лексика (${word})` };
        }
        for (const word of this.config.profanity.moderate) {
            if (lowerMsg.includes(word)) return { detected: true, level: 'moderate', message: `Грубость (${word})` };
        }
        for (const word of this.config.profanity.mild) {
            if (lowerMsg.includes(word)) return { detected: true, level: 'mild', message: `Нежелательное выражение (${word})` };
        }
        return { detected: false };
    }
    
    async restorePunishments() {
        try {
            const activeMutes = await this.db.all?.('SELECT * FROM punishments WHERE type = "mute" AND active = 1 AND expires_at > CURRENT_TIMESTAMP');
            if (activeMutes && activeMutes.length > 0) {
                for (const mute of activeMutes) {
                    const expires = new Date(mute.expires_at).getTime();
                    let originalNick = mute.player;
                    for (const [storedNick] of playerStats) {
                        if (this.cleanNickname(storedNick) === mute.player) {
                            originalNick = storedNick;
                            break;
                        }
                    }
                    const stats = this.getStats(originalNick);
                    stats.clanMutedUntil = expires;
                    const remaining = expires - Date.now();
                    if (remaining > 0) {
                        setTimeout(async () => {
                            await this.removeMute(originalNick);
                        }, remaining);
                    }
                }
                this.addLog(`📋 Восстановлено ${activeMutes.length} активных мутов`, 'info');
            }
        } catch (err) {
            this.addLog(`⚠️ Ошибка восстановления мутов: ${err.message}`, 'warn');
        }
    }
    
    reset() {
        playerStats.clear();
        for (const timeout of pendingUnmutes.values()) clearTimeout(timeout);
        pendingUnmutes.clear();
        this.addLog('🔄 Данные авто-модерации сброшены', 'info');
    }
}

// ============================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================

let moderationInstance = null;

async function getModerationSystem(bot, db, addLog) {
    if (!moderationInstance) {
        moderationInstance = new ModerationSystem(bot, db, addLog);
        await moderationInstance.restorePunishments();
    }
    return moderationInstance;
}

module.exports = { getModerationSystem, ModerationSystem };