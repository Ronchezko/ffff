// src/minecraft/commands/admin.js
// Команды для администраторов (ранг 6)

const utils = require('../../shared/utils');

// Флаг остановки всех процессов
let isStopped = false;

// ============================================
// /admin [add/del] [ник] [роль] - Управление администраторами
// ============================================
async function admin(bot, sender, args, db, addLog) {
    // Проверка, что отправитель - администратор
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /admin add [ник] [роль]`);
        bot.chat(`/msg ${sender} &cИспользование: /admin del [ник]`);
        bot.chat(`/msg ${sender} &7Роли: 1-Мл.мод, 2-Мод, 3-Ст.мод, 4-Гл.мод, 5-Куратор, 6-Админ`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const role = parseInt(args[2]);
    
    if (action === 'add') {
        if (isNaN(role) || role < 1 || role > 6) {
            bot.chat(`/msg ${sender} &cНеверная роль! Доступно: 1-6`);
            return;
        }
        
        // Добавляем в персонал
        await db.updateStaffRank(target, role, permissions.STAFF_LEVELS[role], sender);
        
        // Обновляем ранг в клане
        const rankName = getClanRankByStaffLevel(role);
        await db.updateClanMemberRank(target, rankName, role * 10);
        
        bot.chat(`/cc &a👑 ${sender} назначил ${target} на должность ${permissions.STAFF_LEVELS[role]}`);
        bot.chat(`/msg ${target} &a🎉 Поздравляем! Вы назначены на должность ${permissions.STAFF_LEVELS[role]}`);
        
        if (addLog) addLog(`👑 ${sender} назначил ${target} на ${permissions.STAFF_LEVELS[role]}`, 'success');
        
    } else if (action === 'del') {
        await db.updateStaffRank(target, 0, null, sender);
        
        bot.chat(`/cc &c👑 ${sender} снял с должности ${target}`);
        bot.chat(`/msg ${target} &cВы были сняты с должности ${sender}`);
        
        if (addLog) addLog(`👑 ${sender} снял ${target} с должности`, 'warn');
    }
}

function getClanRankByStaffLevel(level) {
    const ranks = {
        1: 'Мл.Модератор',
        2: 'Модератор',
        3: 'Ст.Модератор',
        4: 'Гл.Модератор',
        5: 'Куратор',
        6: 'Администратор'
    };
    return ranks[level] || 'Участник';
}

// ============================================
// /stopall - Остановка всех RP процессов
// ============================================
async function stopall(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для использования этой команды!`);
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

// ============================================
// /reloadbd - Очистка БД (вайп)
// ============================================
async function reloadbd(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для использования этой команды!`);
        return;
    }
    
    bot.chat(`/cc &c⚠️⚠️⚠️ ${sender} ЗАПУСКАЕТ ОЧИСТКУ БАЗЫ ДАННЫХ ⚠️⚠️⚠️`);
    
    // Сохраняем дату вайпа
    await db.setSetting('last_wipe_date', new Date().toISOString(), sender);
    
    // Очищаем таблицы (сохраняем структуру)
    await db.run('DELETE FROM clan_members WHERE rank_priority < 100'); // Сохраняем админов
    await db.run('DELETE FROM rp_players WHERE structure = "Гражданин"');
    await db.run('DELETE FROM property WHERE is_available = 0');
    await db.run('DELETE FROM punishments WHERE issued_at < datetime("now", "-30 days")');
    await db.run('DELETE FROM clan_chat_logs WHERE sent_at < datetime("now", "-7 days")');
    await db.run('DELETE FROM money_logs WHERE created_at < datetime("now", "-30 days")');
    
    // Обновляем имущество (делаем свободным)
    await db.run('UPDATE property SET is_available = 1, owner_nick = NULL, co_owner1 = NULL, co_owner2 = NULL');
    
    // Сбрасываем счётчики персонала
    await db.run('UPDATE staff_stats SET kicks_today = 0, mutes_today = 0, bl_today = 0, last_reset_date = date("now")');
    
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
        bot.chat(`/msg ${sender} &cУ вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args[0] !== 'CONFIRM') {
        bot.chat(`/msg ${sender} &c⚠️ ОПАСНАЯ КОМАНДА! Это удалит ВСЕ данные!`);
        bot.chat(`/msg ${sender} &cДля подтверждения введите: /wipe CONFIRM`);
        return;
    }
    
    bot.chat(`/cc &c💀💀💀 ${sender} ЗАПУСКАЕТ ПОЛНЫЙ ВАЙП СЕРВЕРА 💀💀💀`);
    
    // Полный сброс всех таблиц
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
    await db.updateStaffRank('Ronch_', 6, 'Администратор', 'system');
    await db.updateClanMemberRank('Ronch_', 'Администратор', 100);
    
    bot.chat(`/cc &a✅ ПОЛНЫЙ ВАЙП ЗАВЕРШЁН! Сервер очищен.`);
    
    if (addLog) addLog(`💀 ${sender} выполнил полный вайп сервера!`, 'error');
}

// ============================================
// ЭКСПОРТ
// ============================================
module.exports = {
    admin,
    stopall,
    reloadbd,
    wipe,
    isStopped: () => isStopped
};