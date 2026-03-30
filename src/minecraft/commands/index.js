// src/minecraft/commands/index.js
const player = require('./player');
const staff = require('./staff');
const rp = require('./rp');
const org = require('./org');
const structures = require('./structures');
const ministers = require('./ministers');
const admin = require('./admin');

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

async function handleCommand(bot, playerName, message, db, logCallback, sendPrivate, sendClan, getRealName) {
    const args = message.trim().split(/\s+/);
    const cmd = args[0].toLowerCase().replace('/', '');
    
    try {
        const member = await db.getPlayerByNickname(playerName);
        const rpPlayer = await db.getRPPlayer(playerName);
        const staffRank = await db.getStaffRank(playerName);
        
        // ========== КОМАНДЫ ИГРОКОВ ==========
        if (cmd === 'help') {
            await player.help(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'balance') {
            await player.balance(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'pay') {
            await player.pay(bot, playerName, args, db, logCallback, sendPrivate, getRealName);
        } 
        else if (cmd === 'pass') {
            await player.pass(bot, playerName, args, db, logCallback, sendPrivate, getRealName);
        } 
        else if (cmd === 'id') {
            await player.id(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'ds' || cmd === 'discord') {
            await player.discord(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'idim') {
            await player.idim(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'keys') {
            await player.keys(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'fly') {
            await player.fly(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === '10t') {
            await player.tenThousand(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'rp') {
            await player.rp(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'link') {
            await player.link(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'buylicense') {
            await player.buyLicense(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'renewlicense') {
            await player.renewLicense(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'office' && args[1] === 'type') {
            await player.officeType(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'office' && args[1] === 'answer') {
            await player.officeAnswer(bot, playerName, args, db, logCallback, sendPrivate);
        }
        
        // ========== КОМАНДЫ СТРУКТУР ==========
        else if (cmd === 'search') {
            await structures.search(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'check') {
            await structures.check(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'fine') {
            await structures.fine(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'order') {
            await structures.order(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'tr' && args[1] === 'status') {
            await structures.trStatus(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'border') {
            await structures.border(bot, playerName, args, db, logCallback, sendPrivate, getRealName);
        } 
        else if (cmd === 'tr' && args.length >= 2 && args[1] !== 'status') {
            await structures.trSet(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'rc' && args[1] === 'status') {
            await structures.rcStatus(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'rc' && (args[1] === 'on' || args[1] === 'off')) {
            await structures.rcToggle(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'grade') {
            await structures.grade(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'im') {
            await structures.im(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'biz') {
            await structures.biz(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'office') {
            await structures.office(bot, playerName, args, db, logCallback, sendPrivate);
        }
        
        // ========== КОМАНДЫ ОРГАНИЗАЦИЙ ==========
        else if (cmd === 'org') {
            await org.org(bot, playerName, args, db, logCallback, sendPrivate, sendClan, getRealName);
        }
        
        // ========== КОМАНДЫ ПЕРСОНАЛА ==========
        else if (cmd === 'blacklist' || cmd === 'bl') {
            await staff.blacklist(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'kick') {
            await staff.kick(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'mute') {
            await staff.mute(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'admin' || cmd === 'a') {
            await admin.admin(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'awarn') {
            await staff.awarn(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'spam' || cmd === 'sp') {
            await staff.spam(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'r' && (args[1] === 'clan' || args[1] === 'chat')) {
            await staff.rClanChat(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'logs') {
            await staff.logs(bot, playerName, args, db, logCallback, sendPrivate);
        }
        
        // ========== КОМАНДЫ АДМИНИСТРИРОВАНИЯ RP ==========
        else if (cmd === 'arp') {
            await rp.arp(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        }
        
        // ========== КОМАНДЫ АДМИНИСТРАТОРОВ ==========
        else if (cmd === 'stopall') {
            await admin.stopall(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'reloadbd') {
            await admin.reloadbd(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        }
        
        // ========== КОМАНДЫ МИНИСТРОВ ==========
        else if (cmd === 'mintax') {
            await ministers.mintax(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'budget') {
            await ministers.budget(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'grant') {
            await ministers.grant(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        } 
        else if (cmd === 'armystatus') {
            await ministers.armystatus(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'mvdbudget') {
            await ministers.mvdbudget(bot, playerName, args, db, logCallback, sendPrivate);
        } 
        else if (cmd === 'mayor') {
            await ministers.mayor(bot, playerName, args, db, logCallback, sendPrivate, sendClan);
        }
        
        // ========== НЕИЗВЕСТНАЯ КОМАНДА ==========
        else {
            const shortCmd = cmd.length > 8 ? cmd.substring(0, 8) + '...' : cmd;
            const message = formatMessage('❌', `Неизвестная команда: &e/${shortCmd}&r. Используйте &e/help&r для списка команд.`, colors.red);
            sendPrivate(playerName, message);
        }
        
    } catch (error) {
        console.error(`Ошибка команды ${cmd}:`, error);
        const errorMessage = formatMessage('❌', `Ошибка выполнения команды. Попробуйте позже.`, colors.red);
        sendPrivate(playerName, errorMessage);
        if (logCallback) logCallback(`❌ Ошибка команды ${cmd} от ${playerName}: ${error.message}`, 'error');
    }
}

module.exports = { handleCommand };