// src/minecraft/commands/admin.js
// Команды для администрации клана (полный функционал)

const utils = require('../../shared/utils');
const cleanNickname = typeof nick === 'string' ? nick.toLowerCase() : '';
function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================



const roleNames = {
    1: 'Мл.Модератор',
    2: 'Модератор',
    3: 'Ст.Модератор',
    4: 'Гл.Модератор',
    5: 'Куратор',
    6: 'Администратор'
};

const clanRankDisplay = {
    1: '&8⌜&e&l🔧&8⌟ﾠ&#59ff6d&lᴍ&#54fd72&lʟ&#4ffa77&l.&#4bf87c&lᴍ&#46f681&lᴏ&#41f486&lᴅ&#3cf18b&lᴇ&#37ef90&lʀ',
    2: '&8⌜&e&l🛠&8⌟ﾠ&#114fff&lᴍ&#1552fc&lᴏ&#1856f9&lᴅ&#1c59f6&lᴇ&#1f5cf3&lʀ',
    3: '&8⌜&e🍁&8⌟ﾠ&#ffb10c&ls&#fdb20e&lᴛ&#fab30f&l.&#f8b511&lᴍ&#f6b612&lᴏ&#f4b714&lᴅ&#f1b815&lᴇ&#efb917&lʀ',
    4: '&8⌜&e🌟&8⌟ﾠ&#5323ff&lɢ&#5624fd&lʟ&#5a25fa&l.&#5d27f8&lᴍ&#6128f6&lᴏ&#6429f4&lᴅ&#682af1&lᴇ&#6b2bef&lʀ',
    5: '&8⌜&e✦&8⌟ﾠ&#ff118d&lᴋ&#ff158b&lʏ&#ff1a89&lʀ&#ff1e87&lᴀ&#ff2284&lᴛ&#ff2782&lᴏ&#ff2b80&lʀ',
    6: '&8⌜&e⭐&8⌟ﾠ&#790101&lᴀ&#940d0d&lᴅ&#b01919&lᴍ&#cb2424&lɪ&#e63030&lɴ'
};

let isStopped = false;

// ============================================
// /admin add/del [ник] [роль] - Управление персоналом
// ============================================

async function admin(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c Только Администратор может использовать эту команду!`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/admin add/del [ник] [роль]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const role = parseInt(args[2]);
    
    if (!target || target.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Неверный никнейм!`);
        return;
    }
    
    // Проверяем, существует ли игрок в клане
    const clanMember = await db.getClanMember(target);
    if (!clanMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в клане Resistance!`);
        return;
    }
    
    if (action === 'add') {
        if (isNaN(role) || role < 1 || role > 6) {
            sendMessage(bot, sender, `&4&l|&c Неверная роль! Доступно: &e1-6`);
            return;
        }
        
        // Куратор не может выдать роль Администратора
        const senderRank = staffRank.rank_level;
        if (senderRank === 5 && role === 6) {
            sendMessage(bot, sender, `&4&l|&c Куратор не может назначить Администратора!`);
            return;
        }
        
        // Проверяем, не выше ли роль чем у выдающего
        if (role >= senderRank && senderRank !== 6) {
            sendMessage(bot, sender, `&4&l|&c Нельзя назначить роль выше или равную вашей!`);
            return;
        }
        
        await db.run(`INSERT OR REPLACE INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by, hired_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, 
            [target, role, roleNames[role], cleanNick(sender)]);
        
        // Выдаём ранг в клане
        if (clanRankDisplay[role]) {
            bot.chat(`/c rank ${target} ${clanRankDisplay[role]}`);
        }
        
        await db.run(`UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, 
            [roleNames[role], role * 10, target]);
        await utils.sleep(500);
        bot.chat(`/cc &a👑 ${sender} назначил ${target} на должность ${roleNames[role]}`);
        await utils.sleep(500);
        sendMessage(bot, target, `&a&l|&f Поздравляем! Вы назначены на должность &e${roleNames[role]}`);
        if (addLog) addLog(`👑 ${sender} назначил ${target} на ${roleNames[role]}`, 'success');
        
    } else if (action === 'del') {
        // Проверяем, не снимает ли нижестоящий вышестоящего
        const targetRank = await db.getStaffRank(target);
        if (targetRank.rank_level >= staffRank.rank_level && staffRank.rank_level !== 6) {
            sendMessage(bot, sender, `&4&l|&c Нельзя снять с должности вышестоящего сотрудника!`);
            return;
        }
        
        await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
        await db.run(`UPDATE clan_members SET rank_name = 'Участник', rank_priority = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
        
        // Снимаем клановый ранг
        bot.chat(`/c rank ${target} &8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй`);
        
        bot.chat(`/cc &c👑 ${sender} снял с должности ${target}`);
        sendMessage(bot, target, `&c&l|&f Вы были сняты с должности &e${sender}`);
        if (addLog) addLog(`👑 ${sender} снял ${target} с должности`, 'warn');
    }
}

// ============================================
// /awarn add/del [ник] [причина] - Выговор персоналу
// ============================================

async function awarn(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    // Выдавать выговоры могут только с Ст.Модератора (уровень 3+)
    if (staffRank.rank_level < 3) {
        sendMessage(bot, sender, `&4&l|&c Выдавать выговоры могут сотрудники от Ст.Модератора!`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn add [ник] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const reason = args.slice(2).join(' ') || 'Не указана';
    
    if (!target || target.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Неверный никнейм!`);
        return;
    }
    
    const targetRank = await db.getStaffRank(target);
    
    // Нельзя выдать выговор вышестоящему
    if (targetRank.rank_level >= staffRank.rank_level) {
        sendMessage(bot, sender, `&4&l|&c Нельзя выдать выговор вышестоящему сотруднику!`);
        return;
    }
    
    if (action === 'add') {
        const newWarnings = (targetRank.awarns || 0) + 1;
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [newWarnings, target]);
        
        sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnings}/3)`);
        sendMessage(bot, target, `&c&l|&f Вы получили выговор от &e${sender}&f. Причина: &e${reason}`);
        bot.chat(`/cc &c⚠️ Выговор &e${target} &cот ${sender} (${newWarnings}/3)`);
        
        if (newWarnings >= 3) {
            // Автоматическое снятие с должности при 3 выговорах
            await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL, awarns = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
            await db.run(`UPDATE clan_members SET rank_name = 'Участник', rank_priority = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
            bot.chat(`/c rank ${target} &8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй`);
            bot.chat(`/cc &c🔻 &e${target} &cснят с должности за 3 выговора!`);
            sendMessage(bot, target, `&c&l|&f Вы сняты с должности за 3 выговора!`);
            if (addLog) addLog(`🔻 ${target} снят с должности за 3 выговора`, 'error');
        }
        
        if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const newWarnings = Math.max(0, (targetRank.awarns || 0) - 1);
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [newWarnings, target]);
        
        sendMessage(bot, sender, `&a&l|&f Выговор снят с &e${target}`);
        sendMessage(bot, target, `&a&l|&f С вас снят выговор от &e${sender}`);
        if (addLog) addLog(`✅ ${sender} снял выговор с ${target}`, 'info');
    }
}

// ============================================
// /spam [on/off] - Включение/выключение авто-модерации
// ============================================

async function spam(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    // Только с Гл.Модератора (уровень 4+)
    if (staffRank.rank_level < 4) {
        sendMessage(bot, sender, `&4&l|&c Управлять авто-модерацией могут сотрудники от Гл.Модератора!`);
        return;
    }
    
    if (args.length === 0) {
        const currentStatus = await db.getSetting('auto_mod_enabled');
        const status = currentStatus === 'true' ? '✅ ВКЛЮЧЕНА' : '❌ ВЫКЛЮЧЕНА';
        sendMessage(bot, sender, `&a&l|&f Авто-модерация: &e${status}`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'on') {
        await db.setSetting('auto_mod_enabled', 'true', sender);
        bot.chat(`/cc &a✅ Авто-модерация ВКЛЮЧЕНА ${sender}`);
        if (addLog) addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } else if (action === 'off') {
        await db.setSetting('auto_mod_enabled', 'false', sender);
        bot.chat(`/cc &c❌ Авто-модерация ВЫКЛЮЧЕНА ${sender}`);
        if (addLog) addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    } else {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/spam [on/off]`);
    }
}

// ============================================
// /r [clan/chat] [on/off] - Реклама в чате клана
// ============================================

async function r(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/r clan [on/off]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/r chat [on/off]`);
        return;
    }
    
    const type = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    
    // Рекламу клана могут редактировать от Гл.Модератора
    if (type === 'clan' && staffRank.rank_level < 4) {
        sendMessage(bot, sender, `&4&l|&c Редактировать рекламу клана могут сотрудники от Гл.Модератора!`);
        return;
    }
    
    // Рекламу в чате могут редактировать от Ст.Модератора
    if (type === 'chat' && staffRank.rank_level < 3) {
        sendMessage(bot, sender, `&4&l|&c Редактировать рекламу в чате могут сотрудники от Ст.Модератора!`);
        return;
    }
    
    if (type === 'clan') {
        if (action === 'on') {
            await db.setSetting('clan_ad_enabled', 'true', sender);
            bot.chat(`/cc &a✅ Реклама клана ВКЛЮЧЕНА`);
            if (addLog) addLog(`✅ ${sender} включил рекламу клана`, 'info');
        } else if (action === 'off') {
            await db.setSetting('clan_ad_enabled', 'false', sender);
            bot.chat(`/cc &c❌ Реклама клана ВЫКЛЮЧЕНА`);
            if (addLog) addLog(`❌ ${sender} выключил рекламу клана`, 'warn');
        }
    } else if (type === 'chat') {
        if (action === 'on') {
            await db.setSetting('chat_ad_enabled', 'true', sender);
            bot.chat(`/cc &a✅ Реклама в чате ВКЛЮЧЕНА`);
            if (addLog) addLog(`✅ ${sender} включил рекламу в чате`, 'info');
        } else if (action === 'off') {
            await db.setSetting('chat_ad_enabled', 'false', sender);
            bot.chat(`/cc &c❌ Реклама в чате ВЫКЛЮЧЕНА`);
            if (addLog) addLog(`❌ ${sender} выключил рекламу в чате`, 'warn');
        }
    }
}

// ============================================
// /logs [ник] [тип] [страница] - Логи игрока (→ Discord)
// ============================================

async function logs(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    // Доступно с Мл.Модератора
    if (staffRank.rank_level < 1) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для просмотра логов!`);
        return;
    }
    
    if (args.length < 1) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/logs [ник] [тип] [страница]`);
        sendMessage(bot, sender, `&7&l|&f Типы: &ecommands, punishments, money, chat`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const type = args[1] || 'punishments';
    const page = parseInt(args[2]) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    // Отправляем в Discord
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            let logMessage = `📋 **Логи игрока ${target}**\nТип: ${type}\nСтраница: ${page}\n\n`;
            
            if (type === 'punishments') {
                const punishments = await db.all(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) ORDER BY issued_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
                for (const p of punishments) {
                    logMessage += `• ${p.type}: ${p.reason} (${p.issued_by})\n`;
                }
            } else if (type === 'money') {
                const logs = await db.all(`SELECT * FROM money_logs WHERE LOWER(player) = LOWER(?) ORDER BY created_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
                for (const l of logs) {
                    logMessage += `• ${l.type}: ${l.amount}₽ (${l.description})\n`;
                }
            }
            
            channel.send(logMessage);
            sendMessage(bot, sender, `&a&l|&f Логи отправлены в Discord канал модерации!`);
        }
    } else {
        sendMessage(bot, sender, `&4&l|&c Discord бот не подключён!`);
    }
    
    if (addLog) addLog(`📋 ${sender} запросил логи ${target} (${type})`, 'info');
}

// ============================================
// /stopall - Остановка всех RP процессов
// ============================================

async function stopall(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c Только Администратор может использовать эту команду!`);
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
        sendMessage(bot, sender, `&4&l|&c Только Администратор может использовать эту команду!`);
        return;
    }
    
    bot.chat(`/cc &c⚠️⚠️⚠️ ${sender} ЗАПУСКАЕТ ОЧИСТКУ БАЗЫ ДАННЫХ ⚠️⚠️⚠️`);
    
    await db.setSetting('last_wipe_date', new Date().toISOString(), sender);
    
    await db.run(`DELETE FROM clan_members WHERE rank_priority < 100`);
    await db.run(`DELETE FROM rp_players WHERE structure = 'Гражданин'`);
    await db.run(`DELETE FROM property WHERE is_available = 0`);
    await db.run(`DELETE FROM punishments WHERE issued_at < datetime('now', '-30 days')`);
    await db.run(`DELETE FROM clan_chat_logs WHERE sent_at < datetime('now', '-7 days')`);
    await db.run(`DELETE FROM money_logs WHERE created_at < datetime('now', '-30 days')`);
    await db.run(`UPDATE property SET is_available = 1, owner_nick = NULL, co_owner1 = NULL, co_owner2 = NULL`);
    await db.run(`UPDATE staff_stats SET kicks_today = 0, mutes_today = 0, bl_today = 0, last_reset_date = date('now')`);
    
    bot.chat(`/cc &a✅ Очистка базы данных завершена!`);
    bot.chat(`/cc &a📅 Дата вайпа: ${new Date().toLocaleString()}`);
    if (addLog) addLog(`🗑️ ${sender} выполнил очистку БД (вайп)`, 'error');
}

// ============================================
// /wipe - Полный вайп (требует подтверждения)
// ============================================

async function wipe(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c Только Администратор может использовать эту команду!`);
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
    
    await db.addClanMember('Ronch_', 'system');
    await db.run(`INSERT OR REPLACE INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by) VALUES (?, 6, 'Администратор', 'system')`, ['ronch_']);
    await db.run(`UPDATE clan_members SET rank_name = 'Администратор', rank_priority = 100 WHERE LOWER(minecraft_nick) = LOWER('Ronch_')`);
    bot.chat(`/c rank Ronch_ ${clanRankDisplay[6]}`);
    
    bot.chat(`/cc &a✅ ПОЛНЫЙ ВАЙП ЗАВЕРШЁН! Сервер очищен.`);
    if (addLog) addLog(`💀 ${sender} выполнил полный вайп сервера!`, 'error');
}

// ============================================
// /kick [ник] [время] [причина] - Кик из клана с ЧС
// ============================================

async function clanKick(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    // Доступно всем модераторам (уровень 1+)
    if (staffRank.rank_level < 1) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для кика игроков!`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/kick [ник] [время] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Пример: &e/kick Ronch_ 31d Флуд`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const timeStr = args[1];
    const reason = args.slice(2).join(' ') || 'Не указана';
    
    // Проверяем лимиты
    const limitCheck = await db.checkStaffLimit(sender, 'kick');
    if (!limitCheck.allowed) {
        sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит киков на сегодня (${limitCheck.current}/${limitCheck.max})`);
        return;
    }
    
    // Нельзя кикнуть вышестоящего
    const targetRank = await db.getStaffRank(target);
    if (targetRank.rank_level >= staffRank.rank_level) {
        sendMessage(bot, sender, `&4&l|&c Нельзя кикнуть вышестоящего сотрудника!`);
        return;
    }
    
    let days = 31;
    if (timeStr.endsWith('d')) {
        days = parseInt(timeStr);
    } else if (timeStr.endsWith('h')) {
        days = parseInt(timeStr) / 24;
    }
    
    const durationMinutes = days * 24 * 60;
    
    bot.chat(`/c kick ${target}`);
    await utils.sleep(500);
    
    await db.addPunishment(target, 'blacklist', reason, sender, durationMinutes, 'clan');
    await db.removeClanMember(target);
    await db.incrementStaffCounter(sender, 'kick');
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aкикнут из клана на &e${days} &aдней`);
    sendMessage(bot, target, `&4&l|&c Вы кикнуты из клана Resistance на &e${days} &cдней`);
    sendMessage(bot, target, `&4&l|&c Причина: &e${reason}`);
    bot.chat(`/cc &c👢 &e${target} &cкикнут из клана на ${days} дней (${reason})`);
    
    if (addLog) addLog(`👢 ${sender} кикнул ${target} из клана на ${days} дней`, 'warn');
}

// ============================================
// /mute [ник] [время] [причина] - Мут в клановом чате
// ============================================

async function clanMute(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    if (staffRank.rank_level < 1) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для мута игроков!`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/mute [ник] [время] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Пример: &e/mute Ronch_ 30m Флуд`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const timeStr = args[1];
    const reason = args.slice(2).join(' ') || 'Не указана';
    
    const limitCheck = await db.checkStaffLimit(sender, 'mute');
    if (!limitCheck.allowed) {
        sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит мутов на сегодня (${limitCheck.current}/${limitCheck.max})`);
        return;
    }
    
    const targetRank = await db.getStaffRank(target);
    if (targetRank.rank_level >= staffRank.rank_level) {
        sendMessage(bot, sender, `&4&l|&c Нельзя замутить вышестоящего сотрудника!`);
        return;
    }
    
    let minutes = 30;
    if (timeStr.endsWith('m')) {
        minutes = parseInt(timeStr);
    } else if (timeStr.endsWith('h')) {
        minutes = parseInt(timeStr) * 60;
    } else if (timeStr.endsWith('d')) {
        minutes = parseInt(timeStr) * 24 * 60;
    }
    
    await db.addPunishment(target, 'mute', reason, sender, minutes, 'clan');
    await db.incrementStaffCounter(sender, 'mute');
    
    bot.chat(`/c mute ${target} ${reason}`);
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aзамучен на &e${minutes} &aминут`);
    sendMessage(bot, target, `&4&l|&c Вы получили мут на &e${minutes} &cминут. Причина: &e${reason}`);
    bot.chat(`/cc &c🔇 &e${target} &cзамучен на ${minutes} минут (${reason})`);
    
    // Авто-размут через указанное время
    setTimeout(async () => {
        bot.chat(`/c unmute ${target}`);
        sendMessage(bot, target, `&a&l|&f Ваш мут снят!`);
        bot.chat(`/cc &a🔊 &e${target} &aразмучен автоматически`);
    }, minutes * 60 * 1000);
    
    if (addLog) addLog(`🔇 ${sender} замутил ${target} на ${minutes} мин`, 'warn');
}

// ============================================
// /blacklist [add/del] [ник] [время] [причина] - Чёрный список клана
// ============================================

async function blacklist(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    
    if (staffRank.rank_level < 1) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для управления ЧС!`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist add [ник] [время] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    
    if (action === 'add') {
        if (args.length < 3) {
            sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist add [ник] [время] [причина]`);
            return;
        }
        
        const limitCheck = await db.checkStaffLimit(sender, 'blacklist');
        if (!limitCheck.allowed) {
            sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит ЧС на сегодня (${limitCheck.current}/${limitCheck.max})`);
            return;
        }
        
        const timeStr = args[2];
        const reason = args.slice(3).join(' ') || 'Не указана';
        
        const targetRank = await db.getStaffRank(target);
        if (targetRank.rank_level >= staffRank.rank_level) {
            sendMessage(bot, sender, `&4&l|&c Нельзя добавить в ЧС вышестоящего сотрудника!`);
            return;
        }
        
        let days = 31;
        if (timeStr.endsWith('d')) {
            days = parseInt(timeStr);
        } else if (timeStr.endsWith('h')) {
            days = parseInt(timeStr) / 24;
        }
        
        const durationMinutes = days * 24 * 60;
        
        await db.addPunishment(target, 'blacklist', reason, sender, durationMinutes, 'clan');
        await db.incrementStaffCounter(sender, 'blacklist');
        
        sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aдобавлен в ЧС на &e${days} &aдней`);
        sendMessage(bot, target, `&4&l|&c Вы добавлены в ЧС клана на &e${days} &cдней`);
        bot.chat(`/cc &c⛔ &e${target} &cдобавлен в ЧС на ${days} дней (${reason})`);
        
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС на ${days} дней`, 'warn');
        
    } else if (action === 'del') {
        await db.removePunishment(target, 'blacklist', sender, 'Снято администрацией');
        
        sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aудалён из ЧС`);
        sendMessage(bot, target, `&a&l|&f Вы удалены из ЧС клана &e${sender}`);
        bot.chat(`/cc &a✅ &e${target} &aудалён из ЧС`);
        
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС`, 'info');
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    admin,
    awarn,
    spam,
    r,
    logs,
    stopall,
    reloadbd,
    wipe,
    isSystemStopped,
    clanKick,
    clanMute,
    blacklist
};