// src/minecraft/chatHandler.js — Обработчик чата Minecraft бота Resistance City v5.0.0
// Анализирует все сообщения из чата, определяет тип сообщения и направляет
// в соответствующие обработчики: команды, клан-чат, ЛС, заявки, убийства

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ПРЯМОЕ ПОДКЛЮЧЕНИЕ КОМАНД — ГАРАНТИРОВАННО РАБОТАЕТ
let commandProcessor = null;
try {
    commandProcessor = require('./commands/index');
    console.log('[CHAT-HANDLER] commandProcessor ЗАГРУЖЕН');
    console.log('[CHAT-HANDLER] processCommand = ' + (typeof commandProcessor.processCommand));
} catch(e) {
    console.log('[CHAT-HANDLER] ОШИБКА загрузки команд: ' + e.message);
    console.log(e.stack);
}

// ==================== КЭШ ДЛЯ АВТОМОДЕРАЦИИ ====================
const messageCache = new Map();
const joinLeaveCache = new Map();
const commandSpamCache = new Map();

// ==================== ССЫЛКИ НА ДРУГИЕ МОДУЛИ (устанавливаются при инициализации) ====================
let moderationModule = null;
let verificationModule = null;

/**
 * Установить ссылки на модули
 */
function setModules(modules) {
    if (modules.commandProcessor) commandProcessor = modules.commandProcessor;
    if (modules.moderationModule) moderationModule = modules.moderationModule;
    if (modules.verificationModule) verificationModule = modules.verificationModule;
}

// ==================== ОСНОВНОЙ ОБРАБОТЧИК ====================
function handleMessage(bot, message, jsonMsg, isBackup = false) {
    console.log('[CHAT-IN] ' + JSON.stringify(message));
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return;
    }

    const trimmedMessage = message.trim();

    // Пропускаем сообщения от самого бота
    if (isBotMessage(trimmedMessage, bot.username)) {
        return;
    }

    // ==================== СНАЧАЛА ЗАЯВКИ, ВХОДЫ, ВЫХОДЫ ====================

    // 1. Заявка в клан (ПРОВЕРЯЕМ ПЕРВОЙ!)
    if (trimmedMessage.includes('подал заявку на вступление в ваш клан')) {
        const match = trimmedMessage.match(/Игрок\s+(\S+)\s+подал заявку/);
        if (match) {
            const username = match[1];
            logger.info(`ЗАЯВКА ОТ: ${username} — ПРИНИМАЕМ МГНОВЕННО!`);
            // Мгновенное принятие без setTimeout
            bot.chat('/c accept ' + username);
            return;
        }
    }

    // 2. Вход в клан
    if (trimmedMessage.includes('присоединился к клану')) {
    const match = trimmedMessage.match(/(\S+)\s+присоединился к клану/);
    if (match) {
        const username = match[1];
        logger.info(`ВОШЁЛ В КЛАН: ${username}`);
        
        // Добавляем в БД
        try { 
            db.members.add(username); 
        } catch(e) {
            logger.error(`Ошибка добавления в БД: ${e.message}`);
        }
        
        // Выдаём начальный ранг ИГРОКУ (тому кто вошёл)
        setTimeout(() => {
            bot.chat(`/c rank ${username} ${config.clan.defaultRank}`);
            logger.info(`Выдан ранг для ${username}: ${config.clan.defaultRank}`);
        }, 1500);
        
        // Приветствие в клановый чат
        setTimeout(() => {
            bot.chat(`/cc ${utils.formatClanMessage(`&f ${username}&a присоединился к Resistance! Добро пожаловать в клан!`)}`);
            bot.chat(`/cc ${utils.formatClanMessage(`&e Для ознакомления с проектом, телепортируйся - &b/warp info`)}`);
        }, 3000);
        
        return;
    }
}

    // 3. Выход из клана
    // 3. Выход из клана
if (trimmedMessage.includes('покинул клан')) {
    const match = trimmedMessage.match(/(\S+)\s+покинул клан/);
    if (match) {
        const username = match[1];
        logger.info(`ВЫШЕЛ ИЗ КЛАНА: ${username}`);
        
        // Удаляем из БД
        try { 
            db.members.removeFromClan(username);
        } catch(e) {
            logger.error(`Ошибка удаления из БД: ${e.message}`);
        }
        
        // Если был RP-участником — деактивируем
        try {
            const rpMember = db.rpMembers.get(username);
            if (rpMember && rpMember.is_active === 1) {
                db.rpMembers.removeRp(username);
            }
        } catch(e) {}
        
        // Случайное прощальное сообщение
        const goodbyeMessages = [
            ` ${username}, нам очень жаль что вы покинули нас...`,
            
            ` ${username}, спасибо что были с нами! Надеемся увидеть вас снова!`,

            ` ${username}, честь имеем! Мы сохраним ваше место в истории клана.`,

            ` ${username}, вы навсегда в истории клана! Каждый ушедший оставляет след.Мы будем помнить вас.`,

            ` ${username}, удачи на просторах! Куда бы вы ни пошли — помните о Resistance.Всегда рады видеть вас снова.`,

            ` ${username}, до новых встреч! Спасибо за время проведённое вместе.`,

            ` ${username}, вы часть нашей истории! Каждая глава когда-то заканчивается. Но новую можно начать снова.`,
        ];
        
        const randomMessage = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];
        
        // Отправляем в ЛС
        setTimeout(() => {
            try {
                bot.chat(`/msg ${username} ${randomMessage}`);
                logger.info(`Отправлено прощальное сообщение для ${username}`);
            } catch(e) {
                logger.error(`Ошибка отправки ЛС для ${username}: ${e.message}`);
            }
        }, 1000);
        
        // Сообщение в клановый чат
        setTimeout(() => {
            bot.chat(`/cc ${utils.formatClanMessage(`y ${username} покинул клан Resistance. Мы будем скучать!`)}`);
        }, 2000);
        
        return;
    }
}
    // 4. Убийство
    if (trimmedMessage.includes('убил игрока')) {
        const match = trimmedMessage.match(/(\S+)\s+убил игрока\s+(\S+)/);
        if (match) {
            handleKill(bot, { killer: match[1], victim: match[2] }, trimmedMessage);
            return;
        }
    }

    // 5. Кик из клана
    if (trimmedMessage.includes('был исключён из клана')) {
        const match = trimmedMessage.match(/Игрок\s+(\S+)\s+был исключён/);
        if (match) {
            handleClanKick(bot, { username: match[1] }, trimmedMessage);
            return;
        }
    }

    // ==================== ПОТОМ ЧАТ ====================

    // 6. Клановый чат
    // 6. Клановый чат
    if (trimmedMessage.startsWith('КЛАН:')) {
        // Пробуем с рангом: "КЛАН: Ранг Никнейм: Сообщение"
        var rankMatch = trimmedMessage.match(/^КЛАН:\s+(.+?)\s+(\S+):\s+(.+)$/);
        if (rankMatch) {
            // Есть ранг
            handleClanMessage(bot, {
                username: rankMatch[2],
                rank: rankMatch[1],
                message: rankMatch[3].trim()
            }, trimmedMessage, isBackup);
            return;
        }
        
        // Без ранга: "КЛАН: Никнейм: Сообщение"
        var simpleMatch = trimmedMessage.match(/^КЛАН:\s+(\S+):\s+(.+)$/);
        if (simpleMatch) {
            handleClanMessage(bot, {
                username: simpleMatch[1],
                rank: null,
                message: simpleMatch[2].trim()
            }, trimmedMessage, isBackup);
            return;
        }
    }

    // 7. Личное сообщение
    if (trimmedMessage.startsWith('[*] [')) {
        const pmMatch = trimmedMessage.match(/^\[.*?\]\s*\[(\S+)\s*->\s*я\]\s*(.+)$/);
        if (pmMatch) {
            handlePrivateMessage(bot, {
                sender: pmMatch[1].replace(/^~~/, ''),
                message: pmMatch[2].trim(),
                isNickChanged: pmMatch[1].startsWith('~~'),
                changedNick: pmMatch[1].startsWith('~~') ? pmMatch[1].replace(/^~~/, '') : null
            }, trimmedMessage, isBackup);
            return;
        }
    }

    // 8. Результат /realname
    if (trimmedMessage.includes('является')) {
        const match = trimmedMessage.match(/~~(\S+)\s+является\s+(\S+)/);
        if (match) {
            handleRealnameResult(bot, { changedNick: match[1], realUsername: match[2] }, trimmedMessage);
            return;
        }
    }

    // 9. Информация о регионе
    if (trimmedMessage.includes('Участники:')) {
        const match = trimmedMessage.match(/Участники:\s+(.+)$/);
        if (match && bot._pendingRegionCheck) {
            handleRegionInfo(bot, { members: match[1].split(',').map(m => m.trim()) }, trimmedMessage);
            return;
        }
    }

    // 10. Системные сообщения сервера
    handleSystemMessage(bot, trimmedMessage, isBackup);
}

// ==================== ОБРАБОТЧИК КЛАНОВОГО ЧАТА ====================
function handleClanMessage(bot, clanMsg, rawMessage, isBackup) {
    const username = clanMsg.username;

    // Логирование в БД
    try {
        db.chatLogs.logClanChat(username, clanMsg.message);
    } catch (error) {
        logger.error(`Ошибка логирования кланового чата: ${error.message}`);
    }

    // Автомодерация кланового чата
    if (config.autoMod.enabled && !isBackup && moderationModule) {
        const modResult = checkAutoModeration(username, 'clan_chat');
        if (modResult.action === 'mute') {
            moderationModule.mutePlayer(bot, username, config.autoMod.muteDurationMinutes,
                'Автомодерация: спам в клановом чате', 'AutoMod');
            bot.chat(`/cc &#CA4E4E[AutoMod] ${username} заглушен на ${config.autoMod.muteDurationMinutes} мин за спам`);
            return;
        }
        if (modResult.action === 'warn') {
            const warns = modResult.warnCount;
            bot.chat(`/cc &#FFB800[AutoMod] ${username}, предупреждение ${warns}/${config.autoMod.warnCountBeforeMute} за спам`);
        }
    }

    // НЕ ОБРАБАТЫВАЕМ КОМАНДЫ В КЛАН-ЧАТЕ
    // if (clanMsg.message.startsWith('/')) { ... } — УДАЛИТЬ

    // Если это резервный бот — просто логируем
    if (isBackup) {
        logger.debug(`[CLAN] ${username}: ${clanMsg.message}`);
        return;
    }


    // Проверка на рекламу (если включена авто-реклама)
    if (config.autoMod.clanAdEnabled || db.settings.getBoolean('clan_ad_enabled')) {
        const adTriggers = ['http://', 'https://', 'discord.gg', 'vk.com', 'youtube.com', '.ru/', '.com/'];
        const hasAd = adTriggers.some(trigger => clanMsg.message.toLowerCase().includes(trigger));

        if (hasAd) {
            // Проверяем, разрешена ли реклама в клановом чате
            const chatAdEnabled = db.settings.getBoolean('chat_ad_enabled');
            if (!chatAdEnabled) {
                // Предупреждение
                bot.chat(`/cc &#FFB800⚠ ${username}, реклама в клановом чате запрещена!`);
            }
        }
    }
}

// ==================== ОБРАБОТЧИК ЛИЧНЫХ СООБЩЕНИЙ ====================
function handlePrivateMessage(bot, privateMsg, rawMessage, isBackup) {
    if (isBackup) {
        // Резервный бот не обрабатывает ЛС
        return;
    }

    let sender = privateMsg.sender;
    const messageContent = privateMsg.message;

    // Если никнейм изменён, нужно получить реальный
    if (privateMsg.isNickChanged) {
        const changedNick = privateMsg.changedNick;
        // Проверяем в кэше
        if (nicknameCache.has(changedNick.toLowerCase())) {
            sender = nicknameCache.get(changedNick.toLowerCase());
        } else {
            // Запрашиваем /realname
            bot._pendingRealname = {
                changedNick: changedNick,
                originalMessage: privateMsg,
                timestamp: Date.now(),
            };
            bot.chat(`/realname ${changedNick}`);
            return; // Ждём результат /realname
        }
    }

    // Логирование в БД
    try {
        db.chatLogs.logPrivateMessage(sender, bot.username, messageContent);
    } catch (error) {
        logger.error(`Ошибка логирования ЛС: ${error.message}`);
    }

    // Автомодерация ЛС
    if (config.autoMod.enabled && moderationModule) {
        const modResult = checkAutoModeration(sender, 'private_message');
        if (modResult.action === 'mute') {
            moderationModule.mutePlayer(bot, sender, config.autoMod.muteDurationMinutes,
                'Автомодерация: спам в ЛС', 'AutoMod');
            bot.chat(`/msg ${sender} &#CA4E4EВы заглушены на ${config.autoMod.muteDurationMinutes} мин за спам`);
            return;
        }
    }

    // Проверка активных мутов в ЛС
    const activePunishments = db.punishments.getActive(sender);
    const hasPrivateMute = activePunishments.some(p =>
        p.type === 'pm_mute' && p.is_active === 1
    );
    if (hasPrivateMute) {
        // Игнорируем сообщение
        logger.debug(`Игнорировано сообщение от заглушенного игрока: ${sender}`);
        return;
    }

    // Проверка, является ли сообщение командой
    if (messageContent.startsWith('/')) {
        handleClanCommand(bot, sender, messageContent, 'private_message', isBackup);
        return;
    }

    // Проверка на код верификации
    if (messageContent.length >= 4 && messageContent.length <= 6 && /^\d+$/.test(messageContent)) {
    console.log('[RP-VERIFY] Получен потенциальный код RP от ' + sender + ': ' + messageContent);
    
    // Проверяем через модуль rp
    var rpModule;
    try {
        rpModule = require('./commands/rp');
        if (rpModule && typeof rpModule.checkRpVerification === 'function') {
            var verifyResult = rpModule.checkRpVerification(bot, sender, messageContent);
            console.log('[RP-VERIFY] Результат проверки: ' + JSON.stringify(verifyResult));
        } else {
            console.log('[RP-VERIFY] rpModule.checkRpVerification не найдена');
        }
    } catch(e) {
        console.log('[RP-VERIFY] Ошибка загрузки модуля RP: ' + e.message);
    }
    return;
}

    // Проверка на ответ по штрафу
    if (messageContent.toLowerCase() === 'да' || messageContent.toLowerCase() === 'нет') {
        handleFineResponse(bot, sender, messageContent.toLowerCase());
        return;
    }

    // Обычное личное сообщение
    logger.debug(`[MSG] ${sender} -> бот: ${messageContent}`);
}

// ==================== КЭШ НИКНЕЙМОВ ====================
const nicknameCache = new Map();

// ==================== ОБРАБОТЧИК РЕЗУЛЬТАТА /REALNAME ====================
function handleRealnameResult(bot, result, rawMessage) {
    const changedNick = result.changedNick.toLowerCase();
    const realUsername = result.realUsername;

    // Сохраняем в кэш
    nicknameCache.set(changedNick, realUsername);

    // Очищаем кэш через 5 минут
    setTimeout(() => {
        nicknameCache.delete(changedNick);
    }, 300000);

    // Если был ожидающий запрос
    if (bot._pendingRealname && bot._pendingRealname.changedNick.toLowerCase() === changedNick) {
        const pendingMsg = bot._pendingRealname.originalMessage;
        bot._pendingRealname = null;

        // Повторно обрабатываем сообщение с реальным ником
        const newPrivateMsg = {
            ...pendingMsg,
            sender: realUsername,
            isNickChanged: false,
        };
        handlePrivateMessage(bot, newPrivateMsg, pendingMsg.raw, false);
    }

    logger.debug(`Realname: ${changedNick} -> ${realUsername}`);
}

// ==================== ОБРАБОТЧИК КОМАНД В ЧАТЕ ====================
function handleClanCommand(bot, username, command, source, isBackup) {
    if (isBackup) {
        // Резервный бот не обрабатывает команды
        if (source === 'private_message') {
            bot.chat(`/msg ${username} &#CA4E4EБот в режиме ограниченной функциональности. Команды недоступны.`);
        }
        return;
    }

    // Проверка глобальной заморозки
    if (db.settings.getBoolean('global_freeze') && !permissions.isAdmin(username, db)) {
        if (source === 'private_message') {
            bot.chat(`/msg ${username} &#CA4E4EСистема заморожена. Команды временно недоступны.`);
        }
        return;
    }

    // Анти-спам команд
    const spamCheck = checkCommandSpam(username);
    if (spamCheck.blocked) {
        if (source === 'private_message') {
            bot.chat(`/msg ${username} &#CA4E4EСлишком много команд! Подождите немного.`);
        }
        return;
    }

    // Парсинг команды
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Проверка прав доступа
    const accessCheck = permissions.checkCommandAccess(username, `/${cmd}`, db);
    if (!accessCheck.allowed) {
        if (source === 'private_message') {
            bot.chat(`/msg ${username} ${accessCheck.message}`);
        } else if (source === 'clan_chat') {
            bot.chat(`/cc ${utils.formatError(username, accessCheck.message.replace(/&[0-9a-fk-or]/gi, ''))}`);
        }
        return;
    }

    // Передача в обработчик команд
    if (commandProcessor && typeof commandProcessor.processCommand === 'function') {
    commandProcessor.processCommand(bot, username, cmd, args, source);
} else {
    console.log('[CMD-ERROR] commandProcessor недоступен');
    bot.chat('/msg ' + username + ' &cКоманды временно недоступны.');
}
}

// ==================== ОБРАБОТЧИК ЗАЯВКИ В КЛАН ====================
function handleClanApplication(bot, application, rawMessage) {
    const username = application.username;
    logger.info(`Заявка в клан от: ${username}`);

    // Проверка на спам заявками
    const spamCheck = checkJoinLeaveSpam(username, 'application');
    if (spamCheck.blocked) {
        logger.warn(`Заявка от ${username} заблокирована (спам)`);
        return;
    }

    // Проверка чёрного списка
    const activePunishments = db.punishments.getActive(username);
    const isBlacklisted = activePunishments.some(p => p.type === 'blacklist' && p.is_active === 1);
    if (isBlacklisted) {
        logger.info(`Заявка от ${username} отклонена (чёрный список)`);
        return;
    }

    // МГНОВЕННОЕ ПРИНЯТИЕ — без setTimeout!
    bot.chat(`/c accept ${username}`);
    logger.info(`Заявка от ${username} принята`);

    // Добавляем в БД сразу
    try {
        db.members.add(username);
    } catch (error) {
        logger.error(`Ошибка добавления в БД: ${error.message}`);
    }

    // Ранг и приветствие — с небольшой задержкой (серверу нужно время обработать accept)
    setTimeout(() => {
        bot.chat(`/c rank ${username} ${config.clan.defaultRank}`);
        bot.chat(`/cc ${utils.formatClanMessage(`&#76C519${username} присоединился к клану! Добро пожаловать!`)}`);
        bot.chat(`/cc ${utils.formatClanMessage(`&#80C4C5Используйте &#FFB800/rp &#80C4C5для регистрации в RolePlay`)}`);
    }, 1500);
}

// ==================== ОБРАБОТЧИК ВХОДА В КЛАН ====================
function handleClanJoin(bot, joinInfo, rawMessage) {
    const username = joinInfo.username;

    logger.info(`${username} присоединился к клану`);

    // Проверка на спам входом/выходом
    const spamCheck = checkJoinLeaveSpam(username, 'join');
    if (spamCheck.blocked) {
        // Добавляем в чёрный список при превышении лимита
        if (spamCheck.count >= config.autoMod.blacklistJoinLeaveLimit) {
            try {
                db.punishments.add(username, 'blacklist',
                    config.autoMod.blacklistDurationHours * 60,
                    'Спам входом/выходом из клана', 'AutoMod');
                bot.chat(`/cc &#CA4E4E${username} добавлен в чёрный список за спам входом/выходом`);
                logger.warn(`${username} в чёрном списке за спам входом/выходом`);
            } catch (error) {
                logger.error(`Ошибка добавления в ЧС: ${error.message}`);
            }
        }
        return;
    }

    // Добавляем в БД
    try {
        db.members.add(username);
    } catch (error) {
        logger.error(`Ошибка добавления в БД: ${error.message}`);
    }
}

// ==================== ОБРАБОТЧИК ВЫХОДА ИЗ КЛАНА ====================
function handleClanLeave(bot, leaveInfo, rawMessage) {
    const username = leaveInfo.username;

    logger.info(`${username} покинул клан`);

    // Проверка на спам
    const spamCheck = checkJoinLeaveSpam(username, 'leave');
    if (spamCheck.blocked) {
        if (spamCheck.count >= config.autoMod.blacklistJoinLeaveLimit) {
            try {
                db.punishments.add(username, 'blacklist',
                    config.autoMod.blacklistDurationHours * 60,
                    'Спам входом/выходом из клана', 'AutoMod');
                bot.chat(`/cc &#CA4E4E${username} добавлен в чёрный список за спам входом/выходом`);
            } catch (error) {
                logger.error(`Ошибка добавления в ЧС: ${error.message}`);
            }
        }
        return;
    }

    // Обновляем БД
    try {
        db.members.removeFromClan(username);

        // Если был RP-участником — деактивируем
        const rpMember = db.rpMembers.get(username);
        if (rpMember && rpMember.is_active === 1) {
            db.rpMembers.removeRp(username);
            // Уведомление в ЛС
            bot.chat(`/msg ${username} &#CA4E4EВы покинули клан. Ваш RolePlay профиль деактивирован.`);
        }
    } catch (error) {
        logger.error(`Ошибка обновления БД при выходе из клана: ${error.message}`);
    }
}

// ==================== ОБРАБОТЧИК КИКА ИЗ КЛАНА ====================
function handleClanKick(bot, kickInfo, rawMessage) {
    const username = kickInfo.username;

    logger.info(`${username} исключён из клана`);

    try {
        db.members.removeFromClan(username);

        const rpMember = db.rpMembers.get(username);
        if (rpMember && rpMember.is_active === 1) {
            db.rpMembers.removeRp(username);
        }

        // Освобождаем имущество
        const properties = db.properties.getOwned(username);
        properties.forEach(prop => {
            db.properties.remove(prop.property_id);
        });
    } catch (error) {
        logger.error(`Ошибка обработки кика из клана: ${error.message}`);
    }
}

// ==================== ОБРАБОТЧИК УБИЙСТВ ====================
function handleKill(bot, kill, rawMessage) {
    const killer = kill.killer;
    const victim = kill.victim;

    logger.debug(`Убийство: ${killer} -> ${victim}`);

    try {
        // Проверяем, в клане ли убийца
        const killerMember = db.members.get(killer);
        if (killerMember && killerMember.is_in_clan === 1) {
            db.members.updateStats(killer, 1, 0);
        }

        // Проверяем, в клане ли жертва
        const victimMember = db.members.get(victim);
        if (victimMember && victimMember.is_in_clan === 1) {
            db.members.updateStats(victim, 0, 1);
        }
    } catch (error) {
        logger.error(`Ошибка обновления статистики убийств: ${error.message}`);
    }
}

// ==================== ОБРАБОТЧИК ИНФОРМАЦИИ О РЕГИОНЕ ====================
function handleRegionInfo(bot, regionInfo, rawMessage) {
    if (!bot._pendingRegionCheck) return;

    const callback = bot._pendingRegionCheck.callback;
    bot._pendingRegionCheck = null;

    if (callback && typeof callback === 'function') {
        callback(regionInfo.members);
    }
}

// ==================== ОБРАБОТЧИК СИСТЕМНЫХ СООБЩЕНИЙ ====================
function handleSystemMessage(bot, message, isBackup) {
    // Проверка на перезагрузку сервера
    if (message.includes('перезагрузка') || message.includes('restart') || message.includes('Перезагрузка')) {
        logger.warn('Обнаружено сообщение о перезагрузке сервера');
        bot._serverRestartDetected = true;
    }

    // Проверка на онлайн игрока (/seen или подобное)
    if (message.includes('сейчас на сервере') || message.includes('онлайн')) {
        // Может использоваться для отслеживания онлайна
    }

    // Проверка на сообщения о платежах
    if (message.includes('支付') || message.includes('оплата') || message.includes('платёж')) {
        logger.debug(`Системное сообщение о платеже: ${message}`);
    }
}

// ==================== АВТОМОДЕРАЦИЯ ====================
function checkAutoModeration(username, source) {
    const key = `${username.toLowerCase()}_${source}`;
    const now = Date.now();

    if (!messageCache.has(key)) {
        messageCache.set(key, {
            messages: [{ timestamp: now }],
            warnCount: 0,
            muteUntil: null,
        });
        return { action: 'none', warnCount: 0 };
    }

    const cache = messageCache.get(key);

    // Проверка мута
    if (cache.muteUntil && cache.muteUntil > now) {
        return { action: 'mute', reason: 'already_muted' };
    }

    // Очистка старых сообщений (старше 1 минуты)
    cache.messages = cache.messages.filter(m => now - m.timestamp < 60000);

    // Добавление нового сообщения
    cache.messages.push({ timestamp: now });

    // Проверка лимита
    if (cache.messages.length > config.autoMod.maxMessagesPerMinute) {
        cache.warnCount++;

        if (cache.warnCount >= config.autoMod.warnCountBeforeMute) {
            cache.muteUntil = now + config.autoMod.muteDurationMinutes * 60000;
            cache.messages = [];
            return { action: 'mute', warnCount: cache.warnCount };
        }

        return { action: 'warn', warnCount: cache.warnCount };
    }

    return { action: 'none', warnCount: cache.warnCount };
}

// ==================== ПРОВЕРКА НА СПАМ КОМАНДАМИ ====================
function checkCommandSpam(username) {
    const key = username.toLowerCase();
    const now = Date.now();

    if (!commandSpamCache.has(key)) {
        commandSpamCache.set(key, {
            commands: [{ timestamp: now }],
            blockedUntil: null,
        });
        return { blocked: false, count: 1 };
    }

    const cache = commandSpamCache.get(key);

    // Проверка блокировки
    if (cache.blockedUntil && cache.blockedUntil > now) {
        return { blocked: true };
    }

    // Очистка старых команд (старше 10 секунд)
    cache.commands = cache.commands.filter(c => now - c.timestamp < 10000);
    cache.commands.push({ timestamp: now });

    // Если больше 5 команд за 10 секунд — блокируем на 30 секунд
    if (cache.commands.length > 5) {
        cache.blockedUntil = now + 30000;
        return { blocked: true };
    }

    return { blocked: false, count: cache.commands.length };
}

// ==================== ПРОВЕРКА НА СПАМ ВХОДОМ/ВЫХОДОМ ====================
function checkJoinLeaveSpam(username, action) {
    const key = username.toLowerCase();
    const now = Date.now();

    if (!joinLeaveCache.has(key)) {
        joinLeaveCache.set(key, {
            actions: [{ action, timestamp: now }],
            blockedUntil: null,
        });
        return { blocked: false, count: 1 };
    }

    const cache = joinLeaveCache.get(key);

    // Очистка старых действий (старше 12 часов)
    const resetMs = config.autoMod.blacklistResetHours * 3600000;
    cache.actions = cache.actions.filter(a => now - a.timestamp < resetMs);
    cache.actions.push({ action, timestamp: now });

    if (cache.actions.length >= config.autoMod.blacklistJoinLeaveLimit) {
        cache.blockedUntil = now + config.autoMod.blacklistDurationHours * 3600000;
        return { blocked: true, count: cache.actions.length };
    }

    return { blocked: false, count: cache.actions.length };
}

// ==================== ОБРАБОТКА КОДА ВЕРИФИКАЦИИ ====================
function handleVerificationCode(bot, username, code) {
    if (!verificationModule) return;

    try {
        const result = db.verification.verify(code, username);
        if (result) {
            bot.chat(`/msg ${username} &#76C519✅ Верификация успешна! Ваш Discord аккаунт привязан.`);
            logger.info(`Верификация: ${username} привязан к Discord ${result.discord_id}`);
        } else {
            bot.chat(`/msg ${username} &#CA4E4E❌ Неверный или истёкший код верификации.`);
        }
    } catch (error) {
        logger.error(`Ошибка верификации: ${error.message}`);
    }
}

// ==================== ОБРАБОТКА ОТВЕТА ПО ШТРАФУ ====================
function handleFineResponse(bot, username, response) {
    try {
        const pendingFines = db.fines.getPending(username);
        if (pendingFines.length === 0) return;

        const lastFine = pendingFines[0];

        if (response === 'да') {
            // Проверяем баланс
            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.balance < lastFine.amount) {
                bot.chat(`/msg ${username} &#CA4E4EНедостаточно средств! Штраф: ${utils.formatMoney(lastFine.amount)}`);
                db.fines.respond(lastFine.id, 'insufficient_funds');
                return;
            }

            // Списываем деньги
            db.rpMembers.updateBalance(username, -lastFine.amount, 'fine_payment',
                `Оплата штрафа #${lastFine.id}`, 'SYSTEM');
            db.fines.respond(lastFine.id, 'yes');

            bot.chat(`/msg ${username} &#76C519✅ Штраф ${utils.formatMoney(lastFine.amount)} оплачен.`);
            logger.info(`${username} оплатил штраф ${utils.formatMoney(lastFine.amount)}`);
        } else {
            db.fines.respond(lastFine.id, 'no');
            bot.chat(`/msg ${username} &#FFB800⚠ Штраф отклонён. Полиция уведомлена.`);
            logger.info(`${username} отклонил штраф`);
        }
    } catch (error) {
        logger.error(`Ошибка обработки штрафа: ${error.message}`);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Проверить, является ли сообщение от самого бота
 */
function isBotMessage(message, botUsername) {
    if (!botUsername) return false;

    // Исключаем сообщения бота, чтобы не было рекурсии
    const botPatterns = [
        `[${botUsername}]`,
        `${botUsername}:`,
        `${botUsername} »`,
        `» ${botUsername}`,
    ];

    return botPatterns.some(pattern => message.includes(pattern));
}

/**
 * Проверить на дубликаты системных сообщений
 */
function isDuplicateSystemMessage(message) {
    const key = message.substring(0, 50);
    const now = Date.now();

    if (systemMessageCache.has(key)) {
        const lastTime = systemMessageCache.get(key);
        if (now - lastTime < 5000) {
            return true;
        }
    }

    systemMessageCache.set(key, now);

    // Очистка старых записей
    if (systemMessageCache.size > 100) {
        const oldest = [...systemMessageCache.entries()]
            .sort((a, b) => a[1] - b[1])[0];
        if (oldest) systemMessageCache.delete(oldest[0]);
    }

    return false;
}

const systemMessageCache = new Map();

// ==================== ОЧИСТКА КЭША ====================
setInterval(() => {
    const now = Date.now();

    // Очистка кэша сообщений
    for (const [key, value] of messageCache) {
        if (value.muteUntil && value.muteUntil < now) {
            value.muteUntil = null;
            value.warnCount = 0;
            value.messages = [];
        }
    }

    // Очистка кэша спама команд
    for (const [key, value] of commandSpamCache) {
        if (value.blockedUntil && value.blockedUntil < now) {
            value.blockedUntil = null;
            value.commands = [];
        }
    }

    // Очистка кэша входов/выходов
    for (const [key, value] of joinLeaveCache) {
        if (value.blockedUntil && value.blockedUntil < now) {
            joinLeaveCache.delete(key);
        }
    }

    // Очистка кэша никнеймов (каждые 10 минут)
    if (Math.floor(now / 600000) !== Math.floor((now - 60000) / 600000)) {
        nicknameCache.clear();
    }
}, 60000);

module.exports = handleMessage;
module.exports.setModules = setModules;
module.exports.getMessageCache = () => messageCache;
module.exports.getJoinLeaveCache = () => joinLeaveCache;