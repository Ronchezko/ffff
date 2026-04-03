// src/minecraft/chatHandler.js
// Обработка сообщений чата, кланового чата, личных сообщений

const utils = require('../shared/utils');

const PATTERNS = {
    clanChat: /^КЛАН:\s*(?:[&§][0-9a-fklmnor])*([^:]+):\s*(.+)$/i,
    clanChatWithRank: /^КЛАН:\s*[&§][0-9a-fklmnor]*[^\s]+\s+([^:]+):\s*(.+)$/i,
    privateMessage: /^\[\*\]\s*\[(?:~~)?([^\s\]]+)(?:\s*->\s*я)\]\s*(.+)$/i,
    realnameResult: /^\[\*\]\s*~~(\S+)\s+является\s+(\S+)$/i,
    joinRequest: /^\[\*\]\s*Игрок\s+(\S+)\s+подал заявку на вступление в ваш клан\.$/i,
    joinClan: /^\[\*\]\s*(\S+)\s+присоединился к клану\.$/i,
    leaveClan: /^\[\*\]\s*(\S+)\s+покинул клан\.$/i,
    kill: /^(\S+)\s+убил\s+(\S+)$/i,
    lobbyMove: /Ты перемещен в лобби/i,
    banMessage: /забанен/i
};

class ChatHandler {
    constructor(bot, db, parentBot) {
        this.bot = bot;
        this.db = db;
        this.parentBot = parentBot;
        this.moderation = null;
        this.realnameCache = new Map();
    }
    
    async handleMessage(jsonMessage) {
        const rawMessage = jsonMessage.toString();
        const message = rawMessage.replace(/[&§][0-9a-fklmnor]/g, '');
        
        if (PATTERNS.lobbyMove.test(message)) {
            await this.handleLobbyMove();
            return;
        }
        
        const realnameMatch = message.match(PATTERNS.realnameResult);
        if (realnameMatch) {
            this.handleRealnameResult(realnameMatch[1], realnameMatch[2]);
            return;
        }
        
        const clanMatch = message.match(PATTERNS.clanChat) || message.match(PATTERNS.clanChatWithRank);
        if (clanMatch) {
            const nickname = clanMatch[1].trim();
            const chatMessage = clanMatch[2].trim();
            await this.handleClanChat(nickname, chatMessage);
            return;
        }
        
        const pmMatch = message.match(PATTERNS.privateMessage);
        if (pmMatch) {
            let nickname = pmMatch[1].trim();
            const pmMessage = pmMatch[2].trim();
            
            if (nickname.startsWith('~~')) {
                nickname = await this.getRealname(nickname.slice(2));
            }
            await this.handlePrivateMessage(nickname, pmMessage);
            return;
        }
        
        const joinRequestMatch = message.match(PATTERNS.joinRequest);
        if (joinRequestMatch) {
            await this.handleJoinRequest(joinRequestMatch[1]);
            return;
        }
        
        const joinClanMatch = message.match(PATTERNS.joinClan);
        if (joinClanMatch && !joinClanMatch[1].includes(this.bot.username)) {
            await this.handleJoinClan(joinClanMatch[1]);
            return;
        }
        
        const leaveClanMatch = message.match(PATTERNS.leaveClan);
        if (leaveClanMatch && !leaveClanMatch[1].includes(this.bot.username)) {
            await this.handleLeaveClan(leaveClanMatch[1]);
            return;
        }
        
        const killMatch = message.match(PATTERNS.kill);
        if (killMatch) {
            await this.handleKill(killMatch[1], killMatch[2]);
        }
    }
    
    // ============================================
    // ОБРАБОТКА КЛАНОВОГО ЧАТА
    // ============================================
    
    async handleClanChat(nickname, message) {
    if (nickname === this.bot.username) return;
    
    if (!this.moderation) {
        const { getModerationSystem } = require('./moderation');
        this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot.addLog);
    }
    
    // Проверяем ТОЛЬКО клановый мут (не блокировку ЛС)
    const isClanMuted = await this.moderation.isClanMuted(nickname);
    if (isClanMuted) {
        this.parentBot.addLog(`🚫 Сообщение от ${nickname} отклонено (клановый мут)`, 'debug');
        return;
    }
    
    const result = await this.moderation.checkClanChat(nickname, message);
    
    if (!result.allowed && result.reason) {
        this.parentBot.addLog(`🚫 Сообщение от ${nickname} отклонено: ${result.reason}`, 'debug');
    }
    
    if (this.db.logClanChat) {
        await this.db.logClanChat(nickname, message);
    }
}
    
    // ============================================
    // ОБРАБОТКА ЛИЧНЫХ СООБЩЕНИЙ
    // ============================================
    
    // src/minecraft/chatHandler.js — исправленный метод handlePrivateMessage

// В handlePrivateMessage, после проверки на блокировку ЛС, добавьте проверку кулдауна:

async handlePrivateMessage(nickname, message) {
    if (!this.moderation) {
        const { getModerationSystem } = require('./moderation');
        this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot.addLog);
    }
    
    // Проверяем блокировку ЛС
    if (await this.moderation.isPrivateMuted(nickname)) {
        this.parentBot.addLog(`🚫 Игнорирование ЛС от ${nickname} (блокировка ЛС)`, 'debug');
        return;
    }
    
    // Проверка на регистрацию RP
    const codeMatch = message.match(/^([A-Z0-9]{6})$/i);
    if (codeMatch) {
        await this.handleRPVerification(nickname, codeMatch[1].toUpperCase());
        return;
    }
    
    // Обработка команд
    if (message.startsWith('/')) {
        const parts = message.slice(1).split(' ');
        const command = parts[0];
        const args = parts.slice(1);
        
        // Проверка кулдауна
        const cooldownResult = await this.moderation.checkCommandCooldown(nickname, command);
        if (!cooldownResult.allowed) {
            // Если это повтор той же команды - сообщение уже отправлено в клановый чат
            // Если это разные команды - просто игнорируем без уведомления
            return;
        }
        
        // Остальная обработка команды...
        const cmdResult = await this.moderation.checkPrivateCommand(nickname, command);
        if (!cmdResult.allowed) {
            if (cmdResult.cooldown) {
                // Уже отправлено
            }
            return;
        }
        
        const commands = require('./commands');
        const isValidCommand = commands.commandMap?.has(command.toLowerCase());
        
        if (!isValidCommand) {
            const invalidResult = await this.moderation.checkInvalidCommand(nickname, command);
            if (!invalidResult.allowed && invalidResult.reason) {
                return;
            }
            this.bot.chat(`/msg ${nickname} &cНеизвестная команда. Используйте /help`);
            return;
        }
        
        await this.parentBot.executeCommand(nickname, command, args);
    }
}
    
    // ============================================
    // ОБРАБОТКА RP РЕГИСТРАЦИИ
    // ============================================
    
    async handleRPVerification(nickname, code) {
    if (global.pendingRegistrations && global.pendingRegistrations.has(nickname)) {
        const pending = global.pendingRegistrations.get(nickname);
        if (Date.now() > pending.expires) {
            global.pendingRegistrations.delete(nickname);
            this.bot.chat(`/msg ${nickname} &c⏰ Время действия кода истекло. Используйте /rp снова.`);
            return;
        }
        
        if (pending.code === code) {
            await this.db.registerRP(nickname);
            global.pendingRegistrations.delete(nickname);
            
            this.bot.chat(`/msg ${nickname} &a✅ Поздравляем! Вы успешно зарегистрированы в RolePlay!`);
            this.bot.chat(`/cc &a🎭 &e${nickname} &aтеперь гражданин города Resistance!`);
            this.parentBot.addLog(`🎭 ${nickname} зарегистрирован в RP`, 'success');
        } else {
            this.bot.chat(`/msg ${nickname} &c❌ Неверный код! Попробуйте снова через /rp`);
        }
    }
}
    
    // ============================================
    // ОБРАБОТКА ЗАЯВОК И ВСТУПЛЕНИЙ
    // ============================================
    
    async handleJoinRequest(nickname) {
        const isBlacklisted = await this.db.isBlacklisted?.(nickname) || false;
        if (isBlacklisted) {
            this.parentBot.addLog(`🚫 Отклонена заявка от ${nickname} (чёрный список)`, 'warn');
            return;
        }
        
        this.bot.chat(`/c accept ${nickname}`);
        this.parentBot.addLog(`✅ Принята заявка от ${nickname}`, 'success');
    }
    
    async handleJoinClan(nickname) {
        if (this.db.addClanMember) {
            await this.db.addClanMember(nickname, 'system');
        }
        this.parentBot.addLog(`➕ ${nickname} вступил в клан`, 'success');
        this.bot.chat(`/cc &6&l🏙️ Добро пожаловать в город Resistance, &e${nickname}&6!`);
    }
    
    async handleLeaveClan(nickname) {
        if (this.db.removeClanMember) {
            await this.db.removeClanMember(nickname);
        }
        this.bot.chat(`/msg ${nickname} &cВы покинули клан. Ваш RolePlay профиль был сброшен.`);
        this.parentBot.addLog(`➖ ${nickname} покинул клан`, 'info');
    }
    
    // ============================================
    // ОБРАБОТКА УБИЙСТВ
    // ============================================
    
    async handleKill(killer, victim) {
        if (this.db.addKill) {
            const result = await this.db.addKill(killer, victim);
            if (result.killerInClan) {
                this.bot.chat(`/cc &c⚔️ &e${killer} &7убил &e${victim} &7(+1 убийство)`);
            }
            if (result.victimInClan) {
                this.bot.chat(`/cc &c💀 &e${victim} &7был убит &e${killer} &7(+1 смерть)`);
            }
        }
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    async getRealname(fakeNick) {
        if (this.realnameCache.has(fakeNick)) {
            const cached = this.realnameCache.get(fakeNick);
            if (Date.now() - cached.time < 60000) {
                return cached.realname;
            }
        }
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(fakeNick), 3000);
            
            const handler = (message) => {
                const match = message.toString().match(PATTERNS.realnameResult);
                if (match && match[1] === fakeNick) {
                    clearTimeout(timeout);
                    this.bot.removeListener('message', handler);
                    this.realnameCache.set(fakeNick, { realname: match[2], time: Date.now() });
                    resolve(match[2]);
                }
            };
            
            this.bot.once('message', handler);
            this.bot.chat(`/realname ${fakeNick}`);
        });
    }
    
    handleRealnameResult(fakeNick, realNick) {
        this.realnameCache.set(fakeNick, { realname: realNick, time: Date.now() });
    }
    
    async handleLobbyMove() {
        this.parentBot.addLog('🎮 Бот перемещён в лобби, отправка /s3...', 'info');
        await utils.sleep(3000);
        this.bot.chat(this.parentBot.config.loginCommand);
    }
    
    async handleVerification(nickname, code) {
        if (this.db.verifyCode) {
            const result = await this.db.verifyCode(code, nickname);
            if (result.success) {
                this.bot.chat(`/msg ${nickname} &a✅ Вы успешно верифицированы!`);
            } else {
                this.bot.chat(`/msg ${nickname} &c❌ Неверный код верификации.`);
            }
        }
    }
    
    async giveWarning(nickname) {
        if (!this.db.get) return 1;
        
        const warnings = await this.db.get('SELECT COUNT(*) as count FROM player_warnings WHERE player_nick = ? AND is_active = 1', [nickname]);
        const newCount = (warnings?.count || 0) + 1;
        
        if (this.db.run) {
            await this.db.run(
                `INSERT INTO player_warnings (player_nick, reason, issued_by, expires_at)
                 VALUES (?, ?, ?, datetime("now", "+1 hour"))`,
                [nickname, 'Авто-модерация: спам', 'system']
            );
        }
        
        return newCount;
    }
}

// Вспомогательная функция для отправки сообщений с задержкой
async function sendDelayedMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

// Фабричная функция
async function handleMessage(bot, message, db, parentBot) {
    const handler = new ChatHandler(bot, db, parentBot);
    await handler.handleMessage(message);
}

module.exports = { handleMessage, ChatHandler };