// src/minecraft/moderation.js
// Лояльная система для кланового чата, строгая для ЛС

const utils = require('../shared/utils');

const CONFIG = {
    enabled: true,
    
    // КЛАНОВЫЙ ЧАТ - ЛОЯЛЬНО
    clanChat: {
        messagesPerMinute: 12,           // 12 сообщений в минуту (лояльно)
        warnCount: 3,                    // 3 предупреждения → мут
        muteMinutes: 10,                 // мут на 10 минут
        capsPercent: 80,                 // 80% капса (лояльно)
        minMessageLength: 10,
        repeatSameMessage: 4,            // 4 одинаковых сообщения
        repeatWindow: 40000,
        maxMentions: 8                   // 8 упоминаний
    },
    
    // ЛИЧНЫЕ СООБЩЕНИЯ - СТРОГО (защита бота)
    privateChat: {
        sameCommandCooldown: 15,         // 15 сек между одинаковыми командами
        maxSameCommandWarnings: 2,       // 2 одинаковые команды → предупреждение
        warnCount: 2,                    // 2 предупреждения → блокировка
        blockMinutes: 5,                 // блокировка на 5 минут
        invalidCommandsPerMinute: 5,     // 5 неверных команд в минуту
        maxRepeatedMessages: 2,          // 2 одинаковых сообщения в ЛС → предупреждение
        warnCooldown: 30                 // после предупреждения пауза 30 сек
    },
    
    // СООБЩЕНИЯ (в клановый чат)
    messages: {
        warning: '&e⚠️ [Модерация] &c{player} &7, {reason} &eПредупреждение {current}/{max}',
        mute: '&c🔇 [Модерация] &e{player} &cполучил мут на {minutes} минут. Причина: {reason}',
        unmute: '&a🔊 [Модерация] &e{player} &aразмучен автоматически',
        block: '&c🔇 [Модерация] &e{player} &cзаблокированы команды на {minutes} минут. Причина: {reason}',
        unblock: '&a🔊 [Модерация] &e{player} &aкоманды снова доступны'
    },
    
    // Нецензурная лексика
    profanity: {
        severe: ['сука', 'блядь', 'хуй', 'пизда', 'ебать', 'нахуй', 'залупа'],
        moderate: ['дурак', 'идиот', 'тупой', 'лох', 'дебил', 'кретин'],
        mild: ['блин', 'черт', 'ёлки-палки', 'жопа', 'хрен']
    }
};

const playerStats = new Map();
const pendingUnmutes = new Map();

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
    
    // 1. Удаляем все цветовые коды Minecraft
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    
    // 2. Удаляем HEX цвета &#RRGGBB
    cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
    
    // 3. Удаляем квадратные скобки и их содержимое
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
    
    // 4. Удаляем специальные символы (ранги, иконки)
    cleaned = cleaned.replace(/[⌜⌟ﾠ𐓏✦🌟🔧🛠🍁⭐]/g, '');
    
    // 5. Удаляем ВСЕ русские слова-ранги (Новенький, Участник, Модератор и т.д.)
    //    Включая вариант с латинскими символами "ноʙᴇньᴋий"
    cleaned = cleaned.replace(/ноʙᴇньᴋий/gi, '');
    cleaned = cleaned.replace(/новенький/gi, '');
    cleaned = cleaned.replace(/участник/gi, '');
    cleaned = cleaned.replace(/модератор/gi, '');
    cleaned = cleaned.replace(/администратор/gi, '');
    cleaned = cleaned.replace(/куратор/gi, '');
    cleaned = cleaned.replace(/гл\.модератор/gi, '');
    cleaned = cleaned.replace(/ст\.модератор/gi, '');
    cleaned = cleaned.replace(/мл\.модератор/gi, '');
    
    // 6. Удаляем все, что не буква, не цифра, не подчеркивание
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    
    // 7. Удаляем пустые пробелы
    cleaned = cleaned.trim();
    
    // 8. Если после очистки ничего не осталось, пробуем взять последнее слово из ника
    if (!cleaned || cleaned.length < 2) {
        const words = nick.split(/[\s:]/);
        for (let i = words.length - 1; i >= 0; i--) {
            const candidate = words[i].replace(/[^a-zA-Z0-9_]/g, '');
            if (candidate && candidate.length >= 2 && !candidate.match(/^(ноʙᴇньᴋий|новенький|участник|модератор)$/i)) {
                cleaned = candidate;
                break;
            }
        }
    }
    
    // 9. Финальная проверка
    if (!cleaned || cleaned.length < 2) {
        this.addLog(`⚠️ Не удалось очистить ник: "${nick}"`, 'warn');
        return nick.replace(/[^a-zA-Z0-9_]/g, ''); // возвращаем хотя бы что-то
    }
    
    this.addLog(`🧹 Очистка ника: "${nick}" → "${cleaned}"`, 'debug');
    
    return cleaned;
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
                clanMutedUntil: 0,
                lastClanMessage: '',
                lastClanMessageTime: 0,
                repeatCount: 0,
                
                // Личные сообщения
                privateMessages: [],
                privateLastCommand: '',
                privateLastCommandTime: 0,
                privateSameCommandCount: 0,
                privateWarnings: 0,
                privateLastWarnTime: 0,
                privateBlockedUntil: 0,
                
                lastViolation: 0
            });
        }
        return playerStats.get(nick);
    }
    
    // ============================================
    // ПРОВЕРКА МУТА
    // ============================================
    
    async isMuted(nick) {
        const stats = this.getStats(nick);
        const now = Date.now();
        const cleanNick = this.cleanNickname(nick);
        
        if (stats.clanMutedUntil > now) return true;
        if (stats.privateBlockedUntil > now) return true;
        
        try {
            const mute = await this.db.get?.(
                `SELECT * FROM punishments 
                 WHERE player = ? AND type = 'mute' AND active = 1 
                 AND expires_at > CURRENT_TIMESTAMP`,
                [cleanNick]
            );
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
    async removeClanMute(nick) {
    const stats = this.getStats(nick);
    const now = Date.now();
    const cleanNick = this.cleanNickname(nick);
    const unmuteCommand = process.env.MC_UNMUTE_COMMAND || '/c unmute';
    
    if (pendingUnmutes.has(cleanNick)) {
        clearTimeout(pendingUnmutes.get(cleanNick));
        pendingUnmutes.delete(cleanNick);
    }
    
    if (stats.clanMutedUntil > now) {
        stats.clanMutedUntil = 0;
        stats.clanWarnings = 0;
        
        // Снимаем только клановый мут
        await this.db.run?.(
            `UPDATE punishments SET active = 0, lifted_by = 'system', lifted_at = CURRENT_TIMESTAMP 
             WHERE player = ? AND type = 'mute' AND source = 'clan' AND active = 1`,
            [cleanNick]
        );
        
        await utils.sleep(500);
        this.bot.chat(`${unmuteCommand} ${cleanNick}`);
        this.addLog(`📤 Снятие кланового мута: ${unmuteCommand} ${cleanNick}`, 'info');
        
        this.bot.chat(`/msg ${nick} &a✅ Ваш мут снят. Можете снова пользоваться чатом!`);
        this.bot.chat(`/cc &a🔊 &e${nick} &aразмучен автоматически.`);
        this.addLog(`🔊 Снят клановый мут ${cleanNick}`, 'info');
    }
}
    // ============================================
    // ВЫДАЧА МУТА В КЛАНОВОМ ЧАТЕ
    // ============================================
    async removePrivateBlock(nick) {
    const stats = this.getStats(nick);
    const now = Date.now();
    const cleanNick = this.cleanNickname(nick);
    
    if (pendingUnmutes.has(cleanNick)) {
        clearTimeout(pendingUnmutes.get(cleanNick));
        pendingUnmutes.delete(cleanNick);
    }
    
    if (stats.privateBlockedUntil > now) {
        stats.privateBlockedUntil = 0;
        stats.privateWarnings = 0;
        stats.privateSameCommandCount = 0;
        
        await this.db.removePunishment?.(cleanNick, 'mute', 'system', 'Автоматическое снятие');
        
        this.bot.chat(`/msg ${nick} &a✅ Ваши команды снова доступны!`);
        this.bot.chat(`/cc &a🔊 &e${nick} &aразблокированы автоматически.`);
        
        this.addLog(`🔊 Снята блокировка ЛС для ${cleanNick}`, 'info');
    }
}
    async applyClanMute(nick, minutes, reason) {
    const stats = this.getStats(nick);
    const now = Date.now();
    const muteUntil = now + minutes * 60 * 1000;
    const cleanNick = this.cleanNickname(nick);
    const muteCommand = process.env.MC_MUTE_COMMAND || '/c mute';
    
    this.addLog(`🔍 МУТ (КЛАНОВЫЙ): ник="${cleanNick}", причина="${reason}"`, 'info');
    
    if (!cleanNick || cleanNick.length < 2) {
        this.addLog(`❌ Невозможно выдать мут: ник "${cleanNick}" невалидный`, 'error');
        return;
    }
    
    stats.clanMutedUntil = muteUntil;
    stats.clanWarnings = 0;
    
    // Сохраняем в БД с source = 'clan'
    await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', minutes, 'clan');
    
    // Отправляем команду мута
    await utils.sleep(500);
    this.bot.chat(`${muteCommand} ${cleanNick} ${reason}`);
    this.addLog(`📤 ОТПРАВЛЕНО: ${muteCommand} ${cleanNick} ${reason}`, 'info');
    
    // Уведомления
    this.bot.chat(`/msg ${nick} &c🔇 Вы получили мут на ${minutes} минут. Причина: ${reason}`);
    this.bot.chat(`/cc &c🔇 &e${nick} &cполучил мут на ${minutes} минут. Причина: ${reason}`);
    
    // Планируем авто-снятие
    if (pendingUnmutes.has(cleanNick)) {
        clearTimeout(pendingUnmutes.get(cleanNick));
    }
    const timeoutId = setTimeout(async () => {
        await this.removeClanMute(nick);
    }, minutes * 60 * 1000);
    pendingUnmutes.set(cleanNick, timeoutId);
    
    this.addLog(`🔇 Клановый мут ${cleanNick} на ${minutes} мин: ${reason}`, 'warn');
}
    
    // ============================================
    // БЛОКИРОВКА КОМАНД В ЛС
    // ============================================
    
    async applyPrivateBlock(nick, minutes, reason) {
    const stats = this.getStats(nick);
    const now = Date.now();
    const blockUntil = now + minutes * 60 * 1000;
    const cleanNick = this.cleanNickname(nick);
    
    stats.privateBlockedUntil = blockUntil;
    stats.privateWarnings = 0;
    stats.privateSameCommandCount = 0;
    
    // Сохраняем в БД с source = 'private'
    await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', minutes, 'private');
    
    // Уведомления
    this.bot.chat(`/cc &c🔇 &e${nick} &cзаблокированы команды на ${minutes} минут. Причина: ${reason}`);
    this.bot.chat(`/msg ${nick} &c🔇 Ваши команды заблокированы на ${minutes} минут. Причина: ${reason}`);
    
    // Планируем авто-снятие
    if (pendingUnmutes.has(cleanNick)) {
        clearTimeout(pendingUnmutes.get(cleanNick));
    }
    const timeoutId = setTimeout(async () => {
        await this.removePrivateBlock(nick);
    }, minutes * 60 * 1000);
    pendingUnmutes.set(cleanNick, timeoutId);
    
    this.addLog(`🔇 Блокировка ЛС ${cleanNick} на ${minutes} мин: ${reason}`, 'warn');
}
    
    // ============================================
    // ПРОВЕРКА КЛАНОВОГО ЧАТА (ЛОЯЛЬНО, БЕЗ КУЛДАУНОВ)
    // ============================================
    
    async checkClanChat(nick, message) {
        if (!this.config.enabled) return { allowed: true };
        
        // Проверка на мут
        if (await this.isMuted(nick)) {
            return { allowed: false, reason: 'Вы в муте', isMuted: true };
        }
        
        const stats = this.getStats(nick);
        const now = Date.now();
        
        // Очистка старых сообщений
        stats.clanMessages = stats.clanMessages.filter(t => now - t < 60000);
        stats.clanMessages.push(now);
        
        const limit = this.config.clanChat.messagesPerMinute;
        let violation = null;
        
        // Проверка на спам
        if (stats.clanMessages.length > limit) {
            violation = { type: 'spam', reason: `Спам сообщениями (${stats.clanMessages.length} за минуту)` };
        }
        // Проверка на капс
        else if (this.checkCaps(message)) {
            violation = { type: 'caps', reason: 'Чрезмерное использование CAPS' };
        }
        // Проверка на повтор
        else if (this.checkRepeatMessage(stats, message)) {
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
            return await this.handleClanViolation(nick, violation, stats);
        }
        
        return { allowed: true };
    }
    
    async handleClanViolation(nick, violation, stats) {
        const now = Date.now();
        const warnThreshold = this.config.clanChat.warnCount;
        
        stats.clanWarnings++;
        stats.lastViolation = now;
        
        // Предупреждение в клановый чат
        const warnMessage = this.config.messages.warning
            .replace('{player}', nick)
            .replace('{reason}', violation.reason)
            .replace('{current}', stats.clanWarnings)
            .replace('{max}', warnThreshold);
        this.bot.chat(`/cc ${warnMessage}`);
        
        this.addLog(`⚠️ [CLAN] ${nick}: ${violation.reason} (${stats.clanWarnings}/${warnThreshold})`, 'debug');
        
        // Мут после 3 предупреждений
        if (stats.clanWarnings >= warnThreshold) {
            await this.applyClanMute(nick, this.config.clanChat.muteMinutes, violation.reason);
            return { allowed: false, reason: 'Мут', isMuted: true };
        }
        
        return { allowed: true, warned: true };
    }
    
    // ============================================
    // ПРОВЕРКА ЛИЧНЫХ СООБЩЕНИЙ (СТРОГО)
    // ============================================
    
    async checkPrivateCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        
        // Проверка на блокировку
        const stats = this.getStats(nick);
        const now = Date.now();
        
        if (stats.privateBlockedUntil > now) {
            return { allowed: false, reason: 'Команды временно заблокированы', shouldIgnore: true };
        }
        
        // Проверка на одинаковые команды
        if (stats.privateLastCommand === command && stats.privateLastCommandTime > 0) {
            const timeSince = now - stats.privateLastCommandTime;
            const cooldown = this.config.privateChat.sameCommandCooldown * 1000;
            
            if (timeSince < cooldown) {
                stats.privateSameCommandCount++;
                const remaining = Math.ceil((cooldown - timeSince) / 1000);
                
                // 2 одинаковые команды → предупреждение
                if (stats.privateSameCommandCount >= this.config.privateChat.maxSameCommandWarnings) {
                    await this.handlePrivateViolation(nick, `Повтор команды "${command}" (2 раза)`, stats);
                    return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
                }
                
                // Предупреждение в клановый чат
                this.bot.chat(`/cc &e⏱️ [Модерация] &c${nick} &7, повтор команды "${command}". Подождите ${remaining} секунд`);
                
                return { 
                    allowed: false, 
                    reason: `Повтор команды. Подождите ${remaining} секунд`,
                    cooldown: remaining,
                    shouldIgnore: false
                };
            } else {
                stats.privateSameCommandCount = 0;
            }
        } else {
            stats.privateSameCommandCount = 0;
        }
        
        stats.privateLastCommand = command;
        stats.privateLastCommandTime = now;
        
        return { allowed: true };
    }
    // src/minecraft/moderation.js
// Добавьте этот метод в класс ModerationSystem

async checkActivePunishments(nick) {
    const cleanNick = this.cleanNickname(nick);
    const now = Date.now();
    
    try {
        // Проверяем активные муты в БД
        const activeMutes = await this.db.all?.(
            `SELECT * FROM punishments 
             WHERE player = ? AND type = 'mute' AND active = 1 
             AND expires_at > CURRENT_TIMESTAMP`,
            [cleanNick]
        );
        
        if (activeMutes && activeMutes.length > 0) {
            for (const mute of activeMutes) {
                const expires = new Date(mute.expires_at).getTime();
                const remaining = expires - now;
                const source = mute.source || 'clan';
                
                if (remaining > 0) {
                    const stats = this.getStats(nick);
                    
                    if (source === 'clan') {
                        if (stats.clanMutedUntil < expires) {
                            stats.clanMutedUntil = expires;
                            this.addLog(`📋 Активный клановый мут для ${nick}, осталось ${Math.floor(remaining / 60000)} мин`, 'info');
                            
                            // Отправляем уведомление игроку
                            this.bot.chat(`/msg ${nick} &c🔇 У вас активен мут ещё ${Math.floor(remaining / 60000)} минут. Причина: ${mute.reason}`);
                        }
                    } else {
                        if (stats.privateBlockedUntil < expires) {
                            stats.privateBlockedUntil = expires;
                            this.addLog(`📋 Активная блокировка ЛС для ${nick}, осталось ${Math.floor(remaining / 60000)} мин`, 'info');
                            
                            this.bot.chat(`/msg ${nick} &c🔇 Ваши команды заблокированы ещё ${Math.floor(remaining / 60000)} минут. Причина: ${mute.reason}`);
                        }
                    }
                    
                    // Убеждаемся, что таймер на снятие установлен
                    if (!pendingUnmutes.has(cleanNick)) {
                        const timeoutId = setTimeout(async () => {
                            if (source === 'clan') {
                                await this.removeClanMute(nick);
                            } else {
                                await this.removePrivateBlock(nick);
                            }
                        }, remaining);
                        pendingUnmutes.set(cleanNick, timeoutId);
                    }
                } else {
                    // Если мут уже истёк, но в БД ещё активен — снимаем
                    await this.db.run?.(
                        `UPDATE punishments SET active = 0, lifted_by = 'system', lifted_at = CURRENT_TIMESTAMP 
                         WHERE id = ?`,
                        [mute.id]
                    );
                    this.addLog(`📋 Снят истёкший мут для ${cleanNick} (source: ${source})`, 'info');
                }
            }
            return true;
        }
    } catch (err) {
        this.addLog(`⚠️ Ошибка проверки активных наказаний: ${err.message}`, 'warn');
    }
    
    return false;
}
    async checkInvalidCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        
        const stats = this.getStats(nick);
        const now = Date.now();
        
        if (stats.privateBlockedUntil > now) {
            return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
        }
        
        // Очистка старых записей
        if (!stats.privateInvalidCommands) stats.privateInvalidCommands = [];
        stats.privateInvalidCommands = stats.privateInvalidCommands.filter(t => now - t < 60000);
        stats.privateInvalidCommands.push(now);
        
        const limit = this.config.privateChat.invalidCommandsPerMinute;
        
        if (stats.privateInvalidCommands.length > limit) {
            await this.handlePrivateViolation(nick, `Спам неверными командами (${stats.privateInvalidCommands.length} за минуту)`, stats);
            return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
        }
        
        return { allowed: true };
    }
    
    async handlePrivateViolation(nick, reason, stats) {
        const now = Date.now();
        
        // Кулдаун между предупреждениями
        if (now - (stats.privateLastWarnTime || 0) < this.config.privateChat.warnCooldown * 1000) {
            return;
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
        
        // Блокировка после 2 предупреждений
        if (stats.privateWarnings >= this.config.privateChat.warnCount) {
            await this.applyPrivateBlock(nick, this.config.privateChat.blockMinutes, reason);
        }
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
    if (this.isRestoring) return;
    this.isRestoring = true;
    
    try {
        // Восстанавливаем все активные муты
        const activeMutes = await this.db.all?.(
            `SELECT * FROM punishments 
             WHERE type = 'mute' AND active = 1 
             AND expires_at > CURRENT_TIMESTAMP`
        );
        
        if (activeMutes && activeMutes.length > 0) {
            this.addLog(`📋 Найдено ${activeMutes.length} активных мутов в БД`, 'info');
            
            for (const mute of activeMutes) {
                const expires = new Date(mute.expires_at).getTime();
                const cleanNick = mute.player;
                const remaining = expires - Date.now();
                const source = mute.source || 'clan';
                
                if (remaining > 0) {
                    // Находим оригинальный ник с цветами
                    let originalNick = cleanNick;
                    for (const [storedNick] of playerStats) {
                        if (this.cleanNickname(storedNick) === cleanNick) {
                            originalNick = storedNick;
                            break;
                        }
                    }
                    
                    const stats = this.getStats(originalNick);
                    
                    // Восстанавливаем в зависимости от источника
                    if (source === 'clan') {
                        stats.clanMutedUntil = expires;
                        this.addLog(`📋 Восстановлен КЛАНОВЫЙ мут для ${cleanNick}, осталось ${Math.floor(remaining / 60000)} мин`, 'info');
                    } else {
                        stats.privateBlockedUntil = expires;
                        this.addLog(`📋 Восстановлена БЛОКИРОВКА ЛС для ${cleanNick}, осталось ${Math.floor(remaining / 60000)} мин`, 'info');
                    }
                    
                    // Планируем снятие
                    if (pendingUnmutes.has(cleanNick)) {
                        clearTimeout(pendingUnmutes.get(cleanNick));
                    }
                    
                    const timeoutId = setTimeout(async () => {
                        if (source === 'clan') {
                            await this.removeClanMute(originalNick);
                        } else {
                            await this.removePrivateBlock(originalNick);
                        }
                    }, remaining);
                    
                    pendingUnmutes.set(cleanNick, timeoutId);
                }
            }
        }
    } catch (err) {
        this.addLog(`⚠️ Ошибка восстановления мутов: ${err.message}`, 'warn');
    }
    
    this.isRestoring = false;
    }
    
    reset() {
        playerStats.clear();
        for (const timeout of pendingUnmutes.values()) clearTimeout(timeout);
        pendingUnmutes.clear();
        this.addLog('🔄 Данные авто-модерации сброшены', 'info');
    }
}

let moderationInstance = null;

async function getModerationSystem(bot, db, addLog) {
    if (!moderationInstance) {
        moderationInstance = new ModerationSystem(bot, db, addLog);
        await moderationInstance.restorePunishments();
    }
    return moderationInstance;
}

module.exports = { getModerationSystem, ModerationSystem };