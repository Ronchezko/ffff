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
        database.getDb().run(`INSERT INTO punishments (player, type, reason, issued_by, expires_at, active) VALUES (?, 'blacklist', 'Спам заявками (3 выхода за 12ч)', 'system', ?, 1)`, [nickname, expiresAt]);
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
    await database.addJoinLeaveHistory(nickname, 'leave');
    await database.removeClanMember(nickname);
    const rpPlayer = await database.getRPPlayer(nickname);
    if (rpPlayer) {
        database.getDb().run('DELETE FROM rp_players WHERE minecraft_nick = ?', [nickname]);
    }
}

async function handleJoinClan(nickname) {
    await database.addJoinLeaveHistory(nickname, 'join');
    await database.addClanMember(nickname, 'system');
    const defaultRank = '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй';
    setTimeout(() => sendCommand(`/c rank ${nickname} ${defaultRank}`), 2000);
    setTimeout(() => {
        sendClan(`🎉 Приветствуем нового участника — ${nickname}!`);
    }, 4000);
}

function handleKill(killer, victim) {
    try {
        database.getDb().run('UPDATE clan_members SET kills = kills + 1 WHERE minecraft_nick = ?', [killer]);
        database.getDb().run('UPDATE clan_members SET deaths = deaths + 1 WHERE minecraft_nick = ?', [victim]);
    } catch (err) {}
}

async function performPayday() {
    try {
        if (database.getSetting('payday_enabled') !== 'true') return;
        const now = new Date();
        if (now.getMinutes() !== 0) return;
        
        const onDuty = await database.getDb().all(`SELECT sm.minecraft_nick, sm.structure FROM structure_members sm WHERE sm.on_duty = 1`);
        for (const p of onDuty) {
            if (bot.players[p.minecraft_nick]) {
                const salary = 5000;
                await database.updatePlayerMoney(p.minecraft_nick, salary, 'PayDay', 'system');
                sendPrivate(p.minecraft_nick, `💰 Вы получили зарплату ${salary}₽.`);
            }
        }
    } catch (err) {}
}

function checkExpiredPunishments() {
    try {
        database.getDb().all(`SELECT * FROM punishments WHERE active = 1 AND expires_at <= datetime('now')`)
            .then(expired => {
                for (const p of expired) {
                    database.getDb().run('UPDATE punishments SET active = 0 WHERE id = ?', [p.id]);
                    sendClan(`✅ Ограничение снято с игрока ${p.player}`);
                }
            });
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
    
    // Инициализация планировщика модерации
    moderation.startModerationScheduler();
    
    const useMainBot = database.getSetting('main_bot_active') !== 'false';
    let username = (isBanned && !useMainBot) ? (process.env.MC_BACKUP_ACCOUNT || 'Bot_Backup') : (process.env.MC_MAIN_ACCOUNT || 'Bot_Main');
    currentBotUsername = username;
    
    const botOptions = {
        host: process.env.MC_SERVER || 'ru.dexland.org',
        port: parseInt(process.env.MC_PORT) || 25565,
        username: username,
        auth: process.env.MC_AUTH || 'offline',
        version: process.env.MC_VERSION || false,
    };
    
    const proxyEnabled = process.env.PROXY_ENABLED === 'true';
    if (proxyEnabled) {
        botOptions.agent = new SocksProxyAgent(`${process.env.PROXY_TYPE}://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
    }
    
    bot = mineflayer.createBot(botOptions);
    
    bot.on('login', () => { setTimeout(() => sendCommand('/s3'), 4000); });
    bot.once('spawn', () => {
        reconnectAttempts = 0;
        isBanned = false;
        setTimeout(() => { isReady = true; sendClan(`🤖 Бот успешно запущен!`); }, 5000);
        setInterval(performPayday, 60000);
        setInterval(checkExpiredPunishments, 600000);
    });
    
    // ... (начало файла такое же до момента bot.on('message'))

    bot.on('message', async (jsonMsg) => {
        let text = jsonMsg.toString().replace(/§[0-9a-fklmnor]/g, '');
        if (!text.trim()) return;

        const callbacks = { sendClan, sendPrivate };

        // 1. ОБРАБОТКА КЛАНОВОГО ЧАТА
        const clanMatch = text.match(/КЛАН:\s*(?:[^:]+:\s+)?([^\s:]+):\s+(.+)/);
        if (clanMatch) {
            let player = clanMatch[1];
            const msg = clanMatch[2];
            if (player.startsWith('~~')) player = getRealName(player);

            // МОДЕРАЦИЯ (isClanChat = true)
            const result = await moderation.moderateMessage(bot, player, msg, database, true, callbacks);
            
            // Если модерация не разрешила (варн или мут), стопаем процесс
            if (!result || !result.allowed) return;

            // Логирование
            try { database.getDb().run('INSERT INTO clan_chat_logs (player, message) VALUES (?, ?)', [player, msg]); } catch (e) {}

            // Если это команда
            if (msg.startsWith('/')) {
                await commands.handleCommand(bot, player, msg, database, logCallback, sendPrivate, sendClan, getRealName);
            }
            return;
        }

        // 2. ОБРАБОТКА ЛИЧНЫХ СООБЩЕНИЙ (ЛС)
        const pmMatch = text.match(/\[\*\]\s*\[([^\s]+)\s*->\s*я\]\s*(.+)/);
        if (pmMatch) {
            let sender = pmMatch[1];
            const msg = pmMatch[2];
            if (sender.startsWith('~~')) sender = getRealName(sender);

            // МОДЕРАЦИЯ (isClanChat = false)
            const result = await moderation.moderateMessage(bot, sender, msg, database, false, callbacks);
            
            // Если игрок в муте или нарушил - бот ему НЕ ответит
            if (!result || !result.allowed) return;

            // Обработка RP кода и обычных команд
            if (/^\d{6}$/.test(msg.trim())) {
                // ... (логика кода регистрации)
            } else if (msg.startsWith('/')) {
                await commands.handleCommand(bot, sender, msg, database, logCallback, sendPrivate, sendClan, getRealName);
            }
            return;
        }

        // 3. СИСТЕМНЫЕ СООБЩЕНИЯ (Входы, выходы, киллы)
        if (text.match(/подал заявку/)) handleJoinRequest(text.match(/Игрок\s+(\w+)/)[1]);
        if (text.match(/покинул клан/)) handleLeaveClan(text.match(/(\w+)/)[1]);
        if (text.match(/присоединился к клану/)) handleJoinClan(text.match(/(\w+)/)[1]);
        if (text.includes('Ваш аккаунт был забанен')) {
            isBanned = true;
            scheduleReconnect();
        }
    });

    
    bot.on('end', () => { isReady = false; scheduleReconnect(); });
    bot.on('error', (err) => { logger.error('Bot error:', err); scheduleReconnect(); });
}

function stop() { if (reconnectTimer) clearTimeout(reconnectTimer); if (bot) { bot.end(); bot = null; } }
function isActive() { return isReady && bot; }
function getBot() { return bot; }

module.exports = { start, stop, sendPrivate, sendClan, isActive, getBot };