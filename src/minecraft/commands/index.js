// src/minecraft/commands/index.js — Роутер команд Minecraft бота Resistance City v5.0.0
// Принимает команды из чата, определяет категорию и направляет в нужный обработчик

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

// ==================== ИМПОРТ ОБРАБОТЧИКОВ КОМАНД ====================
const playerCommands = require('./player');
const adminCommands = require('./admin');
const rpCommands = require('./rp');
const propertyCommands = require('./property');
const licenseCommands = require('./license');
const orgCommands = require('./org');
const orgLeaderCommands = require('./org_leader');
const staffCommands = require('./staff');
const ministryCommands = require('./ministry');

// ==================== КЭШ КУЛДАУНОВ ====================
const cooldownCache = new Map();

// ==================== КАРТА КОМАНД ====================
const COMMAND_ROUTER = {
    // Игроки
    'help': { handler: 'player', method: 'help', minAccess: 'clan_member' },
    'pay': { handler: 'player', method: 'pay', minAccess: 'rp_member', cooldown: 15 },
    'balance': { handler: 'player', method: 'balance', minAccess: 'rp_member' },
    'bal': { handler: 'player', method: 'balance', minAccess: 'rp_member' },
    'pass': { handler: 'player', method: 'passport', minAccess: 'rp_member' },
    'id': { handler: 'player', method: 'playerId', minAccess: 'rp_member' },
    'ds': { handler: 'player', method: 'discord', minAccess: 'clan_member' },
    'discord': { handler: 'player', method: 'discord', minAccess: 'clan_member' },
    'idim': { handler: 'player', method: 'propertyInfo', minAccess: 'clan_member' },
    'keys': { handler: 'player', method: 'myProperties', minAccess: 'rp_member' },
    'fly': { handler: 'player', method: 'fly', minAccess: 'clan_member', cooldown: 120 },
    '10t': { handler: 'player', method: 'money10t', minAccess: 'clan_member', cooldown: 300 },
    'link': { handler: 'player', method: 'linkDiscord', minAccess: 'clan_member' },
    'rp': { handler: 'rp', method: 'registerRp', minAccess: 'clan_member' },
    'leavecity': { handler: 'player', method: 'leaveCity', minAccess: 'rp_member' },
    'entercity': { handler: 'player', method: 'enterCity', minAccess: 'rp_member' },

    // Имущество
    'im': { handler: 'property', method: 'propertyManage', minAccess: 'rp_member' },

    // Бизнесы
    'biz': { handler: 'property', method: 'businessManage', minAccess: 'rp_member' },

    // Офисы
    'office': { handler: 'property', method: 'officeManage', minAccess: 'rp_member' },
    'of': { handler: 'property', method: 'officeManage', minAccess: 'rp_member' },

    // Организации
    'org': { handler: 'org', method: 'orgManage', minAccess: 'rp_member' },
    'o': { handler: 'org', method: 'orgManage', minAccess: 'rp_member' },

    // Лидер организации
    'orgleader': { handler: 'org_leader', method: 'leaderManage', minAccess: 'rp_member' },

    // Лицензии
    'license': { handler: 'license', method: 'licenseManage', minAccess: 'rp_member' },
    'lic': { handler: 'license', method: 'licenseManage', minAccess: 'rp_member' },

    // Полиция
    'search': { handler: 'org', method: 'policeSearch', minAccess: 'rp_member' },
    'check': { handler: 'org', method: 'policeCheck', minAccess: 'rp_member' },
    'fine': { handler: 'org', method: 'policeFine', minAccess: 'rp_member' },
    'order': { handler: 'org', method: 'policeOrder', minAccess: 'rp_member' },

    // Армия
    'tr': { handler: 'org', method: 'armyThreatLevel', minAccess: 'rp_member' },
    'border': { handler: 'org', method: 'armyBorderCheck', minAccess: 'rp_member' },

    // Больница
    'redcode': { handler: 'org', method: 'hospitalRedCode', minAccess: 'rp_member' },
    'rc': { handler: 'org', method: 'hospitalRedCode', minAccess: 'rp_member' },
    'heal': { handler: 'org', method: 'hospitalHeal', minAccess: 'rp_member' },
    'medbook': { handler: 'org', method: 'hospitalMedBook', minAccess: 'rp_member' },

    // Академия
    'grade': { handler: 'org', method: 'academyGrade', minAccess: 'rp_member' },
    'educate': { handler: 'org', method: 'academyEducate', minAccess: 'rp_member' },

    // Министры
    'tax': { handler: 'ministry', method: 'taxManage', minAccess: 'rp_member' },
    'budget': { handler: 'ministry', method: 'budgetManage', minAccess: 'rp_member' },
    'grant': { handler: 'ministry', method: 'grantManage', minAccess: 'rp_member' },
    'crime': { handler: 'ministry', method: 'crimeStats', minAccess: 'rp_member' },

    // Банды (ОПГ)
    'fr': { handler: 'player', method: 'gangManage', minAccess: 'rp_member' },
    'grab': { handler: 'player', method: 'robberyExecute', minAccess: 'rp_member' },

    // Админ-команды
    'admin': { handler: 'admin', method: 'adminManage', minAccess: 'curator' },
    'a': { handler: 'admin', method: 'adminManage', minAccess: 'curator' },
    'arp': { handler: 'admin', method: 'arpManage', minAccess: 'seniorModerator' },
    'blacklist': { handler: 'staff', method: 'blacklistManage', minAccess: 'moderator' },
    'bl': { handler: 'staff', method: 'blacklistManage', minAccess: 'moderator' },
    'kick': { handler: 'staff', method: 'kickManage', minAccess: 'moderator' },
    'mute': { handler: 'staff', method: 'muteManage', minAccess: 'moderator' },
    'awarn': { handler: 'staff', method: 'warnManage', minAccess: 'seniorModerator' },
    'spam': { handler: 'staff', method: 'spamSettings', minAccess: 'headModerator' },
    'sp': { handler: 'staff', method: 'spamSettings', minAccess: 'headModerator' },
    'r': { handler: 'staff', method: 'adSettings', minAccess: 'headModerator' },
    'logs': { handler: 'staff', method: 'viewLogs', minAccess: 'juniorModerator' },
    'stopall': { handler: 'admin', method: 'stopAll', minAccess: 'administrator' },
    'reloadbd': { handler: 'admin', method: 'reloadDb', minAccess: 'administrator' },
};

// ==================== ОСНОВНОЙ ОБРАБОТЧИК ====================
function processCommand(bot, username, command, args, source) {
    const cmdLower = command.toLowerCase();
    const route = COMMAND_ROUTER[cmdLower];

    // Неизвестная команда
    if (!route) {
        const errorMsg = utils.formatUnknownCommand(username, command);
        sendResponse(bot, username, errorMsg, source);
        return;
    }

    // Проверка кулдауна
    if (route.cooldown) {
        const cooldownCheck = checkCooldown(username, cmdLower, route.cooldown);
        if (cooldownCheck.onCooldown) {
            const msg = `${utils.botPrefix()}&#C58383 ${username}&#D4D4D4, подождите ещё ${cooldownCheck.remaining}с перед использованием &c'&#80C4C5/${command}&c'&r`;
            sendResponse(bot, username, msg, source);
            return;
        }
    }

    // Проверка прав доступа
    const accessCheck = checkAccess(username, route.minAccess);
    if (!accessCheck.allowed) {
        const msg = utils.formatNoPermission(username);
        sendResponse(bot, username, msg, source);
        return;
    }

    // Выполнение команды
    try {
        const handler = getHandler(route.handler);
        if (!handler || typeof handler[route.method] !== 'function') {
            logger.error(`Обработчик не найден: ${route.handler}.${route.method}`);
            const msg = utils.formatError(username, 'Команда временно недоступна');
            sendResponse(bot, username, msg, source);
            return;
        }

        const result = handler[route.method](bot, username, args, source);

        // Если команда вернула сообщение — отправляем
        if (result && typeof result === 'string') {
            sendResponse(bot, username, result, source);
        }

        // Устанавливаем кулдаун
        if (route.cooldown && result !== false) {
            setCooldown(username, cmdLower, route.cooldown);
        }

    } catch (error) {
        logger.error(`Ошибка выполнения команды /${command} от ${username}: ${error.message}`);
        logger.error(error.stack);
        const msg = utils.formatError(username, 'Произошла ошибка при выполнении команды');
        sendResponse(bot, username, msg, source);
    }
}

// ==================== ПОЛУЧЕНИЕ ОБРАБОТЧИКА ====================
function getHandler(handlerName) {
    switch (handlerName) {
        case 'player': return playerCommands;
        case 'admin': return adminCommands;
        case 'rp': return rpCommands;
        case 'property': return propertyCommands;
        case 'license': return licenseCommands;
        case 'org': return orgCommands;
        case 'org_leader': return orgLeaderCommands;
        case 'staff': return staffCommands;
        case 'ministry': return ministryCommands;
        default: return null;
    }
}

// ==================== ОТПРАВКА ОТВЕТА ====================
function sendResponse(bot, username, message, source) {
    if (!message) return;

    // Очищаем от Minecraft-цветов для логирования
    const cleanMessage = message.replace(/&[0-9a-fk-orx#]/gi, '').replace(/&#[0-9a-fA-F]{6}/g, '');

    // ВСЕГДА отправляем ответ в ЛС
    try {
        bot.chat('/msg ' + username + ' ' + message);
        logger.debug('[CMD RESPONSE -> ' + username + '] ' + cleanMessage);
    } catch (e) {
        logger.error('Ошибка отправки ЛС: ' + e.message);
    }
}

// ==================== ПРОВЕРКА ПРАВ ДОСТУПА ====================
function checkAccess(username, minAccess) {
    if (minAccess === 'all') return { allowed: true };

    const member = db.members.get(username);
    if (!member || member.is_in_clan !== 1) {
        return { allowed: false, reason: 'not_in_clan' };
    }

    // Проверка RP-статуса
    if (minAccess === 'rp_member') {
        const rpMember = db.rpMembers.get(username);
        if (!rpMember || rpMember.is_active !== 1) {
            return { allowed: false, reason: 'not_rp_member' };
        }
    }

    // Проверка прав персонала
    const staffRanks = ['moderator', 'juniorModerator', 'seniorModerator', 'headModerator', 'curator', 'administrator'];
    if (staffRanks.includes(minAccess)) {
        const staff = db.staff.get(username);
        if (!staff || staff.is_active !== 1) {
            return { allowed: false, reason: 'not_staff' };
        }

        const requiredLevel = permissions.STAFF_HIERARCHY[minAccess] || 0;
        const userLevel = permissions.STAFF_HIERARCHY[staff.rank] || 0;

        if (userLevel < requiredLevel) {
            return { allowed: false, reason: 'insufficient_rank' };
        }
    }

    return { allowed: true };
}

// ==================== КУЛДАУНЫ ====================
function checkCooldown(username, command, cooldownSeconds) {
    const key = `${username.toLowerCase()}_${command}`;

    if (cooldownCache.has(key)) {
        const expiresAt = cooldownCache.get(key);
        const now = Date.now();

        if (now < expiresAt) {
            const remaining = Math.ceil((expiresAt - now) / 1000);
            return { onCooldown: true, remaining };
        }
    }

    return { onCooldown: false, remaining: 0 };
}

function setCooldown(username, command, cooldownSeconds) {
    const key = `${username.toLowerCase()}_${command}`;
    const expiresAt = Date.now() + cooldownSeconds * 1000;
    cooldownCache.set(key, expiresAt);

    // Авто-очистка
    setTimeout(() => {
        cooldownCache.delete(key);
    }, cooldownSeconds * 1000);
}

// ==================== ОЧИСТКА КУЛДАУНОВ ====================
setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of cooldownCache) {
        if (now >= expiresAt) {
            cooldownCache.delete(key);
        }
    }
}, 60000);

module.exports = {
    processCommand,
    sendResponse,
    checkCooldown,
    COMMAND_ROUTER,
};