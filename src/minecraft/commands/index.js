// src/minecraft/commands/index.js
// Центральный модуль для всех команд Minecraft бота

const playerCommands = require('./player');
const staffCommands = require('./staff');
const orgCommands = require('./org');
const adminCommands = require('./admin');
const rpCommands = require('./rp');
const propertyCommands = require('./property');
const orgLeaderCommands = require('./org_leader');
const ministryCommands = require('./ministry');

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

function initialize() {
    // ============================================
    // ИГРОВЫЕ КОМАНДЫ (ДЛЯ ВСЕХ)
    // ============================================
    registerCommand('player', 'balance', playerCommands.balance);
    registerCommand('player', 'bal', playerCommands.balance);
    registerCommand('player', 'money', playerCommands.balance);
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
    registerCommand('player', 'org', playerCommands.org);
    registerCommand('player', 'discord', playerCommands.discord);
    registerCommand('player', 'ds', playerCommands.discord);
    
    // ============================================
    // КОМАНДЫ ПЕРСОНАЛА
    // ============================================
    registerCommand('staff', 'mute', staffCommands.mute, 1);
    registerCommand('staff', 'kick', staffCommands.kick, 1);
    registerCommand('staff', 'blacklist', staffCommands.blacklist, 1);
    registerCommand('staff', 'bl', staffCommands.blacklist, 1);
    registerCommand('staff', 'awarn', staffCommands.awarn, 3);
    registerCommand('staff', 'spam', staffCommands.spam, 4);
    registerCommand('staff', 'r', staffCommands.r, 3);
    registerCommand('staff', 'logs', staffCommands.logs, 1);
    registerCommand('staff', 'check', staffCommands.check, 1);
    
    // ============================================
    // АДМИНИСТРАТИВНЫЕ КОМАНДЫ
    // ============================================
    registerCommand('admin', 'admin', adminCommands.admin, 6);
    registerCommand('admin', 'a', adminCommands.admin, 6);
    registerCommand('admin', 'stopall', adminCommands.stopall, 6);
    registerCommand('admin', 'reloadbd', adminCommands.reloadbd, 6);
    registerCommand('admin', 'wipe', adminCommands.wipe, 6);
    
    // ============================================
    // ROLEPLAY КОМАНДЫ
    // ============================================
    registerCommand('rp', 'arp', rpCommands.arp, 2);
    registerCommand('rp', 'duty', rpCommands.duty, 0);
    registerCommand('rp', 'status', rpCommands.status, 0);
    
    // ============================================
    // КОМАНДЫ ОРГАНИЗАЦИЙ
    // ============================================
    // Полиция
    registerCommand('org', 'search', orgCommands.search, 1);
    registerCommand('org', 'check', orgCommands.check, 1);
    registerCommand('org', 'fine', orgCommands.fine, 2);
    registerCommand('org', 'order', orgCommands.order, 4);
    // Армия
    registerCommand('org', 'tr', orgCommands.tr, 1);
    registerCommand('org', 'border', orgCommands.border, 1);
    // Больница
    registerCommand('org', 'redcode', orgCommands.redcode, 1);
    registerCommand('org', 'rc', orgCommands.redcode, 1);
    // Академия
    registerCommand('org', 'grade', orgCommands.grade, 3);
    
    // ============================================
    // КОМАНДЫ ИМУЩЕСТВА
    // ============================================
    registerCommand('property', 'im', propertyCommands.im, 0);
    registerCommand('property', 'imflag', propertyCommands.imflag, 0);
    registerCommand('property', 'imm', propertyCommands.imm, 0);
    registerCommand('property', 'imnalog', propertyCommands.imnalog, 0);
    registerCommand('property', 'biz', propertyCommands.biz, 0);
    registerCommand('property', 'office', propertyCommands.office, 0);
    
    // ============================================
    // КОМАНДЫ ЛИДЕРОВ ОРГАНИЗАЦИЙ
    // ============================================
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
    
    // ============================================
    // КОМАНДЫ МИНИСТРОВ
    // ============================================
    // Министр экономики
    registerCommand('ministry', 'tax', ministryCommands.taxSet, 0);
    registerCommand('ministry', 'taxlist', ministryCommands.taxList, 0);
    registerCommand('ministry', 'budget', ministryCommands.budget, 0);
    registerCommand('ministry', 'bonus', ministryCommands.bonus, 0);
    registerCommand('ministry', 'grant', ministryCommands.grant, 0);
    registerCommand('ministry', 'idset', ministryCommands.idSet, 0);
    registerCommand('ministry', 'imtake', ministryCommands.imTake, 0);
    // Министр обороны
    registerCommand('ministry', 'defense', ministryCommands.defenseBudget, 0);
    registerCommand('ministry', 'armystatus', ministryCommands.armyStatus, 0);
    // Министр МВД
    registerCommand('ministry', 'mvdbudget', ministryCommands.mvdBudget, 0);
    registerCommand('ministry', 'mvdstatus', ministryCommands.mvdStatus, 0);
    registerCommand('ministry', 'crimelist', ministryCommands.crimeList, 0);
    // Министр здравоохранения
    registerCommand('ministry', 'healthbudget', ministryCommands.healthBudget, 0);
    registerCommand('ministry', 'hospitalstatus', ministryCommands.hospitalStatus, 0);
    // Министр образования
    registerCommand('ministry', 'edubudget', ministryCommands.eduBudget, 0);
    registerCommand('ministry', 'academystatus', ministryCommands.academyStatus, 0);
    // Мэр
    registerCommand('ministry', 'mayorkick', ministryCommands.mayorKick, 0);
    
    // ============================================
    // АЛИАСЫ (СОКРАЩЕНИЯ)
    // ============================================
    registerAlias('balance', 'баланс');
    registerAlias('help', 'помощь');
    registerAlias('org', 'организация');
    registerAlias('discord', 'дс');
    registerAlias('paybonus', 'pb');
    registerAlias('redcode', 'rc');
}

// Выполнение команды
async function executeCommand(bot, sender, command, args, db, addLog) {
    const cmdName = command.toLowerCase();
    const cmd = commandMap.get(cmdName);
    
    if (!cmd) {
        bot.chat(`/msg ${sender} &4&l|&c Неизвестная команда. Используйте &e/help`);
        return false;
    }
    
    try {
        // Проверка прав (если требуется ранг)
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
        
        // Проверка остановки системы (для административных команд)
        if (cmd.category !== 'admin') {
            const isStopped = await db.getSetting('system_stopped');
            if (isStopped === 'true') {
                bot.chat(`/msg ${sender} &4&l|&c Система временно остановлена администратором`);
                return false;
            }
        }
        
        // Выполнение обработчика
        if (typeof cmd.handler === 'function') {
            await cmd.handler(bot, sender, args, db, addLog);
        } else {
            bot.chat(`/msg ${sender} &4&l|&c Ошибка: обработчик команды не найден`);
        }
        return true;
        
    } catch (error) {
        bot.chat(`/msg ${sender} &4&l|&c Ошибка выполнения команды: ${error.message}`);
        if (addLog) addLog(`❌ Ошибка команды ${command}: ${error.message}`, 'error');
        return false;
    }
}

// Получение списка команд для помощи
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

// Инициализация при загрузке
initialize();

module.exports = {
    executeCommand,
    getHelpList,
    registerCommand,
    registerAlias,
    commandMap
};