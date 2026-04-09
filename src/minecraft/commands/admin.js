// src/minecraft/commands/admin.js
// Команды для администраторов (ранг 6)

const utils = require('../../shared/utils');

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// /admin [add/del] [ник] [роль] - Управление администраторами
// ============================================

async function admin(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/admin add [ник] [роль]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/admin del [ник]`);
        sendMessage(bot, sender, `&7&l|&f Роли: &e1-Мл.мод, 2-Мод, 3-Ст.мод, 4-Гл.мод, 5-Куратор, 6-Админ`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const role = parseInt(args[2]);
    
    const roleNames = {
        1: 'Мл.Модератор',
        2: 'Модератор',
        3: 'Ст.Модератор',
        4: 'Гл.Модератор',
        5: 'Куратор',
        6: 'Администратор'
    };
    
    if (action === 'add') {
        if (isNaN(role) || role < 1 || role > 6) {
            sendMessage(bot, sender, `&4&l|&c Неверная роль! Доступно: &e1-6`);
            return;
        }
        
        await db.run(`INSERT OR REPLACE INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by) VALUES (?, ?, ?, ?)`, 
            [target, role, roleNames[role], sender]);
        
        const clanRankName = roleNames[role];
        await db.run(`UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE minecraft_nick = ?`, 
            [clanRankName, role * 10, target]);
        
        bot.chat(`/cc &a👑 ${sender} назначил ${target} на должность ${roleNames[role]}`);
        sendMessage(bot, target, `&a&l|&f Поздравляем! Вы назначены на должность ${roleNames[role]}`);
        if (addLog) addLog(`👑 ${sender} назначил ${target} на ${roleNames[role]}`, 'success');
        
    } else if (action === 'del') {
        await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL WHERE minecraft_nick = ?`, [target]);
        await db.run(`UPDATE clan_members SET rank_name = 'Участник', rank_priority = 10 WHERE minecraft_nick = ?`, [target]);
        
        bot.chat(`/cc &c👑 ${sender} снял с должности ${target}`);
        sendMessage(bot, target, `&c&l|&f Вы были сняты с должности ${sender}`);
        if (addLog) addLog(`👑 ${sender} снял ${target} с должности`, 'warn');
    }
}

// ============================================
// /stopall - Остановка всех RP процессов
// ============================================

let isStopped = false;

async function stopall(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды`);
        return;
    }
    
    isStopped = !isStopped;
    
    if (isStopped) {
        await db.setSetting('system_stopped', 'true', sender);
        bot.chat(`/cc &c🛑 ${sender} ОСТАНОВИЛ все RP процессы!`);
        bot.chat(`/cc &cБот не выполняет команды и не выдаёт наказаний до разморозки.`);
        if (addLog) addLog(`🛑 ${sender} остановил все процессы`, 'error');
    } else {
        await db.setSetting('system_stopped', 'false', sender);
        bot.chat(`/cc &a✅ ${sender} ВОЗОБНОВИЛ работу системы!`);
        if (addLog) addLog(`✅ ${sender} возобновил работу системы`, 'success');
    }
}

function isSystemStopped() {
    return isStopped;
}

// ============================================
// /reloadbd - Очистка БД (вайп)
// ============================================

async function reloadbd(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды`);
        return;
    }
    
    bot.chat(`/cc &c⚠️⚠️⚠️ ${sender} ЗАПУСКАЕТ ОЧИСТКУ БАЗЫ ДАННЫХ ⚠️⚠️⚠️`);
    
    await db.setSetting('last_wipe_date', new Date().toISOString(), sender);
    
    // Очищаем таблицы (сохраняем админов)
    await db.run(`DELETE FROM clan_members WHERE rank_priority < 100`);
    await db.run(`DELETE FROM rp_players WHERE structure = 'Гражданин'`);
    await db.run(`DELETE FROM property WHERE is_available = 0`);
    await db.run(`DELETE FROM punishments WHERE issued_at < datetime('now', '-30 days')`);
    await db.run(`DELETE FROM clan_chat_logs WHERE sent_at < datetime('now', '-7 days')`);
    await db.run(`DELETE FROM money_logs WHERE created_at < datetime('now', '-30 days')`);
    
    // Обновляем имущество (делаем свободным)
    await db.run(`UPDATE property SET is_available = 1, owner_nick = NULL, co_owner1 = NULL, co_owner2 = NULL`);
    
    // Сбрасываем счётчики персонала
    await db.run(`UPDATE staff_stats SET kicks_today = 0, mutes_today = 0, bl_today = 0, last_reset_date = date('now')`);
    
    bot.chat(`/cc &a✅ Очистка базы данных завершена!`);
    bot.chat(`/cc &a📅 Дата вайпа: ${new Date().toLocaleString()}`);
    if (addLog) addLog(`🗑️ ${sender} выполнил очистку БД (вайп)`, 'error');
}

// ============================================
// /wipe - Полный вайп (только для консоли)
// ============================================

async function wipe(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды`);
        return;
    }
    
    if (args[0] !== 'CONFIRM') {
        sendMessage(bot, sender, `&4&l|&c ⚠️ ОПАСНАЯ КОМАНДА! Это удалит ВСЕ данные!`);
        sendMessage(bot, sender, `&7&l|&c Для подтверждения введите: &e/wipe CONFIRM`);
        return;
    }
    
    bot.chat(`/cc &c💀💀💀 ${sender} ЗАПУСКАЕТ ПОЛНЫЙ ВАЙП СЕРВЕРА 💀💀💀`);
    
    const tables = [
        'clan_members', 'rp_players', 'property', 'property_residents',
        'businesses', 'offices', 'licenses', 'org_members',
        'money_logs', 'punishments', 'clan_blacklist', 'player_warnings',
        'clan_chat_logs', 'private_messages_logs', 'verification_codes',
        'linked_accounts', 'pvp_stats'
    ];
    
    for (const table of tables) {
        await db.run(`DELETE FROM ${table}`);
        if (table !== 'clan_members' && table !== 'staff_stats') {
            await db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
        }
    }
    
    // Восстанавливаем администратора
    await db.addClanMember('Ronch_', 'system');
    await db.run(`INSERT OR REPLACE INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by) VALUES (?, 6, 'Администратор', 'system')`, ['Ronch_']);
    await db.run(`UPDATE clan_members SET rank_name = 'Администратор', rank_priority = 100 WHERE minecraft_nick = 'Ronch_'`);
    
    bot.chat(`/cc &a✅ ПОЛНЫЙ ВАЙП ЗАВЕРШЁН! Сервер очищен.`);
    if (addLog) addLog(`💀 ${sender} выполнил полный вайп сервера!`, 'error');
}

// ============================================
// /admin a - Алиас для /admin
// ============================================

async function a(bot, sender, args, db, addLog) {
    await admin(bot, sender, args, db, addLog);
}

// ============================================
// ЭКСПОРТ
// ============================================
// src/minecraft/commands/admin.js
// Административные команды клана

async function clanKick(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/kick [ник] [время] [причина]`);
        return;
    }
    
    // Проверка прав (только персонал)
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 1) {
        bot.chat(`/msg ${sender} &4&l|&c У вас нет прав для кика игроков`);
        return;
    }
    
    const target = args[0];
    const timeStr = args[1];
    const reason = args.slice(2).join(' ') || 'Не указана';
    
    // Парсим время (31d = 31 день)
    let days = 31;
    if (timeStr.endsWith('d')) {
        days = parseInt(timeStr);
    } else if (timeStr.endsWith('h')) {
        days = parseInt(timeStr) / 24;
    }
    
    const durationMinutes = days * 24 * 60;
    
    // Кикаем из клана
    bot.chat(`/c kick ${target}`);
    await utils.sleep(500);
    
    // Добавляем в ЧС
    await db.addPunishment(target, 'blacklist', reason, sender, durationMinutes, 'clan');
    await db.removeClanMember(target);
    
    bot.chat(`/msg ${sender} &a&l|&f Игрок &e${target} &aкикнут из клана на &e${days} &aдней`);
    bot.chat(`/msg ${target} &4&l|&c Вы кикнуты из клана Resistance на &4${days} &cдней по причине: &4${reason}`);
    bot.chat(`/cc &c👢 &e${target} &cкикнут из клана на ${days} дней (${reason})`);
    
    if (addLog) addLog(`👢 ${sender} кикнул ${target} из клана на ${days} дней`, 'warn');
}

module.exports = {
    admin,
    a,
    stopall,
    reloadbd,
    wipe,
    isSystemStopped,
    clanKick
};