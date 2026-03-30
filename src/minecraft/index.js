// src/minecraft/index.js
const mineflayer = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('../shared/logger');
const utils = require('../shared/utils');
const database = require('../database');
const commands = require('./commands');
const moderation = require('./moderation');

let bot = null;
let isReady = false;
let commandQueue = [];
let isSending = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let databaseInstance = null;
let logCallback = null;
let realNameCache = new Map();
let currentBotUsername = null;
let isBanned = false;

// Кэши для авто-модерации
const joinLeaveHistory = new Map();
const rpCodeCooldown = new Map();

const MAX_MSG_LEN = 185;
const COMMAND_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Цвета (временно убраны, останется для совместимости)
const colors = {
    gold: '&6', light_purple: '&d', white: '&f', green: '&a',
    red: '&c', yellow: '&e', gray: '&7', reset: '&r'
};

function sanitizeMessage(message) {
    if (!message) return '';
    return message.replace(/[\n\r\t\f\v]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sendPrivate(player, message) {
    if (!isReady || !bot || !bot.chat) return false;
    const sanitized = sanitizeMessage(message);
    const maxMsgLen = MAX_MSG_LEN - (player.length + 10);
    const truncatedMsg = utils.truncateMessage(sanitized, Math.max(10, maxMsgLen));
    commandQueue.push(`/msg ${player} ${truncatedMsg}`);
    processQueue();
    return true;
}

function sendClan(message) {
    if (!isReady || !bot || !bot.chat) return false;
    const sanitized = sanitizeMessage(message);
    const maxMsgLen = MAX_MSG_LEN - 4;
    const truncatedMsg = utils.truncateMessage(sanitized, maxMsgLen);
    commandQueue.push(`/cc ${truncatedMsg}`);
    processQueue();
    return true;
}

function sendCommand(cmd) {
    if (!bot || !bot.chat) return false;
    commandQueue.push(cmd);
    processQueue();
    return true;
}

function processQueue() {
    if (isSending) return;
    if (commandQueue.length === 0) return;
    if (!isReady || !bot || !bot.chat) {
        setTimeout(processQueue, 500);
        return;
    }
    isSending = true;
    const cmd = commandQueue.shift();
    try {
        bot.chat(cmd);
        logger.debug(`📤 ${cmd.substring(0, 50)}`);
    } catch (err) {
        logger.error('Ошибка отправки:', err);
    }
    setTimeout(() => {
        isSending = false;
        processQueue();
    }, COMMAND_DELAY);
}

function getRealName(disguisedNick) {
    if (!disguisedNick || !disguisedNick.startsWith('~~')) return disguisedNick;
    if (realNameCache.has(disguisedNick)) {
        const cached = realNameCache.get(disguisedNick);
        if (Date.now() - cached.timestamp < 120000) return cached.realName;
        realNameCache.delete(disguisedNick);
    }
    sendCommand(`/realname ${disguisedNick.replace(/~~/g, '')}`);
    return disguisedNick;
}

async function handleJoinRequest(nickname) {
    const history = joinLeaveHistory.get(nickname) || [];
    const recentLeaves = history.filter(h => h.action === 'leave' && h.timestamp > Date.now() - 12 * 3600000);
    if (recentLeaves.length >= 3) {
        const expiresAt = new Date(Date.now() + 6 * 3600000).toISOString();
        database.getDb().prepare(`INSERT INTO punishments (player, type, reason, issued_by, expires_at, active) VALUES (?, 'blacklist', 'Спам заявками (3 выхода за 12ч)', 'system', ?, 1)`).run(nickname, expiresAt);
        sendClan(`⚠️ Игрок ${nickname} добавлен в чёрный список за спам заявками на 6 часов`);
        return;
    }
    
    const punishments = await database.getActivePunishments(nickname, 'blacklist');
    if (punishments.length > 0) return;
    
    setTimeout(() => {
        if (isReady && bot && bot.chat) {
            sendCommand(`/c accept ${nickname}`);
            setTimeout(() => {
                sendClan(`🎉 Добро пожаловать в клан, ${nickname}!`);
            }, 2000);
        }
    }, 2000);
}

async function handleLeaveClan(nickname) {
    const history = joinLeaveHistory.get(nickname) || [];
    history.push({ action: 'leave', timestamp: Date.now() });
    joinLeaveHistory.set(nickname, history.filter(h => h.timestamp > Date.now() - 12 * 3600000));
    await database.addJoinLeaveHistory(nickname, 'leave');
    await database.removeClanMember(nickname);
    
    const rpPlayer = await database.getRPPlayer(nickname);
    if (rpPlayer) {
        database.getDb().prepare('DELETE FROM rp_players WHERE minecraft_nick = ?').run(nickname);
    }
}

async function handleJoinClan(nickname) {
    const history = joinLeaveHistory.get(nickname) || [];
    history.push({ action: 'join', timestamp: Date.now() });
    joinLeaveHistory.set(nickname, history.filter(h => h.timestamp > Date.now() - 12 * 3600000));
    await database.addJoinLeaveHistory(nickname, 'join');
    await database.addClanMember(nickname, 'system');
    
    const defaultRank = '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй';
    setTimeout(() => sendCommand(`/c rank ${nickname} ${defaultRank}`), 2000);
    setTimeout(() => {
        const messages = [
            `🎉 Новый участник, ${nickname}! Добро пожаловать в семью!`,
            `👋 Приветствуем, ${nickname}! Рады видеть тебя в наших рядах!`,
            `🔥 ${nickname} присоединился к нам! Добро пожаловать!`,
            `⭐ У нас новый игрок - ${nickname}! Встречайте!`
        ];
        sendClan(messages[Math.floor(Math.random() * messages.length)]);
    }, 4000);
}

function handleKill(killer, victim) {
    try {
        const db = database.getDb();
        db.prepare('UPDATE clan_members SET kills = kills + 1 WHERE minecraft_nick = ?').run(killer);
        db.prepare('UPDATE clan_members SET deaths = deaths + 1 WHERE minecraft_nick = ?').run(victim);
    } catch (err) {}
}

async function performPayday() {
    try {
        if (database.getSetting('payday_enabled') !== 'true') return;
        const db = database.getDb();
        const now = new Date();
        if (now.getMinutes() !== 0) return;
        
        const onDuty = db.prepare(`SELECT sm.minecraft_nick, sm.structure, COALESCE(SUM(dh.minutes), 0) as total_minutes FROM structure_members sm LEFT JOIN duty_history dh ON dh.player = sm.minecraft_nick AND dh.end_time > datetime('now', '-1 hour') WHERE sm.on_duty = 1 GROUP BY sm.minecraft_nick HAVING total_minutes >= 15`).all();
        if (onDuty.length === 0) return;
        
        let paidCount = 0, totalPaid = 0;
        for (const p of onDuty) {
            if (bot.players && bot.players[p.minecraft_nick]) {
                const salary = 5000;
                const budget = await database.getOrgBudget(p.structure);
                if (budget >= salary) {
                    await database.updatePlayerMoney(p.minecraft_nick, salary, 'PayDay', 'system');
                    db.prepare('UPDATE org_budgets SET balance = balance - ? WHERE structure = ?').run(salary, p.structure);
                    totalPaid += salary;
                    paidCount++;
                    setTimeout(() => sendPrivate(p.minecraft_nick, `💰 Вы получили зарплату ${salary}₽ за дежурство.`), 1000);
                } else {
                    setTimeout(() => sendPrivate(p.minecraft_nick, `⚠️ PayDay не выполнен: недостаточно бюджета в ${p.structure}`), 1000);
                }
            } else {
                setTimeout(() => sendPrivate(p.minecraft_nick, `⚠️ Вы не получили зарплату, так как были оффлайн в момент PayDay.`), 1000);
            }
        }
        if (paidCount > 0) {
            setTimeout(() => sendClan(`💰 PayDay! Выплачено ${totalPaid}₽ ${paidCount} сотрудникам.`), 2000);
        }
    } catch (err) {}
}

function checkExpiredPunishments() {
    try {
        const db = database.getDb();
        const expired = db.prepare(`SELECT * FROM punishments WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')`).all();
        for (const p of expired) {
            db.prepare('UPDATE punishments SET active = 0 WHERE id = ?').run(p.id);
            if (p.type === 'mute') {
                sendClan(`✅ Мут снят с игрока ${p.player}`);
            } else if (p.type === 'blacklist') {
                sendClan(`✅ Чёрный список снят с игрока ${p.player}`);
            }
        }
    } catch (err) {}
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = reconnectAttempts < 3 ? 10000 : 30000;
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => { if (bot) bot.end(); start(databaseInstance, logCallback); }, delay);
}

async function start(db, logFn) {
    databaseInstance = db;
    logCallback = logFn || null;
    isReady = false;
    commandQueue = [];
    isSending = false;
    
    // Подавляем логи о чанках
    const originalConsoleWarn = console.warn;
    console.warn = function(...args) {
        const msg = args.join(' ');
        if (msg.includes('Ignoring block entities as chunk failed to load')) return;
        originalConsoleWarn.apply(this, args);
    };
    
    moderation.startModerationScheduler(bot, db, logCallback, sendPrivate, sendClan);
    
    const mainBotActive = database.getSetting('main_bot_active');
    const useMainBot = mainBotActive !== 'false';
    let username = (isBanned && !useMainBot) ? (process.env.MC_BACKUP_ACCOUNT || 'xxx_toper_xxx') : (process.env.MC_MAIN_ACCOUNT || 'YT_FLATT807');
    currentBotUsername = username;
    
    const proxyEnabled = process.env.PROXY_ENABLED === 'true';
    let agent = null;
    if (proxyEnabled) {
        try {
            agent = new SocksProxyAgent(`${process.env.PROXY_TYPE || 'socks5'}://${process.env.PROXY_HOST || '127.0.0.1'}:${parseInt(process.env.PROXY_PORT) || 1080}`);
        } catch (err) {}
    }
    
    const botOptions = {
        host: process.env.MC_SERVER || 'ru.dexland.org',
        port: parseInt(process.env.MC_PORT) || 25565,
        username: username,
        auth: process.env.MC_AUTH || 'offline',
        version: process.env.MC_VERSION || false,
        viewDistance: 'tiny',
        chatLengthLimit: 100
    };
    if (agent) botOptions.agent = agent;
    
    try { bot = mineflayer.createBot(botOptions); } catch (err) { scheduleReconnect(); return null; }
    
    bot.once('error', (err) => { if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') scheduleReconnect(); });
    bot.on('connect', () => {});
    bot.on('login', () => { setTimeout(() => sendCommand('/s3'), 4000); });
    bot.once('spawn', () => {
        reconnectAttempts = 0;
        isBanned = false;
        setTimeout(() => sendCommand('/s3'), 4000);
        setTimeout(() => { isReady = true; sendClan(`🤖 Бот запущен и готов к работе!`); }, 10000);
        setInterval(performPayday, 60 * 60 * 1000);
        setInterval(checkExpiredPunishments, 10 * 60 * 1000);
    });
    
    bot.on('message', async (jsonMsg) => {
        let text = '';
        try {
            text = (typeof jsonMsg === 'string' ? jsonMsg : jsonMsg.toString()).replace(/§[0-9a-fklmnor]/g, '');
        } catch (e) { text = String(jsonMsg); }
        if (!text.trim()) return;
        
        let realMatch = text.match(/~~([^\s]+)\s+является\s+([^\s]+)/);
        if (realMatch) { realNameCache.set(`~~${realMatch[1]}`, { realName: realMatch[2], timestamp: Date.now() }); return; }
        
        const clanMatch = text.match(/КЛАН:\s*(?:[^:]+:\s+)?([^\s:]+):\s+(.+)/);
        // В обработчике clanMatch (клановый чат)
if (clanMatch) {
    let player = clanMatch[1];
    const msg = clanMatch[2];
    
    if (player.startsWith('~~')) {
        const real = getRealName(player);
        if (real !== player) player = real;
    }
    
    try {
        database.getDb().prepare('INSERT INTO clan_chat_logs (player, message) VALUES (?, ?)').run(player, msg);
    } catch (e) {}
    
    // ВАЖНО: передаём isClanChat = true
    const result = await moderation.moderateMessage(bot, player, msg, databaseInstance, logCallback, sendPrivate, sendClan, true);
    
    if (!result.allowed) {
        return; // Сообщение не пропускаем
    }
    
    if (msg.startsWith('/')) {
        await commands.handleCommand(bot, player, msg, databaseInstance, logCallback, sendPrivate, sendClan, getRealName);
    }
    return;
}
        
        const pmMatch = text.match(/\[\*\]\s*\[([^\s]+)\s*->\s*я\]\s*(.+)/);
        // В обработчике pmMatch (личные сообщения)
if (pmMatch) {
    let sender = pmMatch[1];
    const msg = pmMatch[2];
    
    if (sender.startsWith('~~')) {
        const real = getRealName(sender);
        if (real !== sender) sender = real;
    }
    
    const member = await database.getPlayerByNickname(sender);
    if (!member) return;
    
    // ВАЖНО: передаём isClanChat = false
    const result = await moderation.moderateMessage(bot, sender, msg, databaseInstance, logCallback, sendPrivate, sendClan, false);
    
    if (!result.allowed) {
        return;
    }
            
            // Обработка кода для RP
            if (/^\d{6}$/.test(msg.trim())) {
                const cooldown = rpCodeCooldown.get(sender);
                if (cooldown && Date.now() - cooldown < 300000) {
                    const remaining = Math.ceil((300000 - (Date.now() - cooldown)) / 1000);
                    sendPrivate(sender, `⚠️ Подождите ${remaining} секунд перед получением нового кода.`);
                    return;
                }
                
                const pending = global.rpRegistrations?.get(sender);
                if (pending && pending.code === msg.trim() && pending.expiresAt > Date.now()) {
                    try {
                        database.getDb().prepare(`INSERT INTO rp_players (minecraft_nick, money, rp_joined) VALUES (?, 1000, datetime('now'))`).run(sender);
                        sendPrivate(sender, `✅ Регистрация в RolePlay завершена! Начальный баланс: 1000₽`);
                        sendClan(`🎉 Новый гражданин ${sender} вступил в RolePlay!`);
                        global.rpRegistrations.delete(sender);
                    } catch (err) {
                        sendPrivate(sender, `❌ Ошибка регистрации. Попробуйте позже.`);
                    }
                    return;
                } else if (pending && pending.code === msg.trim()) {
                    sendPrivate(sender, `⏰ Код истёк. Используйте /rp заново.`);
                    global.rpRegistrations.delete(sender);
                    return;
                } else {
                    sendPrivate(sender, `❌ Неверный код. Используйте /rp для получения нового.`);
                    return;
                }
            }
            
            if (msg.startsWith('/')) await commands.handleCommand(bot, sender, msg, db, logCallback, sendPrivate, sendClan, getRealName);
            return;
        }
        
        const joinRequestMatch = text.match(/Игрок\s+(\w+)\s+подал заявку на вступление в ваш клан/);
        if (joinRequestMatch) { await handleJoinRequest(joinRequestMatch[1]); return; }
        
        const leaveClanMatch = text.match(/(\w+)\s+покинул клан/);
        if (leaveClanMatch) { await handleLeaveClan(leaveClanMatch[1]); return; }
        
        const joinClanMatch = text.match(/(\w+)\s+присоединился к клану/);
        if (joinClanMatch) { await handleJoinClan(joinClanMatch[1]); return; }
        
        const killMatch = text.match(/(\w+)\s+убил\s+игрока\s+(\w+)/);
        if (killMatch) { handleKill(killMatch[1], killMatch[2]); return; }
        
        if (text.includes('Ты перемещен в лобби')) { setTimeout(() => sendCommand('/s3'), 3000); return; }
        if (text.includes('Ваш аккаунт был забанен')) {
            isBanned = true;
            database.setSetting('main_bot_active', 'false');
            setTimeout(() => { if (bot) bot.end(); start(db, logCallback); }, 5000);
            return;
        }
    });
    
    bot.on('kicked', (reason) => {
        let reasonStr = '';
        try { reasonStr = (typeof reason === 'string' ? reason : JSON.stringify(reason)).replace(/§[0-9a-fklmnor]/g, ''); } catch (e) { reasonStr = String(reason); }
        isReady = false;
        if (reasonStr.includes('лобби') || reasonStr.includes('lobby')) { setTimeout(() => sendCommand('/s3'), 3000); }
        else { scheduleReconnect(); }
    });
    bot.on('end', () => { isReady = false; if (!reconnectTimer) scheduleReconnect(); });
    return bot;
}

function stop() { if (reconnectTimer) clearTimeout(reconnectTimer); if (bot) { bot.end(); bot = null; } }

function isActive() { return isReady && bot && bot.chat; }
function getBot() { return bot; }

module.exports = { start, stop, sendPrivate, sendClan, isActive, getBot };