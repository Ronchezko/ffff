// src/minecraft/commands/staff.js
const utils = require('../../shared/utils');
const database = require('../../database');
const moderation = require('../moderation');

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

const RANK_ORDER = ['Мл.Модератор', 'Модератор', 'Ст.Модератор', 'Гл.Модератор', 'Куратор', 'Администратор'];

/**
 * /blacklist - управление чёрным списком клана
 * Доступно всем модераторам
 */
async function blacklist(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 3 || (args[0] !== 'add' && args[0] !== 'del')) {
        const lines = [
            `${colors.white}Управление чёрным списком`,
            `${colors.gold}────────────────────`,
            `${colors.white}Добавить: &e/blacklist add [ник] [время] [причина]`,
            `${colors.white}Удалить: &e/blacklist del [ник]`,
            `${colors.gold}────────────────────`,
            `${colors.white}Формат времени: &e30m&r, &e2h&r, &e1d`,
            `${colors.white}Доступно всем модераторам`
        ];
        const frame = createFrame(`🚫 ЧЁРНЫЙ СПИСОК`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const action = args[0].toLowerCase();
    let target = args[1];
    const duration = args[2];
    const reason = args.slice(3).join(' ') || 'Не указана';
    
    const staffRank = await database.getStaffRank(player);
    if (!staffRank) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для использования этой команды!', colors.red));
        return;
    }
    
    if (action === 'add') {
        const minutes = utils.parseTimeToMinutes(duration);
        if (!minutes) {
            sendPrivate(player, formatMessage('❌', 'Неверный формат времени. Используйте: &e30m&r, &e2h&r, &e1d', colors.red));
            return;
        }
        
        const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
        const expiresDate = new Date(expiresAt).toLocaleString('ru-RU');
        
        db.getDb().prepare(`
            INSERT INTO punishments (player, type, reason, issued_by, expires_at, active)
            VALUES (?, 'blacklist', ?, ?, ?, 1)
        `).run(target, reason, player, expiresAt);
        
        const lines = [
            `${colors.white}Игрок &e${target}&r добавлен в чёрный список!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}${reason}`,
            `${colors.white}Длительность: ${colors.yellow}${duration}`,
            `${colors.white}Истекает: ${colors.green}${expiresDate}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Выдал: ${colors.yellow}${player}`
        ];
        const frame = createFrame(`🚫 ЧЁРНЫЙ СПИСОК`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`🚫 ${player} добавил ${target} в ЧС на ${duration}`, 'warn');
        
    } else if (action === 'del') {
        const punishments = await database.getActivePunishments(target, 'blacklist');
        if (punishments.length === 0) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в чёрном списке.`, colors.red));
            return;
        }
        
        for (const p of punishments) {
            db.getDb().prepare('UPDATE punishments SET active = 0 WHERE id = ?').run(p.id);
        }
        
        const lines = [
            `${colors.white}Игрок &e${target}&r удалён из чёрного списка!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Удалил: ${colors.yellow}${player}`
        ];
        const frame = createFrame(`✅ СНЯТИЕ ЧС`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`✅ ${player} убрал ${target} из ЧС`, 'info');
    }
}

/**
 * /kick - исключение игрока из клана
 * Доступно всем модераторам
 */
async function kick(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 1) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/kick [ник] [причина]`, colors.red));
        return;
    }
    
    let target = args[0];
    const reason = args.slice(1).join(' ') || 'Нарушение правил';
    
    const staffRank = await database.getStaffRank(player);
    if (!staffRank) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для использования этой команды!', colors.red));
        return;
    }
    
    const member = await database.getPlayerByNickname(target);
    if (!member) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    await database.removeClanMember(target);
    
    const lines = [
        `${colors.white}Игрок &e${target}&r исключён из клана!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Причина: ${colors.red}${reason}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Исключил: ${colors.yellow}${player}`
    ];
    const frame = createFrame(`👢 ИСКЛЮЧЕНИЕ`, lines);
    sendClan(frame);
    
    setTimeout(() => {
        sendPrivate(target, formatMessage('⚠️', `Вы исключены из клана. Причина: &e${reason}`, colors.yellow));
    }, 500);
    
    if (logCallback) logCallback(`👢 ${player} кикнул ${target}: ${reason}`, 'warn');
}

/**
 * /mute - мут в клановом чате
 * Доступно всем модераторам
 */
async function mute(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2) {
        const lines = [
            `${colors.white}Выдача мута в клановом чате`,
            `${colors.gold}────────────────────`,
            `${colors.white}Использование: &e/mute [ник] [время] [причина]`,
            `${colors.gold}────────────────────`,
            `${colors.white}Формат времени: &e30m&r, &e2h&r, &e1d`
        ];
        const frame = createFrame(`🔇 МУТ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    let target = args[0];
    const duration = args[1];
    const reason = args.slice(2).join(' ') || 'Нарушение';
    
    const staffRank = await database.getStaffRank(player);
    if (!staffRank) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для использования этой команды!', colors.red));
        return;
    }
    
    const minutes = utils.parseTimeToMinutes(duration);
    if (!minutes) {
        sendPrivate(player, formatMessage('❌', 'Неверный формат времени. Используйте: &e30m&r, &e2h&r, &e1d', colors.red));
        return;
    }
    
    const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
    const expiresDate = new Date(expiresAt).toLocaleString('ru-RU');
    
    db.getDb().prepare(`
        INSERT INTO punishments (player, type, reason, issued_by, expires_at, active)
        VALUES (?, 'mute', ?, ?, ?, 1)
    `).run(target, reason, player, expiresAt);
    
    const lines = [
        `${colors.white}Игрок &e${target}&r получил мут!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Причина: ${colors.red}${reason}`,
        `${colors.white}Длительность: ${colors.yellow}${duration}`,
        `${colors.white}Истекает: ${colors.green}${expiresDate}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Выдал: ${colors.yellow}${player}`
    ];
    const frame = createFrame(`🔇 МУТ`, lines);
    sendClan(frame);
    
    setTimeout(() => {
        const targetLines = [
            `${colors.white}Вы получили мут в клановом чате!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}${reason}`,
            `${colors.white}Длительность: ${colors.yellow}${duration}`,
            `${colors.white}Истекает: ${colors.green}${expiresDate}`
        ];
        const targetFrame = createFrame(`🔇 МУТ`, targetLines);
        sendPrivate(target, targetFrame);
    }, 500);
    
    if (logCallback) logCallback(`🔇 ${player} замутил ${target} на ${duration}`, 'warn');
}

/**
 * /awarn - выговор персоналу
 * Доступно с Ст.Модератора
 */
async function awarn(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2 || (args[0] !== 'add' && args[0] !== 'del')) {
        const lines = [
            `${colors.white}Выговор персоналу`,
            `${colors.gold}────────────────────`,
            `${colors.white}Добавить: &e/awarn add [ник] [причина]`,
            `${colors.white}Удалить: &e/awarn del [ник]`,
            `${colors.gold}────────────────────`,
            `${colors.white}3 выговора → снятие с должности`,
            `${colors.white}Доступно с &eСт.Модератор&r и выше`
        ];
        const frame = createFrame(`⚠️ ВЫГОВОР`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ') || 'Не указана';
    
    const actorRank = await database.getStaffRank(player);
    const targetRank = await database.getStaffRank(target);
    
    const actorLevel = RANK_ORDER.indexOf(actorRank);
    const targetLevel = RANK_ORDER.indexOf(targetRank);
    
    if (actorLevel < RANK_ORDER.indexOf('Ст.Модератор')) {
        sendPrivate(player, formatMessage('❌', 'Выговор доступен с ранга &eСт.Модератор&r и выше!', colors.red));
        return;
    }
    
    if (targetLevel >= actorLevel && actorRank !== 'Администратор') {
        sendPrivate(player, formatMessage('❌', 'Нельзя выдать выговор вышестоящему сотруднику!', colors.red));
        return;
    }
    
    if (action === 'add') {
        const staff = db.getDb().prepare('SELECT total_warns FROM staff WHERE minecraft_nick = ?').get(target);
        const newWarns = (staff?.total_warns || 0) + 1;
        db.getDb().prepare('UPDATE staff SET total_warns = ? WHERE minecraft_nick = ?').run(newWarns, target);
        
        const lines = [
            `${colors.white}Сотрудник &e${target}&r получил выговор!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}${reason}`,
            `${colors.white}Всего выговоров: ${newWarns >= 3 ? colors.red : colors.yellow}${newWarns}/3`,
            `${colors.gold}────────────────────`,
            `${colors.white}Выдал: ${colors.yellow}${player}`
        ];
        
        if (newWarns >= 3) {
            db.getDb().prepare('DELETE FROM staff WHERE minecraft_nick = ?').run(target);
            const defaultRank = '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй';
            bot.chat(`/c rank ${target} ${defaultRank}`);
            lines.push(`${colors.gold}────────────────────`);
            lines.push(`${colors.red}${colors.bold}СОТРУДНИК СНЯТ С ДОЛЖНОСТИ!`);
        }
        
        const frame = createFrame(`⚠️ ВЫГОВОР`, lines);
        sendClan(frame);
        
        setTimeout(() => {
            sendPrivate(target, formatMessage('⚠️', `Вы получили выговор (${newWarns}/3). Причина: &e${reason}`, colors.yellow));
        }, 500);
        
        if (logCallback) logCallback(`⚠️ ${player} выдал выговор ${target} (${newWarns}/3)`, 'warn');
        
    } else if (action === 'del') {
        const staff = db.getDb().prepare('SELECT total_warns FROM staff WHERE minecraft_nick = ?').get(target);
        if (staff && staff.total_warns > 0) {
            const newWarns = staff.total_warns - 1;
            db.getDb().prepare('UPDATE staff SET total_warns = ? WHERE minecraft_nick = ?').run(newWarns, target);
            
            const lines = [
                `${colors.white}Выговор снят с &e${target}`,
                `${colors.gold}────────────────────`,
                `${colors.white}Осталось выговоров: ${colors.green}${newWarns}/3`,
                `${colors.gold}────────────────────`,
                `${colors.white}Снял: ${colors.yellow}${player}`
            ];
            const frame = createFrame(`✅ СНЯТИЕ ВЫГОВОРА`, lines);
            sendClan(frame);
            
            if (logCallback) logCallback(`✅ ${player} снял выговор с ${target}`, 'info');
        } else {
            sendPrivate(player, formatMessage('❌', `У игрока &e${target}&r нет выговоров.`, colors.red));
        }
    }
}

/**
 * /spam - управление авто-модерацией
 * Доступно с Гл.Модератора
 */
async function spam(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const staffRank = await database.getStaffRank(player);
    if (RANK_ORDER.indexOf(staffRank) < RANK_ORDER.indexOf('Гл.Модератор')) {
        sendPrivate(player, formatMessage('❌', 'Требуется ранг &eГл.Модератор&r или выше!', colors.red));
        return;
    }
    
    const enabled = database.getSetting('auto_moderation_enabled');
    const isEnabled = enabled === 'true';
    
    if (args.length < 1) {
        const lines = [
            `${colors.white}Авто-модерация: ${isEnabled ? colors.green + 'ВКЛЮЧЕНА' : colors.red + 'ОТКЛЮЧЕНА'}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Для включения: &e/spam on`,
            `${colors.white}Для отключения: &e/spam off`,
            `${colors.gold}────────────────────`,
            `${colors.white}Правила авто-модерации:`,
            `${colors.white}• 5 сообщений в минуту → предупреждение`,
            `${colors.white}• 3 предупреждения → мут на 30 минут`
        ];
        const frame = createFrame(`🛡️ АВТО-МОДЕРАЦИЯ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const action = args[0].toLowerCase();
    if (action === 'on') {
        database.setSetting('auto_moderation_enabled', 'true');
        const lines = [
            `${colors.white}Авто-модерация &aвключена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Включил: ${colors.yellow}${player}`,
            `${colors.white}Теперь спам будет автоматически наказываться`
        ];
        const frame = createFrame(`🛡️ АВТО-МОДЕРАЦИЯ`, lines);
        sendClan(frame);
        if (logCallback) logCallback(`🔧 ${player} включил авто-модерацию`, 'info');
    } else if (action === 'off') {
        database.setSetting('auto_moderation_enabled', 'false');
        const lines = [
            `${colors.white}Авто-модерация &cотключена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Отключил: ${colors.yellow}${player}`,
            `${colors.red}Будьте внимательны, спам не будет наказываться автоматически`
        ];
        const frame = createFrame(`🛡️ АВТО-МОДЕРАЦИЯ`, lines);
        sendClan(frame);
        if (logCallback) logCallback(`🔧 ${player} отключил авто-модерацию`, 'warn');
    } else {
        sendPrivate(player, formatMessage('❌', `Используйте &e/spam on&r или &e/spam off`, colors.red));
    }
}

/**
 * /r clan - реклама клана
 * /r chat - реклама в чате
 */
async function rClanChat(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2) {
        const lines = [
            `${colors.white}Управление рекламой`,
            `${colors.gold}────────────────────`,
            `${colors.white}Реклама клана: &e/r clan on/off${colors.reset} (Гл.Модератор+)`,
            `${colors.white}Реклама в чате: &e/r chat on/off${colors.reset} (Ст.Модератор+)`,
            `${colors.gold}────────────────────`,
            `${colors.white}Текущее состояние:`,
            `${colors.white}Реклама клана: ${database.getSetting('clan_ad_enabled') === 'true' ? colors.green + 'ВКЛ' : colors.red + 'ВЫКЛ'}`,
            `${colors.white}Реклама в чате: ${database.getSetting('chat_ad_enabled') === 'true' ? colors.green + 'ВКЛ' : colors.red + 'ВЫКЛ'}`
        ];
        const frame = createFrame(`📢 РЕКЛАМА`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const target = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    const staffRank = await database.getStaffRank(player);
    
    if (target === 'clan') {
        if (RANK_ORDER.indexOf(staffRank) < RANK_ORDER.indexOf('Гл.Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Рекламу клана могут настраивать &eГл.Модератор&r и выше!', colors.red));
            return;
        }
        
        if (action === 'on') {
            database.setSetting('clan_ad_enabled', 'true');
            const lines = [
                `${colors.white}Реклама клана &aвключена!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Включил: ${colors.yellow}${player}`
            ];
            const frame = createFrame(`📢 РЕКЛАМА КЛАНА`, lines);
            sendClan(frame);
        } else if (action === 'off') {
            database.setSetting('clan_ad_enabled', 'false');
            const lines = [
                `${colors.white}Реклама клана &cотключена!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Отключил: ${colors.yellow}${player}`
            ];
            const frame = createFrame(`📢 РЕКЛАМА КЛАНА`, lines);
            sendClan(frame);
        } else {
            sendPrivate(player, formatMessage('❌', `Используйте &e/r clan on&r или &e/r clan off`, colors.red));
        }
        if (logCallback) logCallback(`📢 ${player} ${action === 'on' ? 'включил' : 'отключил'} рекламу клана`, 'info');
    }
    
    else if (target === 'chat') {
        if (RANK_ORDER.indexOf(staffRank) < RANK_ORDER.indexOf('Ст.Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Рекламу в чате могут настраивать &eСт.Модератор&r и выше!', colors.red));
            return;
        }
        
        if (action === 'on') {
            database.setSetting('chat_ad_enabled', 'true');
            const lines = [
                `${colors.white}Реклама в чате &aвключена!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Включил: ${colors.yellow}${player}`
            ];
            const frame = createFrame(`📢 РЕКЛАМА В ЧАТЕ`, lines);
            sendClan(frame);
        } else if (action === 'off') {
            database.setSetting('chat_ad_enabled', 'false');
            const lines = [
                `${colors.white}Реклама в чате &cотключена!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Отключил: ${colors.yellow}${player}`
            ];
            const frame = createFrame(`📢 РЕКЛАМА В ЧАТЕ`, lines);
            sendClan(frame);
        } else {
            sendPrivate(player, formatMessage('❌', `Используйте &e/r chat on&r или &e/r chat off`, colors.red));
        }
        if (logCallback) logCallback(`📢 ${player} ${action === 'on' ? 'включил' : 'отключил'} рекламу в чате`, 'info');
    } else {
        sendPrivate(player, formatMessage('❌', `Используйте &e/r clan&r или &e/r chat`, colors.red));
    }
}

module.exports = {
    blacklist,
    kick,
    mute,
    admin: require('./admin').admin,
    awarn,
    spam,
    rClanChat,
    logs: require('./admin').logs
};