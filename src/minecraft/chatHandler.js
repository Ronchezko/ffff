// src/minecraft/chatHandler.js
const logger = require('../shared/logger');
const database = require('../database');
const utils = require('../shared/utils');
const moderation = require('./moderation');
const commands = require('./commands');

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0', dark_blue: '&1', dark_green: '&2', dark_aqua: '&3',
    dark_red: '&4', dark_purple: '&5', gold: '&6', gray: '&7',
    dark_gray: '&8', blue: '&9', green: '&a', aqua: '&b',
    red: '&c', light_purple: '&d', yellow: '&e', white: '&f',
    bold: '&l', reset: '&r'
};

// Функция для красивого форматирования сообщений
function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${color}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

// Функция для создания рамки
function createFrame(title, lines) {
    let frame = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    frame += `${colors.gold}║ ${colors.light_purple}${colors.bold}${title}${colors.reset}`;
    frame += ' '.repeat(32 - title.length - 2) + `${colors.gold}║${colors.reset}\n`;
    frame += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    for (const line of lines) {
        frame += `${colors.gold}║ ${line}`;
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        frame += ' '.repeat(32 - cleanLine.length - 2) + `${colors.gold}║${colors.reset}\n`;
    }
    frame += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    return frame;
}

const MAX_MESSAGE_LENGTH = 185;

const patterns = {
    clanChat: /^КЛАН:\s*(?:[^:]+:\s+)?([^\s:]+):\s+(.+)/,
    privateMessage: /^\[\*\]\s*\[([~\w]+)\s*->\s*я\]\s*(.+)/,
    joinRequest: /\[\*\]\s*Игрок\s+(\w+)\s+подал заявку на вступление в ваш клан\./,
    leaveClan: /\[\*\]\s*(\w+)\s+покинул клан\./,
    joinClan: /\[\*\]\s*(\w+)\s+присоединился к клану\./,
    kill: /(\w+)\s+убил\s+игрока\s+(\w+)'?/,
    lobbyKick: /Ты перемещен в лобби/,
    ban: /Ваш аккаунт был забанен/,
    realnameResponse: /\[\*\]\s*~~([^\s]+)\s+является\s+([^\s]+)/
};

function sendMessage(bot, player, message) {
    if (message.length > MAX_MESSAGE_LENGTH) {
        message = message.substring(0, MAX_MESSAGE_LENGTH - 3) + '...';
    }
    bot.chat(`/msg ${player} ${message}`);
}

function sanitizeMessage(message) {
    if (!message) return '';
    return message.replace(/[\n\r\t\f\v\\u000A\\u000D]/g, ' ').trim();
}

function isValidCommand(command) {
    if (!command || command.length > 200) return false;
    const validPattern = /^[a-zA-Z0-9\/\s@_\-\.\[\]\(\):;!?]+$/;
    return validPattern.test(command);
}

const rpRegistrationState = new Map();

function generateRpCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function handleMessage(bot, message, database, logCallback, sendPrivate, sendClan, getRealName) {
    try {
        const shortMsg = message.length > 100 ? message.substring(0, 100) + '...' : message;
        logger.debug(`🔍 Обработка: ${shortMsg}`);
        
        // ========== ЗАЯВКА НА ВСТУПЛЕНИЕ ==========
        const joinMatch = message.match(patterns.joinRequest);
        if (joinMatch) {
            await handleJoinRequest(bot, joinMatch[1], database, logCallback, sendClan);
            return;
        }
        
        // ========== ВЫХОД ИЗ КЛАНА ==========
        const leaveMatch = message.match(patterns.leaveClan);
        if (leaveMatch) {
            await handleLeaveClan(bot, leaveMatch[1], database, logCallback, sendPrivate, sendClan);
            return;
        }
        
        // ========== ВСТУПЛЕНИЕ В КЛАН ==========
        const joinClanMatch = message.match(patterns.joinClan);
        if (joinClanMatch) {
            await handleJoinClan(bot, joinClanMatch[1], database, logCallback, sendClan);
            return;
        }
        
        // ========== УБИЙСТВО ==========
        const killMatch = message.match(patterns.kill);
        if (killMatch) {
            await handleKill(killMatch[1], killMatch[2], database);
            return;
        }
        
        // ========== КЛАНОВЫЙ ЧАТ ==========
        const clanMatch = message.match(patterns.clanChat);
        if (clanMatch) {
            await handleClanMessage(bot, clanMatch[1], clanMatch[2], database, logCallback, sendPrivate, sendClan, getRealName);
            return;
        }
        
        // ========== ЛИЧНЫЕ СООБЩЕНИЯ ==========
        const pmMatch = message.match(patterns.privateMessage);
        if (pmMatch) {
            await handlePrivateMessage(bot, pmMatch[1], pmMatch[2], database, logCallback, sendPrivate, sendClan, getRealName);
            return;
        }
        
        // ========== REALNAME ОТВЕТ ==========
        const realnameMatch = message.match(patterns.realnameResponse);
        if (realnameMatch) {
            handleRealnameResponse(bot, realnameMatch[1], realnameMatch[2]);
            return;
        }
        
        // ========== ОБРАБОТКА СИСТЕМНЫХ СООБЩЕНИЙ ==========
        if (message.includes('Ты перемещен в лобби')) {
            logger.info('🌐 Бот перемещён в лобби');
            if (logCallback) logCallback('🌐 Бот перемещён в лобби', 'info');
            return;
        }
        
        if (message.includes('Ваш аккаунт был забанен')) {
            logger.error('🚫 Бот был забанен!');
            if (logCallback) logCallback('🚫 Бот забанен!', 'error');
            return;
        }
        
    } catch (error) {
        logger.error('Ошибка в handleMessage:', error);
        if (logCallback) logCallback(`❌ Ошибка обработки: ${error.message}`, 'error');
    }
}

async function handleJoinRequest(bot, nickname, database, logCallback, sendClan) {
    logger.info(`📝 Заявка от ${nickname}`);
    
    // Проверка на спам заявками
    if (database.checkJoinLeaveSpam(nickname)) {
        logger.info(`🚫 ${nickname} в ЧС (спам заявками)`);
        const lines = [
            `${colors.white}Игрок &e${nickname}&r отклонён из-за спама заявками!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}3 выхода из клана за 12 часов`
        ];
        const frame = createFrame(`🚫 ОТКЛОНЕНИЕ ЗАЯВКИ`, lines);
        sendClan(frame);
        return;
    }
    
    const punishments = await database.getActivePunishments(nickname, 'blacklist');
    if (punishments.length > 0) {
        logger.info(`🚫 ${nickname} в ЧС, заявка отклонена`);
        const lines = [
            `${colors.white}Игрок &e${nickname}&r отклонён!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}Находится в чёрном списке`
        ];
        const frame = createFrame(`🚫 ОТКЛОНЕНИЕ ЗАЯВКИ`, lines);
        sendClan(frame);
        return;
    }
    
    setTimeout(() => {
        try {
            bot.chat(`/c accept ${nickname}`);
            logger.info(`✅ Принята заявка ${nickname}`);
            const lines = [
                `${colors.white}Заявка игрока &e${nickname}&r &aпринята!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Добро пожаловать в клан!`
            ];
            const frame = createFrame(`✅ НОВЫЙ УЧАСТНИК`, lines);
            sendClan(frame);
            if (logCallback) logCallback(`✅ Заявка ${nickname} принята`, 'success');
        } catch (err) {
            logger.error(`Ошибка принятия ${nickname}:`, err);
        }
    }, 2000);
}

async function handleLeaveClan(bot, nickname, database, logCallback, sendPrivate, sendClan) {
    logger.info(`👋 ${nickname} покинул клан`);
    
    try {
        await database.addJoinLeaveHistory(nickname, 'leave');
        await database.removeClanMember(nickname);
        
        const rpPlayer = await database.getRPPlayer(nickname);
        if (rpPlayer) {
            database.getDb().prepare('DELETE FROM rp_players WHERE minecraft_nick = ?').run(nickname);
            setTimeout(() => {
                sendPrivate(nickname, formatMessage('⚠️', 'Вы покинули клан, доступ к RolePlay аннулирован.', colors.yellow));
            }, 1000);
            if (logCallback) logCallback(`👋 ${nickname} покинул клан, RP удалён`, 'info');
        }
        
        const lines = [
            `${colors.white}Игрок &e${nickname}&r покинул клан!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Дата: ${colors.gray}${new Date().toLocaleString('ru-RU')}`
        ];
        const frame = createFrame(`👋 ПОКИНУЛ КЛАН`, lines);
        sendClan(frame);
        
    } catch (err) {
        logger.error(`Ошибка выхода ${nickname}:`, err);
    }
}

async function handleJoinClan(bot, nickname, database, logCallback, sendClan) {
    logger.info(`👋 ${nickname} присоединился`);
    
    try {
        await database.addJoinLeaveHistory(nickname, 'join');
        await database.addClanMember(nickname, 'system');
        
        const defaultRank = '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй';
        
        setTimeout(() => {
            try {
                bot.chat(`/c rank ${nickname} ${defaultRank}`);
                logger.info(`🎖️ Выдан ранг ${nickname}`);
            } catch (err) {
                logger.error(`Ошибка выдачи ранга ${nickname}:`, err);
            }
        }, 2000);
        
        setTimeout(() => {
            try {
                const lines = [
                    `${colors.white}Добро пожаловать в &lResistance&r, &e${nickname}&r!`,
                    `${colors.gold}────────────────────`,
                    `${colors.white}Используйте &e/rp&r для регистрации в RolePlay`,
                    `${colors.white}Discord: &ediscord.gg/PDH6Frcs6u`,
                    `${colors.white}Правила клана в Discord`
                ];
                const frame = createFrame(`👋 ДОБРО ПОЖАЛОВАТЬ`, lines);
                sendClan(frame);
            } catch (err) {
                logger.error(`Ошибка приветствия ${nickname}:`, err);
            }
        }, 5000);
        
        if (logCallback) logCallback(`👋 ${nickname} присоединился`, 'success');
        
    } catch (error) {
        logger.error(`Ошибка вступления ${nickname}:`, error);
    }
}

async function handleKill(killer, victim, database) {
    try {
        logger.debug(`⚔️ ${killer} убил ${victim}`);
        
        const killerMember = await database.getPlayerByNickname(killer);
        if (killerMember) {
            database.getDb().prepare('UPDATE clan_members SET kills = kills + 1 WHERE minecraft_nick = ?').run(killer);
        }
        
        const victimMember = await database.getPlayerByNickname(victim);
        if (victimMember) {
            database.getDb().prepare('UPDATE clan_members SET deaths = deaths + 1 WHERE minecraft_nick = ?').run(victim);
        }
    } catch (err) {
        logger.error(`Ошибка убийства: ${killer} -> ${victim}`, err);
    }
}

async function handleClanMessage(bot, player, text, database, logCallback, sendPrivate, sendClan, getRealName) {
    try {
        let cleanPlayer = player;
        if (cleanPlayer.startsWith('~~')) {
            const real = getRealName(cleanPlayer);
            if (real !== cleanPlayer) cleanPlayer = real;
        }
        
        const cleanText = sanitizeMessage(text);
        
        logger.debug(`💬 [КЛАН] ${cleanPlayer}: ${cleanText.substring(0, 50)}`);
        
        try {
            database.getDb().prepare('INSERT INTO clan_chat_logs (player, message) VALUES (?, ?)').run(cleanPlayer, cleanText);
        } catch (e) {}
        
        const punishments = await database.getActivePunishments(cleanPlayer, 'mute');
        if (punishments.length > 0) {
            const mute = punishments[0];
            const remaining = Math.ceil((new Date(mute.expires_at) - new Date()) / 60000);
            setTimeout(() => {
                sendPrivate(cleanPlayer, formatMessage('🔇', `Вы замьючены. Осталось: ${utils.formatTime(remaining)}`, colors.yellow));
            }, 500);
            return;
        }
        
        const autoModEnabled = database.getSetting('auto_moderation_enabled') === 'true';
        if (autoModEnabled) {
            const spamResult = moderation.checkSpam(cleanPlayer, cleanText);
            
            if (spamResult.shouldMute) {
                const muteDuration = parseInt(database.getSetting('mute_duration') || '30');
                await moderation.mutePlayer(bot, cleanPlayer, muteDuration, 'Автоматический мут за спам', database, logCallback);
                return;
            } else if (spamResult.shouldWarn) {
                const lines = [
                    `${colors.white}${cleanPlayer}, &eпредупреждение ${spamResult.warnCount}/3&r за спам!`,
                    `${colors.gold}────────────────────`,
                    `${colors.white}При 3 предупреждениях вы получите автоматический мут`
                ];
                const frame = createFrame(`⚠️ ПРЕДУПРЕЖДЕНИЕ`, lines);
                sendClan(frame);
                if (logCallback) logCallback(`⚠️ ${cleanPlayer} получил предупреждение (${spamResult.warnCount}/3)`, 'warn');
            }
        }
        
        if (cleanText.startsWith('/')) {
            await commands.handleCommand(bot, cleanPlayer, cleanText, database, logCallback, sendPrivate, sendClan, getRealName);
        }
    } catch (err) {
        logger.error(`Ошибка обработки сообщения от ${player}:`, err);
    }
}

async function handlePrivateMessage(bot, sender, message, database, logCallback, sendPrivate, sendClan, getRealName) {
    let cleanSender = sender;
    if (cleanSender.startsWith('~~')) {
        const real = getRealName(cleanSender);
        if (real !== cleanSender) cleanSender = real;
    }
    
    const cleanMessage = sanitizeMessage(message);
    logger.debug(`💬 [ЛС] от ${cleanSender}: ${cleanMessage.substring(0, 50)}`);
    
    // Регистрация RP
    if (cleanMessage === '/rp') {
        await handleRpRegistration(bot, cleanSender, database, logCallback, sendPrivate);
        return;
    }
    
    // Проверка кода RP
    const rpState = rpRegistrationState.get(cleanSender);
    if (rpState && rpState.code === cleanMessage) {
        await completeRpRegistration(bot, cleanSender, database, logCallback, sendPrivate, sendClan);
        return;
    }
    
    // Привязка Discord
    const verifyMatch = cleanMessage.match(/^\/link\s+(\d{6})$/);
    if (verifyMatch) {
        await handleDiscordLink(bot, cleanSender, verifyMatch[1], database, logCallback, sendPrivate);
        return;
    }
    
    // Обработка команд
    if (cleanMessage.startsWith('/')) {
        await commands.handleCommand(bot, cleanSender, cleanMessage, database, logCallback, sendPrivate, sendClan, getRealName);
        return;
    }
    
    sendPrivate(cleanSender, formatMessage('ℹ️', 'Неизвестная команда. Используйте /help', colors.yellow));
}

async function handleRpRegistration(bot, player, database, logCallback, sendPrivate) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не состоите в клане!', colors.red));
        return;
    }
    
    const existing = await database.getRPPlayer(player);
    if (existing) {
        sendPrivate(player, formatMessage('ℹ️', 'Вы уже зарегистрированы в RolePlay!', colors.yellow));
        return;
    }
    
    const code = generateRpCode();
    rpRegistrationState.set(player, { code, expiresAt: Date.now() + 300000 });
    
    const lines = [
        `${colors.white}Для регистрации в RolePlay введите код в ЛС!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Ваш код: ${colors.green}${colors.bold}${code}`,
        `${colors.white}Код действителен: ${colors.red}5 минут`,
        `${colors.gold}────────────────────`,
        `${colors.white}После регистрации вы получите ${colors.green}1000 ₽`
    ];
    const frame = createFrame(`📝 РЕГИСТРАЦИЯ RP`, lines);
    sendPrivate(player, frame);
    
    if (logCallback) logCallback(`📝 ${player} начал регистрацию в RP (код: ${code})`, 'info');
    
    setTimeout(() => {
        if (rpRegistrationState.get(player)?.code === code) {
            rpRegistrationState.delete(player);
            sendPrivate(player, formatMessage('⏰', 'Время регистрации истекло. Используйте /rp заново.', colors.yellow));
        }
    }, 300000);
}

async function completeRpRegistration(bot, player, database, logCallback, sendPrivate, sendClan) {
    const rpState = rpRegistrationState.get(player);
    if (!rpState) {
        sendPrivate(player, formatMessage('❌', 'Код истёк. Используйте /rp заново.', colors.red));
        return;
    }
    
    try {
        database.getDb().prepare(`
            INSERT INTO rp_players (minecraft_nick, money, rp_joined) 
            VALUES (?, ?, datetime('now'))
        `).run(player, 1000);
        
        const lines = [
            `${colors.white}Регистрация в RolePlay &aуспешно завершена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Начальный баланс: ${colors.green}1000 ₽`,
            `${colors.white}Теперь вы можете:`,
            `${colors.white}• Устраиваться на работу`,
            `${colors.white}• Покупать недвижимость`,
            `${colors.white}• Открывать бизнес`
        ];
        const frame = createFrame(`✅ РЕГИСТРАЦИЯ RP`, lines);
        sendPrivate(player, frame);
        
        const clanLines = [
            `${colors.white}Новый гражданин &e${player}&r вступил в RolePlay!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Добро пожаловать в город!`
        ];
        const clanFrame = createFrame(`🎉 НОВЫЙ ГРАЖДАНИН`, clanLines);
        sendClan(clanFrame);
        
        if (logCallback) logCallback(`✅ ${player} зарегистрировался в RP`, 'success');
        
        rpRegistrationState.delete(player);
    } catch (err) {
        logger.error(`Ошибка регистрации RP для ${player}:`, err);
        sendPrivate(player, formatMessage('❌', 'Ошибка регистрации. Попробуйте позже.', colors.red));
    }
}

async function handleDiscordLink(bot, player, code, database, logCallback, sendPrivate) {
    try {
        const verification = require('../discord/verification');
        const result = await verification.completeVerification(player, code, database, null);
        
        if (result.success) {
            const lines = [
                `${colors.white}Discord аккаунт &aуспешно привязан!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Теперь вы можете:`,
                `${colors.white}• Использовать команды из Discord`,
                `${colors.white}• Получать уведомления о событиях`,
                `${colors.white}• Участвовать в голосованиях`
            ];
            const frame = createFrame(`🔗 ПРИВЯЗКА DISCORD`, lines);
            sendPrivate(player, frame);
            
            if (logCallback) logCallback(`🔗 ${player} привязал Discord`, 'success');
            
            if (result.discordId) {
                database.getDb().prepare('UPDATE clan_members SET discord_id = ? WHERE minecraft_nick = ?').run(result.discordId, player);
            }
        } else {
            sendPrivate(player, formatMessage('❌', result.message, colors.red));
        }
    } catch (err) {
        logger.error(`Ошибка привязки Discord для ${player}:`, err);
        sendPrivate(player, formatMessage('❌', 'Ошибка привязки. Попробуйте позже.', colors.red));
    }
}

function handleRealnameResponse(bot, disguisedNick, realNick) {
    if (!global.disguisedNames) global.disguisedNames = new Map();
    global.disguisedNames.set(disguisedNick, realNick);
    logger.debug(`🔍 ${disguisedNick} является ${realNick}`);
}

module.exports = { handleMessage };