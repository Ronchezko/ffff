// src/minecraft/commands/admin.js

const database = require('../../database');
const utils = require('../../shared/utils');

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0', dark_blue: '&1', dark_green: '&2', dark_aqua: '&3',
    dark_red: '&4', dark_purple: '&5', gold: '&6', gray: '&7',
    dark_gray: '&8', blue: '&9', green: '&a', aqua: '&b',
    red: '&c', light_purple: '&d', yellow: '&e', white: '&f',
    bold: '&l', reset: '&r'
};

function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${color}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

// Безопасная функция для создания рамки (исправлена)
function createFrame(title, lines) {
    const maxWidth = 32;
    const contentWidth = maxWidth - 4;
    
    // Обрезаем слишком длинный заголовок
    let safeTitle = title;
    const cleanTitle = title.replace(/&[0-9a-fklmnor]/g, '');
    if (cleanTitle.length > contentWidth) {
        safeTitle = title.substring(0, contentWidth);
    }
    
    // Обрабатываем строки
    const wrappedLines = [];
    for (const line of lines) {
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        if (cleanLine.length > contentWidth) {
            wrappedLines.push(line.substring(0, contentWidth));
        } else {
            wrappedLines.push(line);
        }
    }
    
    let frame = `${colors.gold}╔${'═'.repeat(maxWidth)}╗${colors.reset}\n`;
    
    const titlePadding = Math.max(0, Math.floor((maxWidth - safeTitle.length - 2) / 2));
    frame += `${colors.gold}║${' '.repeat(titlePadding)}${colors.light_purple}${colors.bold}${safeTitle}${colors.reset}${' '.repeat(Math.max(0, maxWidth - safeTitle.length - titlePadding - 2))}${colors.gold}║${colors.reset}\n`;
    frame += `${colors.gold}╠${'═'.repeat(maxWidth)}╣${colors.reset}\n`;
    
    for (const line of wrappedLines) {
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        const spaces = Math.max(0, maxWidth - cleanLine.length - 2);
        frame += `${colors.gold}║ ${line}${' '.repeat(spaces)}${colors.gold}║${colors.reset}\n`;
    }
    
    frame += `${colors.gold}╚${'═'.repeat(maxWidth)}╝${colors.reset}`;
    return frame;
}

const RANK_ORDER = ['Мл.Модератор', 'Модератор', 'Ст.Модератор', 'Гл.Модератор', 'Куратор', 'Администратор'];

const RANK_COLORS = {
    'Администратор': '&8⌜&e⭐&8⌟ﾠ&#790101&lᴀ&#940d0d&lᴅ&#b01919&lᴍ&#cb2424&lɪ&#e63030&lɴ',
    'Куратор': '&8⌜&e✦&8⌟ﾠ&#ff118d&lᴋ&#ff158b&lʏ&#ff1a89&lʀ&#ff1e87&lᴀ&#ff2284&lᴛ&#ff2782&lᴏ&#ff2b80&lʀ',
    'Гл.Модератор': '&8⌜&e🌟&8⌟ﾠ&#5323ff&lɢ&#5624fd&lʟ&#5a25fa&l.&#5d27f8&lᴍ&#6128f6&lᴏ&#6429f4&lᴅ&#682af1&lᴇ&#6b2bef&lʀ',
    'Ст.Модератор': '&8⌜&e🍁&8⌟ﾠ&#ffb10c&ls&#fdb20e&lᴛ&#fab30f&l.&#f8b511&lᴍ&#f6b612&lᴏ&#f4b714&lᴅ&#f1b815&lᴇ&#efb917&lʀ',
    'Модератор': '&8⌜&e&l🛠&8⌟ﾠ&#114fff&lᴍ&#1552fc&lᴏ&#1856f9&lᴅ&#1c59f6&lᴇ&#1f5cf3&lʀ',
    'Мл.Модератор': '&8⌜&e&l🔧&8⌟ﾠ&#59ff6d&lᴍ&#54fd72&lʟ&#4ffa77&l.&#4bf87c&lᴍ&#46f681&lᴏ&#41f486&lᴅ&#3cf18b&lᴇ&#37ef90&lʀ'
};

const DEFAULT_RANK = '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй';

/**
 * /stopall - Остановка всех RP-процессов (подготовка к вайпу)
 */
async function stopall(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const staffRank = await database.getStaffRank(player);
    if (staffRank !== 'Администратор') {
        sendPrivate(player, formatMessage('❌', 'Только &eАдминистратор&r может использовать эту команду!', colors.red));
        return;
    }
    
    const isStopped = global.isRPStopped;
    
    if (isStopped) {
        global.isRPStopped = false;
        database.setSetting('rp_processes', 'true');
        
        const lines = [
            `${colors.white}Все RolePlay процессы &aвозобновлены!`,
            `${colors.gold}────────────────────`,
            `${colors.white}PayDay: ${colors.green}Активен`,
            `${colors.white}Авто-модерация: ${colors.green}Активна`,
            `${colors.white}Приём заявок: ${colors.green}Активен`
        ];
        const frame = createFrame(`✅ ВОЗОБНОВЛЕНИЕ`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`✅ ${player} возобновил все RP процессы`, 'info');
    } else {
        global.isRPStopped = true;
        database.setSetting('rp_processes', 'false');
        
        const lines = [
            `${colors.white}Все RolePlay процессы &cостановлены!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.yellow}Подготовка к вайпу`,
            `${colors.white}PayDay: ${colors.red}Остановлен`,
            `${colors.white}Авто-модерация: ${colors.red}Отключена`,
            `${colors.white}Приём заявок: ${colors.red}Остановлен`,
            `${colors.gold}────────────────────`,
            `${colors.white}Для возобновления: &e/stopall`
        ];
        const frame = createFrame(`⏸️ ОСТАНОВКА`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`⏸️ ${player} остановил все RP процессы`, 'warn');
    }
}

/**
 * /reloadbd - Полная перезагрузка БД
 */
async function reloadbd(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const staffRank = await database.getStaffRank(player);
    if (staffRank !== 'Администратор') {
        sendPrivate(player, formatMessage('❌', 'Только &eАдминистратор&r может использовать эту команду!', colors.red));
        return;
    }
    
    if (!args[1] || args[1] !== 'confirm') {
        const lines = [
            `${colors.red}${colors.bold}ВНИМАНИЕ!${colors.reset} ${colors.white}Это действие необратимо!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Будут удалены:`,
            `${colors.white}• Все участники клана`,
            `${colors.white}• Все RP игроки`,
            `${colors.white}• Все наказания и логи`,
            `${colors.white}• Вся недвижимость`,
            `${colors.white}• Все сотрудники структур`,
            `${colors.gold}────────────────────`,
            `${colors.red}${colors.bold}Настройки и персонал останутся!${colors.reset}`,
            `${colors.gold}────────────────────`,
            `${colors.yellow}Для подтверждения: &e/reloadbd confirm`
        ];
        const frame = createFrame(`⚠️ ПОДТВЕРЖДЕНИЕ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    sendClan(formatMessage('⚠️', 'Начинается очистка базы данных...', colors.yellow));
    
    try {
        const dbInstance = database.getDb();
        
        const stats = {
            players: dbInstance.prepare('SELECT COUNT(*) as c FROM clan_members').get().c,
            rp: dbInstance.prepare('SELECT COUNT(*) as c FROM rp_players').get().c,
            properties: dbInstance.prepare('SELECT COUNT(*) as c FROM properties WHERE owner IS NOT NULL').get().c,
            staff: dbInstance.prepare('SELECT COUNT(*) as c FROM staff').get().c
        };
        
        dbInstance.exec('DELETE FROM clan_members WHERE rank NOT LIKE "%Администратор%"');
        dbInstance.exec('DELETE FROM rp_players');
        dbInstance.exec('DELETE FROM money_logs');
        dbInstance.exec('DELETE FROM punishments');
        dbInstance.exec('DELETE FROM clan_chat_logs');
        dbInstance.exec('DELETE FROM staff');
        dbInstance.exec('DELETE FROM verification_codes');
        dbInstance.exec('DELETE FROM properties WHERE owner IS NOT NULL');
        dbInstance.exec('DELETE FROM structure_members');
        dbInstance.exec('DELETE FROM org_budgets');
        dbInstance.exec('DELETE FROM duty_history');
        dbInstance.exec('DELETE FROM office_questions');
        
        const lines = [
            `${colors.white}База данных &aуспешно очищена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Удалено:`,
            `${colors.white}• Участников клана: ${colors.red}${stats.players}`,
            `${colors.white}• RP игроков: ${colors.red}${stats.rp}`,
            `${colors.white}• Объектов недвижимости: ${colors.red}${stats.properties}`,
            `${colors.white}• Сотрудников структур: ${colors.red}${stats.staff}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Настройки и персонал &aсохранены`,
            `${colors.gold}────────────────────`,
            `${colors.yellow}Город готов к новому вайпу!`
        ];
        const frame = createFrame(`🗑️ ОЧИСТКА БД`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`🗑️ ${player} выполнил полную очистку базы данных`, 'error');
    } catch (err) {
        sendPrivate(player, formatMessage('❌', `Ошибка очистки: ${err.message}`, colors.red));
        if (logCallback) logCallback(`❌ Ошибка очистки БД: ${err.message}`, 'error');
    }
}

/**
 * /admin - Управление модераторами
 */
async function adminCmd(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const staffRank = await database.getStaffRank(player);
    if (staffRank !== 'Куратор' && staffRank !== 'Администратор') {
        sendPrivate(player, formatMessage('❌', 'Только &eКуратор&r и &eАдминистратор&r могут использовать эту команду!', colors.red));
        return;
    }
    
    if (args.length < 3) {
        const lines = [
            `${colors.white}Управление персоналом`,
            `${colors.gold}────────────────────`,
            `${colors.white}Добавить: &e/admin add [ник] [роль]`,
            `${colors.white}Удалить: &e/admin del [ник]`,
            `${colors.gold}────────────────────`,
            `${colors.white}Доступные роли:`,
            `${colors.white}• Мл.Модератор`,
            `${colors.white}• Модератор`,
            `${colors.white}• Ст.Модератор`,
            `${colors.white}• Гл.Модератор`,
            `${colors.white}• Куратор`,
            `${colors.white}• Администратор ${colors.red}(только Админ)`
        ];
        const frame = createFrame(`👑 УПРАВЛЕНИЕ ПЕРСОНАЛОМ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const action = args[1].toLowerCase();
    const target = args[2];
    const role = args.slice(3).join(' ');
    
    const targetPlayer = await database.getPlayerByNickname(target);
    if (!targetPlayer) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    if (action === 'add') {
        if (!role) {
            sendPrivate(player, formatMessage('❌', 'Укажите роль для назначения.', colors.red));
            return;
        }
        
        if (staffRank === 'Куратор' && role === 'Администратор') {
            sendPrivate(player, formatMessage('❌', 'Куратор не может назначить Администратора!', colors.red));
            return;
        }
        
        const existing = db.getDb().prepare('SELECT * FROM staff WHERE minecraft_nick = ?').get(target);
        if (existing) {
            sendPrivate(player, formatMessage('⚠️', `Игрок &e${target}&r уже в персонале.`, colors.yellow));
            return;
        }
        
        db.getDb().prepare(`
            INSERT INTO staff (minecraft_nick, staff_rank, appointed_by, appointed_at, kicks_today, mutes_today, blacklists_today)
            VALUES (?, ?, ?, datetime('now'), 0, 0, 0)
        `).run(target, role, player);
        
        if (RANK_COLORS[role]) {
            bot.chat(`/c rank ${target} ${RANK_COLORS[role]}`);
        }
        
        const lines = [
            `${colors.white}Игрок &e${target}&r назначен на должность &e${role}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Назначил: ${colors.yellow}${player}`,
            `${colors.white}Дата: ${colors.green}${new Date().toLocaleString('ru-RU')}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Поздравляем с повышением!`
        ];
        const frame = createFrame(`👑 НАЗНАЧЕНИЕ`, lines);
        sendClan(frame);
        
        setTimeout(() => {
            sendPrivate(target, formatMessage('🎉', `Вы назначены на должность &e${role}&r в клане!`, colors.green));
        }, 500);
        
        if (logCallback) logCallback(`👑 ${player} назначил ${target} на ${role}`, 'success');
        
    } else if (action === 'del') {
        const existing = db.getDb().prepare('SELECT * FROM staff WHERE minecraft_nick = ?').get(target);
        if (!existing) {
            sendPrivate(player, formatMessage('⚠️', `Игрок &e${target}&r не в персонале.`, colors.yellow));
            return;
        }
        
        db.getDb().prepare('DELETE FROM staff WHERE minecraft_nick = ?').run(target);
        bot.chat(`/c rank ${target} ${DEFAULT_RANK}`);
        
        const lines = [
            `${colors.white}Игрок &e${target}&r снят с должности`,
            `${colors.gold}────────────────────`,
            `${colors.white}Снял: ${colors.yellow}${player}`,
            `${colors.white}Дата: ${colors.green}${new Date().toLocaleString('ru-RU')}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Возвращён в обычные участники`
        ];
        const frame = createFrame(`👑 СНЯТИЕ`, lines);
        sendClan(frame);
        
        setTimeout(() => {
            sendPrivate(target, formatMessage('⚠️', `Вы сняты с должности &e${existing.staff_rank}&r.`, colors.yellow));
        }, 500);
        
        if (logCallback) logCallback(`👑 ${player} снял ${target} с должности`, 'info');
    } else {
        sendPrivate(player, formatMessage('❌', `Неизвестное действие: &e${action}&r. Используйте &eadd&r или &edel`, colors.red));
    }
}

/**
 * /logs - Просмотр логов игрока
 */
async function logsCmd(bot, player, args, db, logCallback, sendPrivate) {
    const staffRank = await database.getStaffRank(player);
    if (!staffRank) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для использования этой команды!', colors.red));
        return;
    }
    
    if (args.length < 2) {
        const lines = [
            `${colors.white}Просмотр логов игрока`,
            `${colors.gold}────────────────────`,
            `${colors.white}Использование: &e/logs [ник] [тип] [страница]`,
            `${colors.gold}────────────────────`,
            `${colors.white}Доступные типы:`,
            `${colors.white}• &echat&r - сообщения в чате`,
            `${colors.white}• &epunishments&r - наказания`,
            `${colors.white}• &emoney&r - транзакции`
        ];
        const frame = createFrame(`📋 ЛОГИ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const target = args[1];
    const type = args[2] || 'chat';
    const page = parseInt(args[3]) || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;
    
    const targetPlayer = await database.getPlayerByNickname(target);
    if (!targetPlayer) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    let logs = [];
    let total = 0;
    
    if (type === 'chat') {
        logs = db.getDb().prepare(`
            SELECT * FROM clan_chat_logs WHERE player = ? 
            ORDER BY timestamp DESC LIMIT ? OFFSET ?
        `).all(target, perPage, offset);
        total = db.getDb().prepare('SELECT COUNT(*) as cnt FROM clan_chat_logs WHERE player = ?').get(target).cnt;
    } else if (type === 'punishments') {
        logs = db.getDb().prepare(`
            SELECT p.*, p.issued_by as issuer
            FROM punishments p WHERE p.player = ? 
            ORDER BY issued_at DESC LIMIT ? OFFSET ?
        `).all(target, perPage, offset);
        total = db.getDb().prepare('SELECT COUNT(*) as cnt FROM punishments WHERE player = ?').get(target).cnt;
    } else if (type === 'money') {
        logs = db.getDb().prepare(`
            SELECT * FROM money_logs WHERE player = ? 
            ORDER BY timestamp DESC LIMIT ? OFFSET ?
        `).all(target, perPage, offset);
        total = db.getDb().prepare('SELECT COUNT(*) as cnt FROM money_logs WHERE player = ?').get(target).cnt;
    } else {
        sendPrivate(player, formatMessage('❌', `Неверный тип: &e${type}&r. Доступно: chat, punishments, money`, colors.red));
        return;
    }
    
    if (logs.length === 0) {
        sendPrivate(player, formatMessage('ℹ️', `Нет логов для игрока &e${target}&r (${type})`, colors.yellow));
        return;
    }
    
    const totalPages = Math.ceil(total / perPage);
    const lines = [
        `${colors.white}Игрок: ${colors.yellow}${target}`,
        `${colors.white}Тип: ${colors.green}${type}`,
        `${colors.white}Страница: ${colors.green}${page}/${totalPages}`,
        `${colors.gold}────────────────────`
    ];
    
    for (const log of logs) {
        if (type === 'chat') {
            lines.push(`${colors.gray}${new Date(log.timestamp).toLocaleTimeString()}${colors.reset} ${colors.white}${log.message.substring(0, 50)}`);
        } else if (type === 'punishments') {
            const status = log.active ? `${colors.red}АКТИВЕН` : `${colors.green}НЕАКТИВЕН`;
            lines.push(`${colors.gray}${new Date(log.issued_at).toLocaleTimeString()}${colors.reset} ${colors.red}${log.type}${colors.reset} от ${colors.yellow}${log.issuer || 'system'}${colors.reset}: ${log.reason} (${status})`);
        } else if (type === 'money') {
            const sign = log.amount > 0 ? `${colors.green}+` : `${colors.red}`;
            lines.push(`${colors.gray}${new Date(log.timestamp).toLocaleTimeString()}${colors.reset} ${sign}${Math.abs(log.amount)}₽${colors.reset} - ${log.reason.substring(0, 30)}`);
        }
    }
    
    const frame = createFrame(`📋 ЛОГИ ${target.toUpperCase()}`, lines);
    sendPrivate(player, frame);
}

module.exports = {
    stopall,
    reloadbd,
    admin: adminCmd,
    logs: logsCmd
};