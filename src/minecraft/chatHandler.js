// src/minecraft/chatHandler.js
// Чистая версия с поддержкой всех функций

const utils = require('../shared/utils');

// ========== ФУНКЦИЯ ОЧИСТКИ НИКА ==========
function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}
// ============================================

// ========== МАССИВЫ РАЗНЫХ СООБЩЕНИЙ ==========
const UNKNOWN_COMMAND_MESSAGES = [
    `&4&l|&c Неизвестная команда. Используйте &e/help`,
    `&4&l|&c Такой команды нет. Напишите &e/help`,
    `&4&l|&c Ошибка. Доступные команды: &e/help`,
    `&4&l|&c Команда не найдена. &e/help &c- список`,
    `&4&l|&c Неверная команда. &e/help &cвам поможет`,
    `&4&l|&c Такой команды не существует. Попробуйте &e/help`,
    `&4&l|&c Ошибка ввода. &e/help &c- список команд`,
    `&4&l|&c Неизвестная команда! Введите &e/help`,
    `&4&l|&c Такой команды нет в системе. Используйте &e/help`,
    `&4&l|&c Команда не распознана. &e/help &c- справка`
];

const ERROR_MESSAGES = {
    notInClan: [
        `&4&l|&c Вы не состоите в клане Resistance!`,
        `&4&l|&c Доступ только для членов клана!`,
        `&4&l|&c Эта команда только для Resistance`,
        `&4&l|&c Вступите в клан для использования команд`
    ],
    notInRP: [
        `&4&l|&c Вы не зарегистрированы в RolePlay! Используйте &e/rp`,
        `&4&l|&c Требуется RP регистрация. Напишите &e/rp`,
        `&4&l|&c Для команд RP нужно зарегистрироваться: &e/rp`,
        `&4&l|&c Сначала пройдите регистрацию: &e/rp`
    ],
    frozen: [
        `&4&l|&c Ваш RP профиль заморожен!`,
        `&4&l|&c Доступ к RP командам заблокирован`,
        `&4&l|&c Ваш аккаунт заморожен в RP системе`,
        `&4&l|&c RP профиль заблокирован. Обратитесь к администрации`
    ]
};

function getRandomMessage(category) {
    const messages = ERROR_MESSAGES[category] || ERROR_MESSAGES.notInClan;
    return messages[Math.floor(Math.random() * messages.length)];
}

function getRandomUnknownMessage() {
    return UNKNOWN_COMMAND_MESSAGES[Math.floor(Math.random() * UNKNOWN_COMMAND_MESSAGES.length)];
}

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

const rpCommands = [
    '/balance', '/pay', '/pass', '/id', '/org', '/arp', 
    '/im', '/biz', '/office', '/duty', '/status', '/tr', 
    '/border', '/search', '/fine', '/order', '/redcode', 
    '/grade', '/keys', '/idim'
];

// Команды которые доступны всем в клане (даже без RP)
const publicCommands = ['/help', '/discord', '/ds', '/link', '/rp', '/fly', '/10t'];

global.realnameCache = global.realnameCache || new Map();
global.pendingRegistrations = global.pendingRegistrations || new Map();

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
        const cleanNickname = cleanNick(nickname);
        
        // ========== ПРОВЕРКА: Игрок в клане? ==========
        const isInClan = await this.db.getClanMember(nickname);
        if (!isInClan) {
            const randomMsg = getRandomMessage('notInClan');
            await utils.sleep(400);
            this.bot.chat(`/msg ${nickname} ${randomMsg}`);
            return;
        }
        
        const isRPCommand = rpCommands.some(cmd => message.startsWith(cmd));
        
        // ========== ПРОВЕРКА: Игрок в RP? (только для RP команд) ==========
        if (isRPCommand) {
            const rpProfile = await this.db.getRPProfile(cleanNickname);
            if (!rpProfile) {
                const randomMsg = getRandomMessage('notInRP');
                await utils.sleep(400);
                this.bot.chat(`/msg ${nickname} ${randomMsg}`);
                return;
            }
            
            const isFrozen = rpProfile.is_frozen === 1;
            if (isFrozen) {
                const randomMsg = getRandomMessage('frozen');
                await utils.sleep(400);
                this.bot.chat(`/msg ${nickname} ${randomMsg}`);
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
            
            const isValidCommand = commands.commandMap?.has(command);
            const spamCheck = await this.moderation.checkCommandSpam(nickname, command, isValidCommand);
            if (!spamCheck.allowed) return;
            
            const cmd = commands.commandMap?.get(command);
            if (cmd && cmd.handler) {
                await cmd.handler(this.bot, nickname, args, this.db, this.parentBot?.addLog);
            } else {
                await this.moderation.checkInvalidCommand(nickname, command);
            }
        }
    }
    
    async handleRPCode(nickname, code, originalSender) {
        const cleanNickname = cleanNick(nickname);
        const sendTarget = originalSender || nickname;
        
        const existing = await this.db.getRPProfile(cleanNickname);
        if (existing && existing.structure !== 'Гражданин') {
            await utils.sleep(400);
            this.bot.chat(`/msg ${sendTarget} &4&l|&c Вы уже зарегистрированы в RolePlay!`);
            return;
        }
        
        if (global.pendingRegistrations?.has(cleanNickname)) {
            const pending = global.pendingRegistrations.get(cleanNickname);
            
            if (Date.now() > pending.expires) {
                global.pendingRegistrations.delete(cleanNickname);
                await utils.sleep(400);
                this.bot.chat(`/msg ${sendTarget} &4&l|&c Время кода истекло. Используйте &e/rp &fснова`);
                return;
            }
            
            if (pending.code === code) {
                await this.db.registerRP(cleanNickname);
                global.pendingRegistrations.delete(cleanNickname);
                
                await utils.sleep(400);
                this.bot.chat(`/msg ${sendTarget} &a&l|&f Вы &2успешно&f зарегистрированы в RolePlay!`);
                await utils.sleep(400);
                this.bot.chat(`/msg ${sendTarget} &7&l|&f Теперь вам доступны команды: &e/balance, /pay, /pass, /id, /org, /duty`);
                await utils.sleep(400);
                this.bot.chat(`/cc &a&l|&f &e${sendTarget} &aтеперь гражданин Resistance!`);
                
                const discord = global.botComponents?.discord;
                if (discord && discord.client) {
                    const channel = discord.client.channels.cache.get('1474633679442804798');
                    if (channel) {
                        channel.send(`✅ **Новый гражданин**\nИгрок ${sendTarget} зарегистрировался в RolePlay!`);
                    }
                }
            } else {
                await utils.sleep(400);
                this.bot.chat(`/msg ${sendTarget} &4&l|&c Неверный код! Попробуйте снова или используйте &e/rp`);
            }
        } else {
            await utils.sleep(400);
            this.bot.chat(`/msg ${sendTarget} &4&l|&c У вас нет активного кода. Сначала используйте &e/rp`);
        }
    }
    
    async handleClanChat(nickname, message) {
        if (nickname === this.bot.username) return;
        
        if (!this.moderation) {
            const { getModerationSystem } = require('./moderation');
            this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot);
        }
        
        const isMuted = await this.moderation.isClanMuted(nickname);
        if (isMuted) {
            safeLog(this.parentBot, `🚫 ${nickname} в клановом муте`, 'debug');
            return;
        }
        
        const result = await this.moderation.checkClanChat(nickname, message);
        
        if (!result.allowed && result.reason) {
            safeLog(this.parentBot, `🚫 Сообщение от ${nickname} отклонено: ${result.reason}`, 'debug');
        }
        
        if (this.db.logClanChat) {
            await this.db.logClanChat(nickname, message);
        }
    }
    
    async handleJoinRequest(nickname) {
        const originalNick = nickname;
        const cleanNickname = cleanNick(nickname);
        
        const isBlacklisted = await this.db.isBlacklisted?.(cleanNickname);
        if (isBlacklisted) {
            safeLog(this.parentBot, `🚫 Заявка от ${originalNick} отклонена (ЧС)`, 'warn');
            return;
        }
        
        await utils.sleep(500);
        this.bot.chat(`/c accept ${originalNick}`);
        safeLog(this.parentBot, `✅ Принята заявка от ${originalNick}`, 'success');
    }
    
    async handleJoinClan(nickname) {
        const cleanNickname = cleanNick(nickname);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        
        let tracker = joinLeaveTracker.get(cleanNickname);
        if (!tracker) {
            tracker = { count: 0, lastTime: 0, firstTime: now };
            joinLeaveTracker.set(cleanNickname, tracker);
        }
        
        if (now - tracker.firstTime > twelveHours) {
            tracker.count = 0;
            tracker.firstTime = now;
        }
        
        if (tracker.count >= 3) {
            await this.db.addPunishment?.(cleanNickname, 'blacklist', 'Спам входом/выходом из клана', 'system', 360, 'clan');
            this.bot.chat(`/c kick ${cleanNickname}`);
            await utils.sleep(400);
            this.bot.chat(`/cc &4&l|&c &e${nickname} &cдобавлен в ЧС на 6 часов за спам`);
            safeLog(this.parentBot, `⛔ ${nickname} в ЧС за спам`, 'warn');
            return;
        }
        
        tracker.count++;
        tracker.lastTime = now;
        
        if (this.db.addClanMember) await this.db.addClanMember(cleanNickname, 'system');
        
        this.bot.chat(`/c rank ${nickname} &8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй`);
        
        const messages = [
            `&a&l|&f Добро пожаловать в клан Resistance, &e${nickname}&f!`,
            `&a&l|&f Рады приветствовать &e${nickname} &fв Resistance!`,
            `&a&l|&f Новый игрок &e${nickname} &fприсоединился к нам!`
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        await utils.sleep(400);
        this.bot.chat(`/cc ${randomMsg}`);
        safeLog(this.parentBot, `➕ ${nickname} вступил в клан`, 'success');
    }
    
    async handleLeaveClan(nickname) {
        const cleanNickname = cleanNick(nickname);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        
        let tracker = joinLeaveTracker.get(cleanNickname);
        if (!tracker) {
            tracker = { count: 0, lastTime: 0, firstTime: now };
            joinLeaveTracker.set(cleanNickname, tracker);
        }
        
        if (now - tracker.firstTime > twelveHours) {
            tracker.count = 0;
            tracker.firstTime = now;
        }
        
        if (tracker.count >= 3) {
            await this.db.addPunishment?.(cleanNickname, 'blacklist', 'Спам входом/выходом из клана', 'system', 360, 'clan');
            this.bot.chat(`/c kick ${cleanNickname}`);
            await utils.sleep(400);
            this.bot.chat(`/cc &4&l|&c &e${nickname} &cдобавлен в ЧС на 6 часов за спам`);
            safeLog(this.parentBot, `⛔ ${nickname} в ЧС за спам`, 'warn');
            return;
        }
        
        tracker.count++;
        tracker.lastTime = now;
        
        await this.db.removeClanMember(cleanNickname);
        await this.db.run(`UPDATE rp_players SET structure = 'Гражданин', job_rank = 'Нет', on_duty = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanNickname]);
        await this.db.run(`DELETE FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanNickname]);
        
        await utils.sleep(400);
        this.bot.chat(`/msg ${nickname} &4&l|&c Вы покинули клан Resistance`);
        await utils.sleep(400);
        this.bot.chat(`/msg ${nickname} &4&l|&c Ваш RP профиль был удалён`);
        
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