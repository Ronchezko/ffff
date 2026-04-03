// src/minecraft/moderation.js
// ПРОДВИНУТАЯ система авто-модерации с РАЗДЕЛЬНЫМИ мутами

const utils = require('../shared/utils');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
    enabled: true,
    
    // КЛАНОВЫЙ ЧАТ
    clanChat: {
        messagesPerMinute: 21,
        messagesPer6Seconds: 5,
        warnCount: 3,
        muteMinutes: 10,
        capsPercent: 80,
        minMessageLength: 10,
        repeatSameMessage: 4,
        repeatWindow: 30000,
        maxMentions: 8
    },
    
    // ЛИЧНЫЕ СООБЩЕНИЯ
    privateChat: {
        sameCommandCooldown: 60,
        maxSameCommandWarnings: 2,
        warnCount: 2,
        blockMinutes: 5,
        invalidCommandsPerMinute: 3,
        warnCooldown: 30,
        differentMessages: {
            messages: [
                '❌ Неизвестная команда. Используйте /help для списка команд.',
                '⚠️ Команда не найдена. Проверьте правильность ввода.',
                '🔍 Такой команды нет. Введите /help для помощи.',
                '📖 Команда не распознана. Доступные команды: /help'
            ]
        }
    },
    
    // СООБЩЕНИЯ
    messages: {
        warning: '&e⚠️ [Модерация] &c{player} &7, {reason} &eПредупреждение {current}/{max}',
        cooldown: '&e⏱️ [Модерация] &c{player} &7, {reason} &eПодождите {seconds} секунд',
        mute: '&c🔇 [Модерация] &e{player} &cполучил мут на {minutes} минут. Причина: {reason}',
        unmute: '&a🔊 [Модерация] &e{player} &aразмучен автоматически',
        block: '&c🔇 [Модерация] &e{player} &cзаблокированы команды на {minutes} минут. Причина: {reason}',
        unblock: '&a🔊 [Модерация] &e{player} &aкоманды снова доступны'
    },
    
    profanity: {
        severe: ['сука', 'блядь', 'хуй', 'пизда', 'ебать', 'нахуй', 'залупа'],
        moderate: ['дурак', 'идиот', 'тупой', 'лох', 'дебил', 'кретин'],
        mild: ['блин', 'черт', 'ёлки-палки', 'жопа', 'хрен']
    },
    
    roles: {
        'admin': { level: 6, canBeMuted: false, canPunish: true },
        'glmoder': { level: 5, canBeMuted: false, canPunish: true },
        'stmoder': { level: 4, canBeMuted: true, canPunish: true },
        'moder': { level: 3, canBeMuted: true, canPunish: true },
        'mlmoder': { level: 2, canBeMuted: true, canPunish: true },
        'helper': { level: 1, canBeMuted: true, canPunish: false },
        'member': { level: 0, canBeMuted: true, canPunish: false }
    }
};

const playerStats = new Map();
const pendingUnmutes = new Map();

const MUTE_REASONS = {
    spam: 'Спам сообщениями',
    flood: 'Флуд (много сообщений за короткое время)',
    caps: 'Чрезмерное использование CAPS',
    repeat: 'Повторение однотипных сообщений',
    mention: 'Спам упоминаниями',
    profanity: 'Нецензурная лексика',
    command_spam: 'Повтор команд в личных сообщениях',
    invalid_command: 'Спам неверными командами'
};

class ModerationSystem {
    constructor(bot, db, addLog) {
         this.bot = bot;
    this.db = db;
    this.addLog = addLog;
    this.config = CONFIG;
    this.isRestoring = false;
    this.checkInterval = null;
    this.commandCooldowns = new Map(); // { "ник:команда": время_окончания }
    this.lastCommandTime = new Map(); // { ник: время_последней_команды } для разных команд
    this.lastCooldownMessageTime = new Map(); // { "ник:команда": время_последнего_сообщения }
    this.startMuteChecker();
}
    
    async isImmune(nick) {
        const role = await this.getUserRole(nick);
        return this.config.roles[role]?.canBeMuted === false;
    }
    
    async getUserRole(nick) {
        try {
            const cleanNick = this.cleanNickname(nick);
            const staff = await this.db.getStaffRank?.(cleanNick);
            if (staff && staff.rank_level) {
                if (staff.rank_level >= 6) return 'admin';
                if (staff.rank_level >= 5) return 'glmoder';
                if (staff.rank_level >= 4) return 'stmoder';
                if (staff.rank_level >= 3) return 'moder';
                if (staff.rank_level >= 2) return 'mlmoder';
                if (staff.rank_level >= 1) return 'helper';
            }
            return 'member';
        } catch (err) {
            return 'member';
        }
    }
    
   cleanNickname(nick) {
    if (!nick) return '';
    
    let cleaned = nick;
    
    // Заменяем проблемные символы
    cleaned = cleaned.replace(/ʙ/g, 'в');
    cleaned = cleaned.replace(/ᴇ/g, 'е');
    cleaned = cleaned.replace(/ᴋ/g, 'к');
    cleaned = cleaned.replace(/ʜ/g, 'н');
    cleaned = cleaned.replace(/ᴏ/g, 'о');
    cleaned = cleaned.replace(/ᴘ/g, 'п');
    cleaned = cleaned.replace(/ᴛ/g, 'т');
    cleaned = cleaned.replace(/ʏ/g, 'у');
    cleaned = cleaned.replace(/ᴫ/g, 'л');
    cleaned = cleaned.replace(/ᴍ/g, 'м');
    cleaned = cleaned.replace(/ᴀ/g, 'а');
    cleaned = cleaned.replace(/ᴅ/g, 'д');
    cleaned = cleaned.replace(/ɪ/g, 'и');
    cleaned = cleaned.replace(/ɴ/g, 'н');
    
    // Удаляем цветовые коды
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
    cleaned = cleaned.replace(/[⌜⌟ﾠ𐓏✦🌟🔧🛠🍁⭐]/g, '');
    
    // Удаляем слова-ранги
    cleaned = cleaned.replace(/^(ноʙᴇньᴋий|новенький|участник|модератор|администратор|куратор)\s*/gi, '');
    
    // Оставляем буквы (с ё), цифры, подчёркивание
    cleaned = cleaned.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '');
    
    cleaned = cleaned.trim();
    
    // Если ничего не осталось - берём последнее слово
    if (!cleaned || cleaned.length < 2) {
        const words = nick.split(/[\s:]/);
        for (let i = words.length - 1; i >= 0; i--) {
            let candidate = words[i];
            // Заменяем латиницу на кириллицу
            candidate = candidate.replace(/ʙ/g, 'в').replace(/ᴇ/g, 'е').replace(/ᴋ/g, 'к');
            candidate = candidate.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '');
            if (candidate && candidate.length >= 2) {
                cleaned = candidate;
                break;
            }
        }
    }
    
    //this.addLog(`🧹 Очистка ника: "${nick}" → "${cleaned}"`, 'debug');
    
    return cleaned || nick;
}
    
    getStats(nick) {
        if (!playerStats.has(nick)) {
            playerStats.set(nick, {
                clanMessages: [], clanMessageTimes: [], clanWarnings: 0, clanMutedUntil: 0,
                lastClanMessage: '', lastClanMessageTime: 0, repeatCount: 0,
                privateCommands: [], privateInvalidCommands: [], privateLastCommand: '',
                privateLastCommandTime: 0, privateSameCommandCount: 0, privateWarnings: 0,
                privateLastWarnTime: 0, privateBlockedUntil: 0, privateLastInvalidMessageIndex: -1,
                lastViolation: 0
            });
        }
        return playerStats.get(nick);
    }
    
    // ============================================
    // ГЛОБАЛЬНЫЙ КУЛДАУН НА КОМАНДЫ (30 сек) - 1 сообщение
    // ============================================
    
    async checkCommandCooldown(nick, command) {
    const now = Date.now();
    const key = `${nick.toLowerCase()}:${command.toLowerCase()}`;
    const cooldownEnd = this.commandCooldowns.get(key) || 0;
    
    // 1. Проверка на одну и ту же команду (30 секунд)
    if (cooldownEnd > now) {
        const remaining = Math.ceil((cooldownEnd - now) / 1000);
        
        // Отправляем сообщение ТОЛЬКО 1 раз за кулдаун
        const lastMsgKey = `msg_${key}`;
        const lastMsgTime = this.lastCooldownMessageTime.get(lastMsgKey) || 0;
        if (now - lastMsgTime > 30000) {
            this.bot.chat(`/cc &e⏱️ [Модерация] &c${nick} &7, команда &e/${command} &7доступна через ${remaining} секунд!`);
            this.lastCooldownMessageTime.set(lastMsgKey, now);
        }
        return { allowed: false, remaining, isSameCommand: true };
    }
    
    // 2. Проверка на разные команды (3 секунды)
    const lastAnyCommandTime = this.lastCommandTime.get(nick.toLowerCase()) || 0;
    if (lastAnyCommandTime > 0 && now - lastAnyCommandTime < 3000) {
        // Разные команды - просто блокируем без уведомления
        return { allowed: false, remaining: 3, isSameCommand: false };
    }
    
    // Обновляем время последней команды (для разных команд)
    this.lastCommandTime.set(nick.toLowerCase(), now);
    
    // Устанавливаем кулдаун на конкретную команду (30 секунд)
    this.commandCooldowns.set(key, now + 30000);
    
    return { allowed: true };
}
    
    // ============================================
    // ПРОВЕРКА МУТОВ (РАЗДЕЛЬНЫЕ)
    // ============================================
    
    async isClanMuted(nick) {
        const stats = this.getStats(nick);
        const now = Date.now();
        if (stats.clanMutedUntil > now) return true;
        
        try {
            const mute = await this.db.get?.(
                `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND source = 'clan' AND active = 1 AND expires_at > CURRENT_TIMESTAMP`,
                [this.cleanNickname(nick).toLowerCase()]
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
    
    async isPrivateMuted(nick) {
        const stats = this.getStats(nick);
        const now = Date.now();
        if (stats.privateBlockedUntil > now) return true;
        
        try {
            const mute = await this.db.get?.(
                `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND source = 'private' AND active = 1 AND expires_at > CURRENT_TIMESTAMP`,
                [this.cleanNickname(nick).toLowerCase()]
            );
            if (mute && mute.expires_at) {
                const expires = new Date(mute.expires_at).getTime();
                if (expires > now) {
                    stats.privateBlockedUntil = expires;
                    return true;
                }
            }
        } catch (err) {}
        return false;
    }
    
    // ============================================
    // ВЫДАЧА КЛАНОВОГО МУТА
    // ============================================
    
    async applyClanMute(nick, minutes, reasonType) {
    const stats = this.getStats(nick);
    const now = Date.now();
    const muteUntil = now + minutes * 60 * 1000;
    const cleanNick = this.cleanNickname(nick).toLowerCase();
    const reason = MUTE_REASONS[reasonType] || reasonType;
    
    if (!cleanNick || cleanNick.length < 2 || await this.isImmune(nick)) return;
    
    stats.clanMutedUntil = muteUntil;
    stats.clanWarnings = 0;
    
    // ВАЖНО: передаём minutes, чтобы expires_at установился правильно
    await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', minutes, 'clan');
    
    await utils.sleep(500);
    this.bot.chat(`${process.env.MC_MUTE_COMMAND || '/c mute'} ${cleanNick} ${reason} (${minutes} минут)`);
    
    // Уведомление в ЛС (только один раз)
    this.bot.chat(`/msg ${nick} &c🔇 Вы получили клановый мут на ${minutes} минут. Причина: ${reason}`);
    
    // Уведомление в клановый чат
    this.bot.chat(`/cc &c🔇 [Модерация] &e${nick} &cполучил мут на ${minutes} минут. Причина: ${reason}`);
    
    if (pendingUnmutes.has(`clan_${cleanNick}`)) clearTimeout(pendingUnmutes.get(`clan_${cleanNick}`));
    const timeoutId = setTimeout(() => this.removeClanMute(nick), minutes * 60 * 1000);
    pendingUnmutes.set(`clan_${cleanNick}`, timeoutId);
    
    this.addLog(`🔇 Клановый мут ${cleanNick} на ${minutes} мин: ${reason}`, 'warn');
}
    
    async removeClanMute(nick) {
        const stats = this.getStats(nick);
        const cleanNick = this.cleanNickname(nick).toLowerCase();
        
        if (pendingUnmutes.has(`clan_${cleanNick}`)) {
            clearTimeout(pendingUnmutes.get(`clan_${cleanNick}`));
            pendingUnmutes.delete(`clan_${cleanNick}`);
        }
        
        if (stats.clanMutedUntil > 0) {
            stats.clanMutedUntil = 0;
            stats.clanWarnings = 0;
            
            await this.db.run?.(
                `UPDATE punishments SET active = 0, lifted_by = 'system', lifted_at = CURRENT_TIMESTAMP 
                 WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND source = 'clan' AND active = 1`,
                [cleanNick]
            );
            
            await utils.sleep(3000);
            this.bot.chat(`${process.env.MC_UNMUTE_COMMAND || '/c unmute'} ${cleanNick}`);
            this.bot.chat(`/msg ${nick} &a✅ Ваш клановый мут снят.`);
            this.bot.chat(`/cc &a🔊 &e${nick} &aразмучен автоматически.`);
            this.addLog(`🔊 Снят клановый мут ${cleanNick}`, 'info');
        }
    }
    
    // ============================================
    // БЛОКИРОВКА ЛС
    // ============================================
    
    async applyPrivateBlock(nick, minutes, reasonType) {
        const stats = this.getStats(nick);
        const now = Date.now();
        const blockUntil = now + minutes * 60 * 1000;
        const cleanNick = this.cleanNickname(nick).toLowerCase();
        const reason = MUTE_REASONS[reasonType] || reasonType;
        
        stats.privateBlockedUntil = blockUntil;
        stats.privateWarnings = 0;
        stats.privateSameCommandCount = 0;
        
        await this.db.addPunishment?.(cleanNick, 'mute', reason, 'system', minutes, 'private');
        
        this.bot.chat(`/cc ${this.config.messages.block.replace('{player}', nick).replace('{minutes}', minutes).replace('{reason}', reason)}`);
        this.bot.chat(`/msg ${nick} &c🔇 Ваши команды заблокированы на ${minutes} минут. Причина: ${reason}`);
        
        if (pendingUnmutes.has(`private_${cleanNick}`)) clearTimeout(pendingUnmutes.get(`private_${cleanNick}`));
        const timeoutId = setTimeout(() => this.removePrivateBlock(nick), minutes * 60 * 1000);
        pendingUnmutes.set(`private_${cleanNick}`, timeoutId);
        
        this.addLog(`🔇 Блокировка ЛС ${cleanNick} на ${minutes} мин: ${reason}`, 'warn');
    }
    
    async removePrivateBlock(nick) {
        const stats = this.getStats(nick);
        const cleanNick = this.cleanNickname(nick).toLowerCase();
        
        if (pendingUnmutes.has(`private_${cleanNick}`)) {
            clearTimeout(pendingUnmutes.get(`private_${cleanNick}`));
            pendingUnmutes.delete(`private_${cleanNick}`);
        }
        
        if (stats.privateBlockedUntil > 0) {
            stats.privateBlockedUntil = 0;
            stats.privateWarnings = 0;
            stats.privateSameCommandCount = 0;
            
            await this.db.run?.(
                `UPDATE punishments SET active = 0, lifted_by = 'system', lifted_at = CURRENT_TIMESTAMP 
                 WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND source = 'private' AND active = 1`,
                [cleanNick]
            );
            
            this.bot.chat(`/msg ${nick} &a✅ Ваши команды снова доступны!`);
            this.bot.chat(`/cc ${this.config.messages.unblock.replace('{player}', nick)}`);
            this.addLog(`🔊 Снята блокировка ЛС ${cleanNick}`, 'info');
        }
    }
    
    // ============================================
    // ПРОВЕРКА КЛАНОВОГО ЧАТА (БЕЗ КУЛДАУНА)
    // ============================================
    
    async checkClanChat(nick, message) {
        if (!this.config.enabled) return { allowed: true };
        
        // Проверяем ТОЛЬКО клановый мут
        if (await this.isClanMuted(nick)) {
            return { allowed: false, reason: 'Вы в клановом муте', isMuted: true };
        }
        
        const stats = this.getStats(nick);
        const now = Date.now();
        
        // Очистка старых сообщений
        stats.clanMessages = stats.clanMessages.filter(t => now - t < 60000);
        stats.clanMessageTimes = stats.clanMessageTimes.filter(t => now - t < 6000);
        stats.clanMessages.push(now);
        stats.clanMessageTimes.push(now);
        
        let violation = null;
        
        if (stats.clanMessages.length > this.config.clanChat.messagesPerMinute) {
            violation = { type: 'spam', reason: MUTE_REASONS.spam };
        }
        else if (stats.clanMessageTimes.length > this.config.clanChat.messagesPer6Seconds) {
            violation = { type: 'flood', reason: MUTE_REASONS.flood };
        }
        else if (this.checkCaps(message)) {
            violation = { type: 'caps', reason: MUTE_REASONS.caps };
        }
        else if (this.checkRepeatMessage(stats, message)) {
            violation = { type: 'repeat', reason: MUTE_REASONS.repeat };
        }
        
        const mentionCount = (message.match(/@\w+/g) || []).length;
        if (mentionCount > this.config.clanChat.maxMentions && !violation) {
            violation = { type: 'mention', reason: MUTE_REASONS.mention };
        }
        
        const profanityCheck = this.checkProfanity(message);
        if (profanityCheck.detected && !violation) {
            violation = { type: 'profanity', reason: MUTE_REASONS.profanity };
        }
        
        if (violation) {
            return await this.handleClanViolation(nick, violation, stats);
        }
        
        return { allowed: true };
    }
    
    async handleClanViolation(nick, violation, stats) {
    const warnThreshold = this.config.clanChat.warnCount;
    stats.clanWarnings++;
    
    // Предупреждение ТОЛЬКО в клановый чат (не в ЛС)
    this.bot.chat(`/cc &e⚠️ [Модерация] &c${nick} &7, ${violation.reason} &eПредупреждение ${stats.clanWarnings}/${warnThreshold}`);
    
    this.addLog(`⚠️ [CLAN] ${nick}: ${violation.reason} (${stats.clanWarnings}/${warnThreshold})`, 'debug');
    
    if (stats.clanWarnings >= warnThreshold) {
        await this.applyClanMute(nick, this.config.clanChat.muteMinutes, violation.type);
        return { allowed: false, reason: 'Клановый мут', isMuted: true };
    }
    
    return { allowed: true, warned: true };
}
    
    // ============================================
    // ПРОВЕРКА ЛС КОМАНД
    // ============================================
    
    async checkPrivateCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        
        // Проверяем ТОЛЬКО блокировку ЛС
        if (await this.isPrivateMuted(nick)) {
            return { allowed: false, reason: 'Ваши команды заблокированы', shouldIgnore: true };
        }
        if (await this.isImmune(nick)) return { allowed: true };
        
        const stats = this.getStats(nick);
        const now = Date.now();
        if (stats.privateBlockedUntil > now) {
            return { allowed: false, reason: 'Команды временно заблокированы', shouldIgnore: true };
        }
        
        if (stats.privateLastCommand === command && stats.privateLastCommandTime > 0) {
            const timeSince = now - stats.privateLastCommandTime;
            const cooldown = this.config.privateChat.sameCommandCooldown * 1000;
            if (timeSince < cooldown) {
                stats.privateSameCommandCount++;
                const remaining = Math.ceil((cooldown - timeSince) / 1000);
                if (stats.privateSameCommandCount >= this.config.privateChat.maxSameCommandWarnings) {
                    await this.handlePrivateViolation(nick, `Повтор команды "${command}" (2 раза)`, stats);
                    return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
                }
                this.bot.chat(`/cc ${this.config.messages.cooldown.replace('{player}', nick).replace('{reason}', `повтор команды "${command}"`).replace('{seconds}', remaining)}`);
                return { allowed: false, reason: `Повтор команды. Подождите ${remaining} секунд`, cooldown: remaining, shouldIgnore: false };
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
    
    async checkInvalidCommand(nick, command) {
        if (!this.config.enabled) return { allowed: true };
        
        if (await this.isPrivateMuted(nick)) {
            return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
        }
        if (await this.isImmune(nick)) return { allowed: true };
        
        const stats = this.getStats(nick);
        const now = Date.now();
        if (stats.privateBlockedUntil > now) {
            return { allowed: false, reason: 'Команды временно заблокированы', shouldIgnore: true };
        }
        
        stats.privateInvalidCommands = stats.privateInvalidCommands.filter(t => now - t < 60000);
        stats.privateInvalidCommands.push(now);
        
        if (stats.privateInvalidCommands.length > this.config.privateChat.invalidCommandsPerMinute) {
            await this.handlePrivateViolation(nick, `Спам неверными командами (${stats.privateInvalidCommands.length} за минуту)`, stats);
            return { allowed: false, reason: 'Команды заблокированы', shouldIgnore: true };
        }
        
        const messages = this.config.privateChat.differentMessages.messages;
        stats.privateLastInvalidMessageIndex = (stats.privateLastInvalidMessageIndex + 1) % messages.length;
        this.bot.chat(`/msg ${nick} &c${messages[stats.privateLastInvalidMessageIndex]}`);
        return { allowed: false, reason: 'Неизвестная команда', shouldIgnore: false };
    }
    
    async handlePrivateViolation(nick, reason, stats) {
        const now = Date.now();
        if (now - stats.privateLastWarnTime < this.config.privateChat.warnCooldown * 1000) return { blocked: false, warned: false };
        
        stats.privateLastWarnTime = now;
        stats.privateWarnings++;
        
        const warnMessage = this.config.messages.warning
            .replace('{player}', nick)
            .replace('{reason}', reason)
            .replace('{current}', stats.privateWarnings)
            .replace('{max}', this.config.privateChat.warnCount);
        this.bot.chat(`/cc ${warnMessage}`);
        
        this.addLog(`⚠️ [PRIVATE] ${nick}: ${reason} (${stats.privateWarnings}/${this.config.privateChat.warnCount})`, 'debug');
        
        if (stats.privateWarnings >= this.config.privateChat.warnCount) {
            await this.applyPrivateBlock(nick, this.config.privateChat.blockMinutes, 'command_spam');
            return { blocked: true };
        }
        return { blocked: false, warned: true };
    }
    async checkAllPlayersPunishments() {
    try {
        const members = await this.db.getAllClanMembers?.();
        if (!members || members.length === 0) return;
        this.addLog(`🔍 Проверка активных наказаний для ${members.length} игроков...`, 'info');
        for (const member of members) {
            await this.checkActivePunishments(member.minecraft_nick);
        }
    } catch (err) {
        this.addLog(`⚠️ Ошибка массовой проверки: ${err.message}`, 'warn');
    }
}

async checkActivePunishments(nick) {
    const cleanNick = this.cleanNickname(nick).toLowerCase();
    
    try {
        const activeMutes = await this.db.all?.(
            `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND active = 1 AND expires_at > CURRENT_TIMESTAMP`,
            [cleanNick]
        );
        
        if (activeMutes && activeMutes.length > 0) {
            for (const mute of activeMutes) {
                const expires = new Date(mute.expires_at).getTime();
                const now = Date.now();
                const source = mute.source || 'clan';
                
                if (expires > now) {
                    const stats = this.getStats(nick);
                    if (source === 'clan' && stats.clanMutedUntil < expires) {
                        stats.clanMutedUntil = expires;
                        this.bot.chat(`/msg ${nick} &c🔇 У вас активен клановый мут ещё ${Math.floor((expires - now) / 60000)} мин. Причина: ${mute.reason}`);
                    } else if (source === 'private' && stats.privateBlockedUntil < expires) {
                        stats.privateBlockedUntil = expires;
                        this.bot.chat(`/msg ${nick} &c🔇 Ваши команды заблокированы ещё ${Math.floor((expires - now) / 60000)} мин. Причина: ${mute.reason}`);
                    }
                    
                    if (!pendingUnmutes.has(`${source}_${cleanNick}`)) {
                        const timeoutId = setTimeout(() => {
                            if (source === 'clan') this.removeClanMute(nick);
                            else this.removePrivateBlock(nick);
                        }, expires - now);
                        pendingUnmutes.set(`${source}_${cleanNick}`, timeoutId);
                    }
                }
            }
        }
    } catch (err) {
        this.addLog(`⚠️ Ошибка проверки наказаний для ${nick}: ${err.message}`, 'debug');
    }
}
async checkAllExpiredMutes() {
    const now = Date.now();
    let clanUnmuted = 0;
    let privateUnmuted = 0;
    
    for (const [nick, stats] of playerStats) {
        if (stats.clanMutedUntil > 0 && stats.clanMutedUntil <= now) {
            stats.clanMutedUntil = 0;
            await this.removeClanMute(nick);
            clanUnmuted++;
        }
        if (stats.privateBlockedUntil > 0 && stats.privateBlockedUntil <= now) {
            stats.privateBlockedUntil = 0;
            await this.removePrivateBlock(nick);
            privateUnmuted++;
        }
    }
    
    // Также проверяем БД на случай, если игрок не в stats
    try {
        const expiredMutes = await this.db.all?.(
            `SELECT * FROM punishments WHERE type = 'mute' AND active = 1 AND expires_at <= CURRENT_TIMESTAMP`
        );
        if (expiredMutes && expiredMutes.length > 0) {
            for (const mute of expiredMutes) {
                await this.removeMuteFromDB(mute.player);
                clanUnmuted++;
            }
        }
    } catch (err) {}
    
    if (clanUnmuted > 0) this.addLog(`🔊 Снято ${clanUnmuted} истекших мутов`, 'info');
    if (privateUnmuted > 0) this.addLog(`🔊 Снято ${privateUnmuted} блокировок ЛС`, 'info');
}
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    checkCaps(message) {
        const letters = message.replace(/[^a-zA-Zа-яА-Я]/g, '');
        if (letters.length < this.config.clanChat.minMessageLength) return false;
        const capsCount = (message.match(/[A-ZА-Я]/g) || []).length;
        return (capsCount / letters.length) * 100 > this.config.clanChat.capsPercent;
    }
    
    checkRepeatMessage(stats, message) {
        const now = Date.now();
        if (stats.lastClanMessage === message && now - stats.lastClanMessageTime < this.config.clanChat.repeatWindow) {
            stats.repeatCount = (stats.repeatCount || 0) + 1;
            if (stats.repeatCount >= this.config.clanChat.repeatSameMessage) {
                stats.repeatCount = 0;
                return true;
            }
        } else {
            stats.repeatCount = 1;
            stats.lastClanMessage = message;
            stats.lastClanMessageTime = now;
        }
        return false;
    }
    
    checkProfanity(message) {
        const lowerMsg = message.toLowerCase();
        for (const word of this.config.profanity.severe) {
            if (lowerMsg.includes(word)) return { detected: true, message: MUTE_REASONS.profanity };
        }
        for (const word of this.config.profanity.moderate) {
            if (lowerMsg.includes(word)) return { detected: true, message: MUTE_REASONS.profanity };
        }
        for (const word of this.config.profanity.mild) {
            if (lowerMsg.includes(word)) return { detected: true, message: MUTE_REASONS.profanity };
        }
        return { detected: false };
    }
    
    // ============================================
    // ПЕРИОДИЧЕСКАЯ ПРОВЕРКА
    // ============================================
    
    startMuteChecker() {
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(async () => {
            const now = Date.now();
            for (const [nick, stats] of playerStats) {
                if (stats.clanMutedUntil > 0 && stats.clanMutedUntil <= now) {
                    stats.clanMutedUntil = 0;
                    await this.removeClanMute(nick);
                }
                if (stats.privateBlockedUntil > 0 && stats.privateBlockedUntil <= now) {
                    stats.privateBlockedUntil = 0;
                    await this.removePrivateBlock(nick);
                }
            }
        }, 30000);
    }
    
    async restorePunishments() {
        if (this.isRestoring) return;
        this.isRestoring = true;
        
        try {
            const activeMutes = await this.db.all?.(
                `SELECT * FROM punishments WHERE type = 'mute' AND active = 1 AND expires_at > CURRENT_TIMESTAMP`
            );
            
            if (activeMutes && activeMutes.length > 0) {
                for (const mute of activeMutes) {
                    const expires = new Date(mute.expires_at).getTime();
                    const remaining = expires - Date.now();
                    if (remaining <= 0) continue;
                    
                    const cleanNick = mute.player;
                    const source = mute.source || 'clan';
                    
                    let originalNick = cleanNick;
                    for (const [storedNick] of playerStats) {
                        if (this.cleanNickname(storedNick).toLowerCase() === cleanNick) {
                            originalNick = storedNick;
                            break;
                        }
                    }
                    
                    const stats = this.getStats(originalNick);
                    if (source === 'clan') stats.clanMutedUntil = expires;
                    else stats.privateBlockedUntil = expires;
                    
                    const timeoutId = setTimeout(() => {
                        if (source === 'clan') this.removeClanMute(originalNick);
                        else this.removePrivateBlock(originalNick);
                    }, remaining);
                    pendingUnmutes.set(`${source}_${cleanNick}`, timeoutId);
                    
                    this.addLog(`📋 Восстановлен ${source} мут для ${cleanNick}, осталось ${Math.floor(remaining / 60000)} мин`, 'info');
                }
            }
        } catch (err) {
            this.addLog(`⚠️ Ошибка восстановления мутов: ${err.message}`, 'warn');
        }
        this.isRestoring = false;
    }
    
    reset() {
        playerStats.clear();
        this.lastCommandTime.clear();
        this.lastCooldownMessageTime.clear();
        for (const timeout of pendingUnmutes.values()) clearTimeout(timeout);
        pendingUnmutes.clear();
        this.addLog('🔄 Данные авто-модерации сброшены', 'info');
    }
    
    stop() {
        if (this.checkInterval) clearInterval(this.checkInterval);
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