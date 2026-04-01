// src/minecraft/commands/index.js
// Центральный модуль для всех команд Minecraft бота

const playerCommands = require('./player');
const staffCommands = require('./staff');
const orgCommands = require('./org');
const adminCommands = require('./admin');
const rpCommands = require('./rp');
const propertyCommands = require('./property');

// Карта всех команд для быстрого доступа
const commandMap = new Map();

// Регистрация команд
function registerCommand(category, commandName, handler, requiredRank = 0) {
    const key = commandName.toLowerCase();
    commandMap.set(key, {
        category,
        handler,
        requiredRank,
        aliases: []
    });
}

function registerAlias(commandName, alias) {
    const cmd = commandMap.get(commandName.toLowerCase());
    if (cmd) {
        commandMap.set(alias.toLowerCase(), {
            ...cmd,
            isAlias: true,
            parentCommand: commandName
        });
    }
}

// Инициализация всех команд
function initialize() {
    // Игровые команды (для всех)
    // В функции initialize() добавьте:
    registerCommand('player', 'rp', playerCommands.rp, 0);
    registerCommand('player', 'balance', playerCommands.balance);
    registerCommand('player', 'bal', playerCommands.balance);
    registerCommand('player', 'money', playerCommands.balance);
    registerCommand('player', 'pay', playerCommands.pay);
    registerCommand('player', 'pass', playerCommands.pass);
    registerCommand('player', 'id', playerCommands.id);
    registerCommand('player', 'keys', playerCommands.keys);
    registerCommand('player', 'idim', playerCommands.idim);
    registerCommand('player', 'help', playerCommands.help);
    registerCommand('player', 'link', playerCommands.link);
    registerCommand('player', 'fly', playerCommands.fly);
    registerCommand('player', '10t', playerCommands.tenT);
    registerCommand('player', 'org', playerCommands.org);
    registerCommand('player', 'discord', playerCommands.discord);
    registerCommand('player', 'ds', playerCommands.discord);
    
    // Команды персонала
    registerCommand('staff', 'mute', staffCommands.mute, 1);
    registerCommand('staff', 'kick', staffCommands.kick, 1);
    registerCommand('staff', 'blacklist', staffCommands.blacklist, 1);
    registerCommand('staff', 'bl', staffCommands.blacklist, 1);
    registerCommand('staff', 'awarn', staffCommands.awarn, 2);
    registerCommand('staff', 'spam', staffCommands.spam, 4);
    registerCommand('staff', 'r', staffCommands.r, 3);
    registerCommand('staff', 'logs', staffCommands.logs, 1);
    registerCommand('staff', 'check', staffCommands.check, 1);
    
    // Административные команды
    registerCommand('admin', 'admin', adminCommands.admin, 6);
    registerCommand('admin', 'a', adminCommands.admin, 6);
    registerCommand('admin', 'stopall', adminCommands.stopall, 6);
    registerCommand('admin', 'reloadbd', adminCommands.reloadbd, 6);
    registerCommand('admin', 'wipe', adminCommands.wipe, 6);
    
    // RolePlay команды
    registerCommand('rp', 'arp', rpCommands.arp, 2);
    registerCommand('rp', 'org', rpCommands.org, 0);
    registerCommand('rp', 'search', rpCommands.search, 1);
    registerCommand('rp', 'fine', rpCommands.fine, 2);
    registerCommand('rp', 'order', rpCommands.order, 4);
    registerCommand('rp', 'tr', rpCommands.tr, 1);
    registerCommand('rp', 'border', rpCommands.border, 1);
    registerCommand('rp', 'redcode', rpCommands.redcode, 1);
    registerCommand('rp', 'rc', rpCommands.redcode, 1);
    registerCommand('rp', 'grade', rpCommands.grade, 3);
    registerCommand('rp', 'duty', rpCommands.duty, 0);
    registerCommand('rp', 'status', rpCommands.status, 0);
    
    // Команды имущества
    registerCommand('property', 'im', propertyCommands.im, 0);
    registerCommand('property', 'imflag', propertyCommands.imflag, 0);
    registerCommand('property', 'imm', propertyCommands.imm, 0);
    registerCommand('property', 'imnalog', propertyCommands.imnalog, 0);
    registerCommand('property', 'biz', propertyCommands.biz, 0);
    registerCommand('property', 'office', propertyCommands.office, 0);
    
    // Алиасы
    registerAlias('balance', 'баланс');
    registerAlias('help', 'помощь');
    registerAlias('org', 'организация');
}

// Выполнение команды
// ============================================
// ВЫПОЛНЕНИЕ КОМАНД
// ============================================

async function executeCommand(sender, command, args) {
    const fullCommand = command.toLowerCase();
    
    // Импортируем модуль команд
    let commands;
    try {
        commands = require('./commands');
    } catch (err) {
        this.addLog(`❌ Ошибка загрузки команд: ${err.message}`, 'error');
        this.bot.chat(`/msg ${sender} &cСистема команд временно недоступна.`);
        return;
    }
    
    // Проверяем, есть ли команда в commandMap
    const cmd = commands.commandMap?.get(fullCommand);
    
    if (!cmd) {
        this.bot.chat(`/msg ${sender} &cНеизвестная команда. Используйте /help для списка команд.`);
        return;
    }
    
    try {
        // Проверка прав (если требуется ранг)
        if (cmd.requiredRank > 0) {
            let staffRank;
            try {
                staffRank = await this.db.getStaffRank?.(sender) || { rank_level: 0 };
            } catch (err) {
                staffRank = { rank_level: 0 };
            }
            
            if (staffRank.rank_level < cmd.requiredRank) {
                this.bot.chat(`/msg ${sender} &cУ вас недостаточно прав для использования этой команды! (требуется ранг ${cmd.requiredRank})`);
                return;
            }
        }
        
        // Выполнение обработчика
        if (typeof cmd.handler === 'function') {
            await cmd.handler(this.bot, sender, args, this.db, this.addLog);
        } else {
            this.bot.chat(`/msg ${sender} &cОшибка: обработчик команды не найден.`);
        }
        
    } catch (error) {
        this.addLog(`❌ Ошибка команды ${command}: ${error.message}`, 'error');
        this.bot.chat(`/msg ${sender} &cОшибка выполнения команды: ${error.message}`);
    }
}

// Получение списка команд для помощи
function getHelpList(rank = 0) {
    const categories = {
        player: [],
        staff: [],
        admin: [],
        rp: [],
        property: []
    };
    
    for (const [name, cmd] of commandMap) {
        if (cmd.isAlias) continue;
        if (cmd.requiredRank <= rank) {
            categories[cmd.category].push(name);
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