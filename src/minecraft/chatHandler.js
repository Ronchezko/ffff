// src/minecraft/chatHandler.js
// Чистая версия с поддержкой всех функций

const utils = require('../shared/utils');

const joinLeaveTracker = new Map();

const PATTERNS = {
    clanChat: /^КЛАН:\s*(?:[&§][0-9a-fklmnor])*((?:~~)?[^\s:]+):\s*(.+)$/i,
    clanChatWithRank: /^КЛАН:\s*[&§][0-9a-fklmnor]*[^\s]+\s+((?:~~)?[^\s:]+):\s*(.+)$/i,
    privateMessage: /^\[\*\]\s*\[((?:~~)?[^\s\]]+)\s*->\s*я\]\s*(.+)$/i,
    realnameResult: /^\[\*\]\s*~~(\S+)\s+является\s+(\S+)$/i,
    joinRequest: /^\[\*\]\s*Игрок\s+(\S+)\s+подал заявку на вступление в ваш клан\.$/i,
    joinClan: /^\[\*\]\s*(\S+)\s+присоединился к клану\.$/i,
    leaveClan: /^\[\*\]\s*(\S+)\s+покинул клан\.$/i,
    kill: /^(\S+)\s+убил\s+игрока\s+(\S+)'$/i,
    lobbyMove: /Ты перемещен в лобби/i
};
const rpCommands = ['/balance', '/pay', '/pass', '/id', '/org', '/arp', '/rp', '/im', '/biz', '/office'];

global.realnameCache = global.realnameCache || new Map();

function safeLog(parentBot, message, level = 'info') {
    if (parentBot && typeof parentBot.addLog === 'function') {
        parentBot.addLog(message, level);
    }
}

class ChatHandler {
    constructor(bot, db, parentBot) {
        this.bot = bot;
        this.db = db;
        this.parentBot = parentBot;
        this.moderation = null;
    }
    
    async handleMessage(jsonMessage) {
        const rawMessage = jsonMessage?.toString?.() || String(jsonMessage);
        const message = rawMessage.replace(/[&§][0-9a-fklmnor]/g, '');
        
        // 1. Обработка ответа /realname
        const realnameMatch = message.match(PATTERNS.realnameResult);
        if (realnameMatch) {
            const fakeNick = realnameMatch[1];
            const realNick = realnameMatch[2];
            global.realnameCache.set(fakeNick, { realname: realNick, timestamp: Date.now() });
            for (const [key, value] of global.realnameCache) {
                if (Date.now() - value.timestamp > 600000) global.realnameCache.delete(key);
            }
            return;
        }
        
        // 2. Личные сообщения
        const pmMatch = message.match(PATTERNS.privateMessage);
        if (pmMatch) {
            let sender = pmMatch[1].trim();
            const pmMessage = pmMatch[2].trim();
            if (sender === this.bot.username) return;
            
            if (sender.startsWith('~~')) {
                const fakeNick = sender.slice(2);
                const cached = global.realnameCache.get(fakeNick);
                if (cached && Date.now() - cached.timestamp < 600000) {
                    await this.processMessage(cached.realname, pmMessage, sender);
                } else {
                    const realNick = await this.requestRealname(fakeNick);
                    await this.processMessage(realNick, pmMessage, sender);
                }
            } else {
                await this.processMessage(sender, pmMessage, sender);
            }
            return;
        }
        
        // 3. Клановый чат
        const clanMatch = message.match(PATTERNS.clanChat) || message.match(PATTERNS.clanChatWithRank);
        if (clanMatch) {
            let nickname = clanMatch[1].trim();
            const chatMessage = clanMatch[2].trim();
            if (nickname.startsWith('~~')) {
                const cached = global.realnameCache.get(nickname.slice(2));
                if (cached) nickname = cached.realname;
            }
            await this.handleClanChat(nickname, chatMessage);
            return;
        }
        
        // 4. Заявки, вступление, выход, убийства
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
    
    requestRealname(fakeNick) {
        return new Promise((resolve) => {
            let resolved = false;
            const messageHandler = (jsonMessage) => {
                const msg = jsonMessage.toString?.() || String(jsonMessage);
                const match = msg.match(PATTERNS.realnameResult);
                if (match && match[1] === fakeNick) {
                    global.realnameCache.set(fakeNick, { realname: match[2], timestamp: Date.now() });
                    resolved = true;
                    this.bot.removeListener('message', messageHandler);
                    clearTimeout(timeout);
                    resolve(match[2]);
                }
            };
            const timeout = setTimeout(() => {
                if (!resolved) {
                    this.bot.removeListener('message', messageHandler);
                    resolve(fakeNick);
                }
            }, 3000);
            this.bot.on('message', messageHandler);
            this.bot.chat(`/realname ${fakeNick}`);
        });
    }
    
    async processMessage(nickname, message, originalSender) {
        const isRPCommand = rpCommands.some(cmd => message.startsWith(cmd));

        if (isRPCommand) {
            const isFrozen = await this.db.isRPFrozen(nickname);
            if (isFrozen) {
                this.bot.chat(`/msg ${nickname} &4&l|&c Ваш RP профиль заморожен!`);
                this.bot.chat(`/msg ${nickname} &4&l|&c Вы не можете использовать RP команды`);
                return;
            }
        }
        if (!this.moderation) {
            const { getModerationSystem } = require('./moderation');
            this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot);
        }
        
        const isMuted = await this.moderation.isPrivateMuted(nickname);
        if (isMuted) return;
        
        const codeMatch = message.match(/^([0-9]{6})$/);
        if (codeMatch) {
            await this.handleRPCode(nickname, codeMatch[1], originalSender);
            return;
        }
        
        if (message.startsWith('/')) {
            const parts = message.slice(1).split(' ');
            const command = parts[0].toLowerCase();
            const args = parts.slice(1);
            
            if (command === 'rp') {
                const playerCommands = require('./commands/player');
                await playerCommands.rp(this.bot, nickname, originalSender, args, this.db, this.parentBot?.addLog);
                return;
            }
            
            if (this.moderation.checkCommandCooldown) {
                const cooldownResult = await this.moderation.checkCommandCooldown(nickname, command);
                if (!cooldownResult.allowed) return;
            }
            
            const cmdResult = await this.moderation.checkPrivateCommand(nickname, command);
            if (!cmdResult.allowed) return;
            
            const commands = require('./commands');
            const cmd = commands.commandMap?.get(command);
            if (cmd && cmd.handler) {
                await cmd.handler(this.bot, nickname, args, this.db, this.parentBot?.addLog);
            } else {
                this.bot.chat(`/msg ${originalSender} &c&l|&c Неизвестная команда.`);
            }
        }
    }
    
    async handleRPCode(nickname, code, originalSender) {
        const cleanNick = nickname.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
        const sendTarget = originalSender || nickname;
        
        const existing = await this.db.getRPProfile(cleanNick);
        if (existing && existing.structure !== 'Гражданин') {
            this.bot.chat(`/msg ${sendTarget} &4&l|&c Вы уже зарегистрированы в RolePlay!`);
            return;
        }
        
        if (global.pendingRegistrations?.has(cleanNick)) {
            const pending = global.pendingRegistrations.get(cleanNick);
            if (Date.now() > pending.expires) {
                global.pendingRegistrations.delete(cleanNick);
                this.bot.chat(`/msg ${sendTarget} &4&l|&c Время кода истекло.`);
                return;
            }
            
            if (pending.code === code) {
                await this.db.registerRP(cleanNick);
                global.pendingRegistrations.delete(cleanNick);
                this.bot.chat(`/msg ${sendTarget} &a&l|&f Вы успешно зарегистрированы!`);
                this.bot.chat(`/cc &a🎭 &e${sendTarget} &aтеперь гражданин Resistance!`);
            } else {
                this.bot.chat(`/msg ${sendTarget} &c&l|&c Неверный код!`);
            }
        } else {
            this.bot.chat(`/msg ${sendTarget} &c&l|&c Сначала используйте /rp`);
        }
    }
    
    async handleClanChat(nickname, message) {
    if (nickname === this.bot.username) return;
    
    if (!this.moderation) {
        const { getModerationSystem } = require('./moderation');
        this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot);
    }
    
    // Проверка на мут
    const isMuted = await this.moderation.isClanMuted(nickname);
    if (isMuted) {
        safeLog(this.parentBot, `🚫 ${nickname} в клановом муте`, 'debug');
        return;
    }
    
    // ========== ВАЖНО: ПРОВЕРЯЕМ СООБЩЕНИЕ ЧЕРЕЗ МОДЕРАЦИЮ ==========
    const result = await this.moderation.checkClanChat(nickname, message);
    
    if (!result.allowed && result.reason) {
        safeLog(this.parentBot, `🚫 Сообщение от ${nickname} отклонено: ${result.reason}`, 'debug');
        // Сообщение уже заблокировано модерацией
    }
    
    // Логируем сообщение (даже если отклонено)
    if (this.db.logClanChat) {
        await this.db.logClanChat(nickname, message);
    }
}
    
    async handleJoinRequest(nickname) {
        const originalNick = nickname;
        const cleanNick = nickname.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
        
        const isBlacklisted = await this.db.isBlacklisted?.(cleanNick);
        if (isBlacklisted) {
            safeLog(this.parentBot, `🚫 Заявка от ${originalNick} отклонена (ЧС)`, 'warn');
            return;
        }
        
        await utils.sleep(500);
        this.bot.chat(`/c accept ${originalNick}`);
        safeLog(this.parentBot, `✅ Принята заявка от ${originalNick}`, 'success');
    }
    
    async handleJoinClan(nickname) {
        const cleanNick = nickname.toLowerCase();
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        
        let tracker = joinLeaveTracker.get(cleanNick);
        if (!tracker) {
            tracker = { count: 0, lastTime: 0, firstTime: now };
            joinLeaveTracker.set(cleanNick, tracker);
        }
        
        if (now - tracker.firstTime > twelveHours) {
            tracker.count = 0;
            tracker.firstTime = now;
        }
        
        if (tracker.count >= 3) {
            await this.db.addPunishment?.(cleanNick, 'blacklist', 'Спам входом/выходом из клана', 'system', 360);
            this.bot.chat(`/c kick ${cleanNick}`);
            this.bot.chat(`/cc &c⛔ &e${nickname} &cдобавлен в ЧС на 6 часов за спам`);
            safeLog(this.parentBot, `⛔ ${nickname} в ЧС за спам`, 'warn');
            return;
        }
        
        tracker.count++;
        tracker.lastTime = now;
        
        if (this.db.addClanMember) await this.db.addClanMember(cleanNick, 'system');
        
        const messages = [
            `&a&l|&f Добро пожаловать в клан Resistance, &e${nickname}&f!`,
            `&a&l|&f Рады приветствовать &e${nickname} &fв Resistance!`,
            `&a&l|&f Новый игрок &e${nickname} &fприсоединился к нам!`
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        this.bot.chat(`/cc ${randomMsg}`);
        safeLog(this.parentBot, `➕ ${nickname} вступил в клан`, 'success');
    }
    
    async handleLeaveClan(nickname) {
        const cleanNick = nickname.toLowerCase();
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        
        let tracker = joinLeaveTracker.get(cleanNick);
        if (!tracker) {
            tracker = { count: 0, lastTime: 0, firstTime: now };
            joinLeaveTracker.set(cleanNick, tracker);
        }
        
        if (now - tracker.firstTime > twelveHours) {
            tracker.count = 0;
            tracker.firstTime = now;
        }
        
        if (tracker.count >= 3) {
            await this.db.addPunishment?.(cleanNick, 'blacklist', 'Спам входом/выходом из клана', 'system', 360);
            this.bot.chat(`/c kick ${cleanNick}`);
            this.bot.chat(`/cc &c⛔ &e${nickname} &cдобавлен в ЧС на 6 часов за спам`);
            safeLog(this.parentBot, `⛔ ${nickname} в ЧС за спам`, 'warn');
            return;
        }
        
        tracker.count++;
        tracker.lastTime = now;
        if (this.db.removeClanMember) await this.db.removeClanMember(cleanNick);
        safeLog(this.parentBot, `➖ ${nickname} покинул клан`, 'info');
    }
    
    async handleKill(killer, victim) {
        if (this.db.addKill) await this.db.addKill(killer, victim);
    }
}

async function handleMessage(bot, message, db, parentBot) {
    const handler = new ChatHandler(bot, db, parentBot);
    await handler.handleMessage(message);
}

module.exports = { handleMessage, ChatHandler };