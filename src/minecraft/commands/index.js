// src/minecraft/commands/index.js
// ПОЛНАЯ РЕГИСТРАЦИЯ ВСЕХ КОМАНД

const playerCommands = require('./player');
const staffCommands = require('./staff');
const rpCommands = require('./rp');
const orgCommands = require('./org');
const orgLeaderCommands = require('./org_leader');
const ministryCommands = require('./ministry');
const adminCommands = require('./admin');
const propertyCommands = require('./property');
const { checkCooldown, setCooldown } = require('./cooldown');

const commandMap = new Map();

function registerCommand(category, commandName, handler, requiredRank = 0) {
    commandMap.set(commandName.toLowerCase(), { category, handler, requiredRank });
}

function registerAlias(commandName, alias) {
    const cmd = commandMap.get(commandName.toLowerCase());
    if (cmd) {
        commandMap.set(alias.toLowerCase(), { ...cmd, isAlias: true, parentCommand: commandName });
    }
}

// Вспомогательная функция для выполнения с кулдауном для КАЖДОЙ подкоманды
async function executeWithCooldown(bot, sender, commandKey, handler, ...args) {
    const cooldownCheck = checkCooldown(sender, commandKey);
    if (!cooldownCheck.allowed) {
        bot.chat(`/msg ${sender} &4&l|&c Подождите &e${cooldownCheck.remaining}&c сек перед повторным использованием команды &e${commandKey}`);
        return false;
    }
    
    await handler(...args);
    setCooldown(sender, commandKey);
    return true;
}

function initialize() {
    // ========== ИГРОВЫЕ КОМАНДЫ ==========
    registerCommand('player', 'balance', playerCommands.balance);
    registerCommand('player', 'bal', playerCommands.balance);
    registerCommand('player', 'pay', playerCommands.pay);
    registerCommand('player', 'pass', playerCommands.pass);
    registerCommand('player', 'id', playerCommands.id);
    registerCommand('player', 'keys', playerCommands.keys);
    registerCommand('player', 'idim', playerCommands.idim);
    registerCommand('player', 'help', playerCommands.help);
    registerCommand('player', 'rp', playerCommands.rp);
    registerCommand('player', 'link', playerCommands.link);
    registerCommand('player', 'fly', playerCommands.fly);
    registerCommand('player', '10t', playerCommands.tenT);
    registerCommand('player', 'discord', playerCommands.discord);
    registerCommand('player', 'ds', playerCommands.discord);
    
    // ========== КОМАНДЫ ПЕРСОНАЛА ==========
    registerCommand('staff', 'mute', staffCommands.mute, 1);
    registerCommand('staff', 'kick', staffCommands.kick, 1);
    registerCommand('staff', 'blacklist', staffCommands.blacklist, 1);
    registerCommand('staff', 'bl', staffCommands.blacklist, 1);
    registerCommand('staff', 'check', staffCommands.check, 1);
    registerCommand('staff', 'awarn', staffCommands.awarn, 3);
    registerCommand('staff', 'spam', staffCommands.spam, 4);
    registerCommand('staff', 'r', staffCommands.r, 3);
    registerCommand('staff', 'logs', staffCommands.logs, 1);
    registerCommand('staff', 'unfreeze', staffCommands.unfreeze, 1);  // ДОБАВЛЕНО
    
    // ========== ROLEPLAY КОМАНДЫ ==========
    registerCommand('rp', 'duty', rpCommands.duty, 0);
    registerCommand('rp', 'status', rpCommands.status, 0);
    registerCommand('rp', 'tr', rpCommands.tr, 0);
    registerCommand('rp', 'border', rpCommands.border, 0);
    registerCommand('rp', 'search', rpCommands.search, 0);
    registerCommand('rp', 'fine', rpCommands.fine, 0);
    registerCommand('rp', 'order', rpCommands.order, 0);
    registerCommand('rp', 'redcode', rpCommands.redcode, 0);
    registerCommand('rp', 'rc', rpCommands.redcode, 0);
    registerCommand('rp', 'grade', rpCommands.grade, 0);
    registerCommand('rp', 'arp', rpCommands.arp, 2);
    
    // ========== ГЛАВНАЯ КОМАНДА ОРГАНИЗАЦИЙ ==========
    registerCommand('org', 'org', handleOrgCommand, 0);
    
    // ========== КОМАНДЫ ИМУЩЕСТВА ==========
    registerCommand('property', 'im', propertyCommands.im, 0);
    registerCommand('property', 'imflag', propertyCommands.imflag, 0);
    registerCommand('property', 'imm', propertyCommands.imm, 0);
    registerCommand('property', 'imnalog', propertyCommands.imnalog, 0);
    registerCommand('property', 'biz', propertyCommands.biz, 0);
    registerCommand('property', 'office', propertyCommands.office, 0);
    
    // ========== КОМАНДЫ ЛИДЕРОВ ОРГАНИЗАЦИЙ ==========
    registerCommand('org_leader', 'invite', orgLeaderCommands.invite, 0);
    registerCommand('org_leader', 'kick', orgLeaderCommands.kick, 0);
    registerCommand('org_leader', 'rank', orgLeaderCommands.rankSet, 0);
    registerCommand('org_leader', 'rankinfo', orgLeaderCommands.rankinfo, 0);
    registerCommand('org_leader', 'setsalary', orgLeaderCommands.setsalary, 0);
    registerCommand('org_leader', 'paybonus', orgLeaderCommands.paybonus, 0);
    registerCommand('org_leader', 'pb', orgLeaderCommands.paybonus, 0);
    registerCommand('org_leader', 'vacation', orgLeaderCommands.vacationList, 0);
    registerCommand('org_leader', 'dutylist', orgLeaderCommands.dutyList, 0);
    registerCommand('org_leader', 'warn', orgLeaderCommands.warn, 0);
    registerCommand('org_leader', 'unwarn', orgLeaderCommands.unwarn, 0);
    registerCommand('org_leader', 'fine', orgLeaderCommands.fine, 0);
    
    // ========== КОМАНДЫ МИНИСТРОВ ==========
    registerCommand('ministry', 'tax', ministryCommands.taxSet, 0);
    registerCommand('ministry', 'taxlist', ministryCommands.taxList, 0);
    registerCommand('ministry', 'budget', ministryCommands.budget, 0);
    registerCommand('ministry', 'bonus', ministryCommands.bonus, 0);
    registerCommand('ministry', 'grant', ministryCommands.grant, 0);
    registerCommand('ministry', 'idset', ministryCommands.idSet, 0);
    registerCommand('ministry', 'imtake', ministryCommands.imTake, 0);
    registerCommand('ministry', 'defense', ministryCommands.defenseBudget, 0);
    registerCommand('ministry', 'armystatus', ministryCommands.armyStatus, 0);
    registerCommand('ministry', 'mvdbudget', ministryCommands.mvdBudget, 0);
    registerCommand('ministry', 'mvdstatus', ministryCommands.mvdStatus, 0);
    registerCommand('ministry', 'crimelist', ministryCommands.crimeList, 0);
    registerCommand('ministry', 'healthbudget', ministryCommands.healthBudget, 0);
    registerCommand('ministry', 'hospitalstatus', ministryCommands.hospitalStatus, 0);
    registerCommand('ministry', 'edubudget', ministryCommands.eduBudget, 0);
    registerCommand('ministry', 'academystatus', ministryCommands.academyStatus, 0);
    registerCommand('ministry', 'mayorkick', ministryCommands.mayorKick, 0);
    
    // ========== АДМИНИСТРАТИВНЫЕ КОМАНДЫ ==========
    registerCommand('admin', 'admin', adminCommands.admin, 6);
    registerCommand('admin', 'a', adminCommands.admin, 6);
    registerCommand('admin', 'stopall', adminCommands.stopall, 6);
    registerCommand('admin', 'reloadbd', adminCommands.reloadbd, 6);
    registerCommand('admin', 'wipe', adminCommands.wipe, 6);
    
    // ========== АЛИАСЫ ==========
    registerAlias('balance', 'баланс');
    registerAlias('help', 'помощь');
    registerAlias('discord', 'дс');
    registerAlias('unfreeze', 'разморозить');
}

// ============================================
// ОБРАБОТЧИК /org С ОТДЕЛЬНЫМ КД ДЛЯ КАЖДОЙ ПОДКОМАНДЫ
// ============================================

async function handleOrgCommand(bot, sender, args, db, addLog) {
    if (!args || args.length === 0) {
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/org [подкоманда]`);
        bot.chat(`/msg ${sender} &7&l|&f Подкоманды: &epolice, army, hospital, academy, o, ministry`);
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    const restArgs = args.slice(1);
    
    // ========== ПОЛИЦИЯ ==========
    if (subCommand === 'police') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org police [search/check/fine/order]`);
            return;
        }
        
        const cooldownKey = `org_police_${action}`;
        
        switch(action) {
            case 'search':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.search, bot, sender, actionArgs, db);
                break;
            case 'check':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.check, bot, sender, actionArgs, db);
                break;
            case 'fine':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.fine, bot, sender, actionArgs, db, addLog);
                break;
            case 'order':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.order, bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org police [search/check/fine/order]`);
        }
        return;
    }
    
    // ========== АРМИЯ ==========
    if (subCommand === 'army') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org army [tr/border]`);
            return;
        }
        
        const cooldownKey = `org_army_${action}`;
        
        switch(action) {
            case 'tr':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.tr, bot, sender, actionArgs, db);
                break;
            case 'border':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.border, bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org army [tr/border]`);
        }
        return;
    }
    
    // ========== БОЛЬНИЦА ==========
    if (subCommand === 'hospital') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org hospital [redcode]`);
            return;
        }
        
        const cooldownKey = `org_hospital_${action}`;
        
        switch(action) {
            case 'redcode':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.redcode, bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org hospital [redcode]`);
        }
        return;
    }
    
    // ========== АКАДЕМИЯ ==========
    if (subCommand === 'academy') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org academy [grade]`);
            return;
        }
        
        const cooldownKey = `org_academy_${action}`;
        
        switch(action) {
            case 'grade':
                await executeWithCooldown(bot, sender, cooldownKey, orgCommands.grade, bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org academy [grade]`);
        }
        return;
    }
    
    // ========== ЛИДЕРЫ (/org o) ==========
    if (subCommand === 'o') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org o [invite/accept/kick/rank/setsalary/paybonus/vacation/duty/warn/unwarn/fine]`);
            return;
        }
        
        let cooldownKey = `org_o_${action}`;
        
        if (action === 'rank' && actionArgs[0] === 'set') {
            cooldownKey = `org_o_rank_set`;
        }
        
        switch(action) {
            case 'invite':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.invite, bot, sender, actionArgs, db, addLog);
                break;
            case 'accept':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.accept, bot, sender, actionArgs, db, addLog);
                break;
            case 'kick':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.kick, bot, sender, actionArgs, db, addLog);
                break;
            case 'rank':
                if (actionArgs[0] === 'set') {
                    await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.rankSet, bot, sender, actionArgs.slice(1), db, addLog);
                } else {
                    await executeWithCooldown(bot, sender, `org_o_rankinfo`, orgLeaderCommands.rankinfo, bot, sender, actionArgs, db, addLog);
                }
                break;
            case 'setsalary':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.setsalary, bot, sender, actionArgs, db, addLog);
                break;
            case 'paybonus':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.paybonus, bot, sender, actionArgs, db, addLog);
                break;
            case 'vacation':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.vacationList, bot, sender, actionArgs, db, addLog);
                break;
            case 'duty':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.dutyList, bot, sender, actionArgs, db, addLog);
                break;
            case 'warn':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.warn, bot, sender, actionArgs, db, addLog);
                break;
            case 'unwarn':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.unwarn, bot, sender, actionArgs, db, addLog);
                break;
            case 'fine':
                await executeWithCooldown(bot, sender, cooldownKey, orgLeaderCommands.fine, bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org o [invite/accept/kick/rank/setsalary/paybonus/vacation/duty/warn/unwarn/fine]`);
        }
        return;
    }
    
    // ========== МИНИСТРЫ (/org ministry) ==========
    if (subCommand === 'ministry') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        if (!action) {
            bot.chat(`/msg ${sender} &7&l|&f /org ministry [tax/budget/bonus/grant/idset/imtake/defense/armystatus/mvdbudget/mvdstatus/crimelist/healthbudget/hospitalstatus/edubudget/academystatus/mayorkick/cityinfo/setbudget]`);
            return;
        }
        
        let cooldownKey = `org_ministry_${action}`;
        
        if (action === 'tax') {
            if (actionArgs[0] === 'set') {
                cooldownKey = `org_ministry_tax_set`;
            } else if (actionArgs[0] === 'list') {
                cooldownKey = `org_ministry_tax_list`;
            }
        }
        
        switch(action) {
            case 'tax':
                if (actionArgs[0] === 'set') {
                    await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.taxSet, bot, sender, actionArgs.slice(1), db, addLog);
                } else if (actionArgs[0] === 'list') {
                    await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.taxList, bot, sender, actionArgs.slice(1), db);
                } else {
                    bot.chat(`/msg ${sender} &7&l|&f /org ministry tax [set/list]`);
                }
                break;
            case 'budget':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.budget, bot, sender, actionArgs, db);
                break;
            case 'bonus':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.bonus, bot, sender, actionArgs, db, addLog);
                break;
            case 'grant':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.grant, bot, sender, actionArgs, db, addLog);
                break;
            case 'idset':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.idSet, bot, sender, actionArgs, db, addLog);
                break;
            case 'imtake':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.imTake, bot, sender, actionArgs, db, addLog);
                break;
            case 'defense':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.defenseBudget, bot, sender, actionArgs, db);
                break;
            case 'armystatus':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.armyStatus, bot, sender, actionArgs, db);
                break;
            case 'mvdbudget':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.mvdBudget, bot, sender, actionArgs, db);
                break;
            case 'mvdstatus':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.mvdStatus, bot, sender, actionArgs, db);
                break;
            case 'crimelist':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.crimeList, bot, sender, actionArgs, db);
                break;
            case 'healthbudget':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.healthBudget, bot, sender, actionArgs, db);
                break;
            case 'hospitalstatus':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.hospitalStatus, bot, sender, actionArgs, db);
                break;
            case 'edubudget':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.eduBudget, bot, sender, actionArgs, db);
                break;
            case 'academystatus':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.academyStatus, bot, sender, actionArgs, db);
                break;
            case 'mayorkick':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.mayorKick, bot, sender, actionArgs, db, addLog);
                break;
            case 'cityinfo':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.cityInfo, bot, sender, actionArgs, db);
                break;
            case 'setbudget':
                await executeWithCooldown(bot, sender, cooldownKey, ministryCommands.setBudget, bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org ministry [tax/budget/bonus/grant/idset/imtake/defense/armystatus/mvdbudget/mvdstatus/crimelist/healthbudget/hospitalstatus/edubudget/academystatus/mayorkick/cityinfo/setbudget]`);
        }
        return;
    }
    
    bot.chat(`/msg ${sender} &7&l|&f Неизвестная подкоманда: &e${subCommand}`);
    bot.chat(`/msg ${sender} &7&l|&f Доступно: &epolice, army, hospital, academy, o, ministry`);
}

// ============================================
// ВЫПОЛНЕНИЕ КОМАНДЫ
// ============================================

async function executeCommand(bot, sender, command, args, db, addLog) {
    const cmdName = command.toLowerCase();
    const cmd = commandMap.get(cmdName);
    
    if (!cmd) {
        bot.chat(`/msg ${sender} &4&l|&c Неизвестная команда. Используйте &e/help`);
        return false;
    }
    
    try {
        if (cmd.requiredRank > 0) {
            let staffRank;
            try {
                staffRank = await db.getStaffRank(sender);
            } catch (err) {
                staffRank = { rank_level: 0 };
            }
            
            if (staffRank.rank_level < cmd.requiredRank) {
                bot.chat(`/msg ${sender} &4&l|&c У вас недостаточно прав для использования этой команды!`);
                return false;
            }
        }
        
        if (cmd.category !== 'admin') {
            const isStopped = await db.getSetting('system_stopped');
            if (isStopped === 'true') {
                bot.chat(`/msg ${sender} &4&l|&c Система временно остановлена администратором`);
                return false;
            }
        }
        
        if (typeof cmd.handler === 'function') {
            await cmd.handler(bot, sender, args, db, addLog);
        } else {
            bot.chat(`/msg ${sender} &4&l|&c Ошибка: обработчик команды не найден`);
        }
        return true;
        
    } catch (error) {
        console.error(`Ошибка выполнения команды ${command}:`, error);
        bot.chat(`/msg ${sender} &4&l|&c Ошибка выполнения команды: ${error.message}`);
        if (addLog) addLog(`Ошибка команды ${command}: ${error.message}`, 'error');
        return false;
    }
}

function getHelpList(rank = 0) {
    const categories = {
        player: [],
        staff: [],
        admin: [],
        rp: [],
        org: [],
        property: [],
        org_leader: [],
        ministry: []
    };
    
    for (const [name, cmd] of commandMap) {
        if (cmd.isAlias) continue;
        if (cmd.requiredRank <= rank) {
            if (categories[cmd.category]) {
                categories[cmd.category].push(name);
            }
        }
    }
    
    return categories;
}

initialize();

module.exports = {
    executeCommand,
    getHelpList,
    registerCommand,
    registerAlias,
    commandMap,
    handleOrgCommand
};