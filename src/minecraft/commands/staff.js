// src/minecraft/commands/staff.js
// Команды для персонала (ПОЛНАЯ ВЕРСИЯ)

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// /mute [ник] [время] [причина] - Мут игрока
// ============================================

async function mute(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/mute [ник] [время] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Время: &e10m, 1h, 1d`);
        return;
    }
    
    const target = args[0];
    const timeStr = args[1];
    const reason = args.slice(2).join(' ');
    
    // Парсим время
    let minutes = 0;
    if (timeStr.endsWith('m')) minutes = parseInt(timeStr);
    else if (timeStr.endsWith('h')) minutes = parseInt(timeStr) * 60;
    else if (timeStr.endsWith('d')) minutes = parseInt(timeStr) * 1440;
    else minutes = parseInt(timeStr);
    
    if (isNaN(minutes) || minutes <= 0) {
        sendMessage(bot, sender, `&4&l|&c Неверный формат времени! Используйте: &e10m, 1h, 1d`);
        return;
    }
    
    // Проверяем лимиты персонала
    const limits = await db.checkStaffLimit?.(sender, 'mute');
    if (limits && !limits.allowed) {
        sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит мутов на сегодня (${limits.current}/${limits.max})`);
        return;
    }
    
    await db.addPunishment(target, 'mute', reason, sender, minutes, 'clan');
    if (limits) await db.incrementStaffCounter?.(sender, 'mute');
    bot.chat(`/c mute ${target} ${reason}`);
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aзамучен на &e${timeStr}`);
    bot.chat(`/cc &c🔇 &e${target} &cполучил мут от &e${sender} &cна &e${timeStr}`);
    
    // Авто-снятие мута
    setTimeout(async () => {
        await db.removePunishment(target, 'mute', 'system', 'Автоматическое снятие');
        bot.chat(`/c unmute ${target}`);
        bot.chat(`/cc &a🔊 &e${target} &aразмучен автоматически`);
    }, minutes * 60 * 1000);
    
    if (addLog) addLog(`🔇 ${sender} замутил ${target} на ${timeStr}`, 'warn');
}

// ============================================
// /kick [ник] [причина] - Кик из клана
// ============================================

async function kick(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/kick [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const member = await db.getClanMember(target);
    if (!member) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в клане`);
        return;
    }
    
    // Проверяем лимиты
    const limits = await db.checkStaffLimit?.(sender, 'kick');
    if (limits && !limits.allowed) {
        sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит киков на сегодня (${limits.current}/${limits.max})`);
        return;
    }
    
    await db.removeClanMember(target);
    if (limits) await db.incrementStaffCounter?.(sender, 'kick');
    bot.chat(`/c kick ${target}`);
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aкикнут из клана`);
    bot.chat(`/cc &c👢 &e${target} &cкикнут из клана &e${sender}`);
    
    if (addLog) addLog(`👢 ${sender} кикнул ${target}`, 'warn');
}

// ============================================
// /blacklist add/del [ник] [время] [причина]
// ============================================

async function blacklist(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/blacklist add [ник] [время] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    
    if (action === 'add') {
        if (args.length < 4) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/blacklist add [ник] [время] [причина]`);
            return;
        }
        
        const timeStr = args[2];
        const reason = args.slice(3).join(' ');
        
        // Проверяем лимиты
        const limits = await db.checkStaffLimit?.(sender, 'blacklist');
        if (limits && !limits.allowed) {
            sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит ЧС на сегодня (${limits.current}/${limits.max})`);
            return;
        }
        
        let minutes = 0;
        if (timeStr.endsWith('h')) minutes = parseInt(timeStr) * 60;
        else if (timeStr.endsWith('d')) minutes = parseInt(timeStr) * 1440;
        else minutes = parseInt(timeStr);
        
        await db.addPunishment(target, 'blacklist', reason, sender, minutes);
        if (limits) await db.incrementStaffCounter?.(sender, 'blacklist');
        await db.removeClanMember(target);
        
        sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aдобавлен в ЧС на &e${timeStr}`);
        bot.chat(`/cc &c⛔ &e${target} &cдобавлен в чёрный список &e${sender}`);
        
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС`, 'warn');
        
    } else if (action === 'del') {
        await db.removePunishment(target, 'blacklist', sender, 'Снятие по запросу');
        sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aудалён из ЧС`);
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС`, 'info');
    } else {
        sendMessage(bot, sender, `&4&l|&c Неизвестное действие. Используйте &eadd&c или &edel`);
    }
}

// ============================================
// /check [ник] - Проверить игрока
// ============================================

async function check(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/check [ник]`);
        return;
    }
    
    const target = args[0];
    const member = await db.getClanMember(target);
    const rp = await db.getRPProfile(target);
    const isMuted = await db.isMuted(target);
    const isBlacklisted = await db.isBlacklisted?.(target) || false;
    
    if (!member && !rp) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне найден`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f ${target}`);
    if (member) sendMessage(bot, sender, `&7&l|&f Ранг в клане: &e${member.rank_name} &7| Убийств/Смертей: &e${member.kills || 0}/${member.deaths || 0}`);
    if (rp) sendMessage(bot, sender, `&7&l|&f Структура: &e${rp.structure} &7| Ранг: &e${rp.job_rank} &7| Баланс: &e${rp.money?.toLocaleString() || 0}₽`);
    if (isMuted) sendMessage(bot, sender, `&7&l|&f Статус: &c🔇 В муте`);
    if (isBlacklisted) sendMessage(bot, sender, `&7&l|&f Статус: &c⛔ В чёрном списке`);
}

// ============================================
// /spam [on/off] - Включение/выключение авто-модерации
// ============================================

async function spam(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 4) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для управления авто-модерацией`);
        return;
    }
    
    if (args.length === 0) {
        const current = await db.getSetting('auto_mod_enabled');
        sendMessage(bot, sender, `&a&l|&f Авто-модерация: &e${current === 'true' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}`);
        return;
    }
    
    const state = args[0].toLowerCase();
    if (state === 'on') {
        await db.setSetting('auto_mod_enabled', 'true', sender);
        bot.chat(`/cc &a&l|&f Авто-модерация &aВКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } else if (state === 'off') {
        await db.setSetting('auto_mod_enabled', 'false', sender);
        bot.chat(`/cc &c&l|&f Авто-модерация &cВЫКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    } else {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/spam on/off`);
    }
}

// ============================================
// /r clan/chat [on/off] - Реклама в клановом чате
// ============================================

async function r(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/r [clan/chat] [on/off]`);
        return;
    }
    
    const target = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    
    let settingKey;
    if (target === 'clan') settingKey = 'clan_ad_enabled';
    else if (target === 'chat') settingKey = 'chat_ad_enabled';
    else {
        sendMessage(bot, sender, `&4&l|&c Доступные цели: &eclan, chat`);
        return;
    }
    
    const staffRank = await db.getStaffRank(sender);
    if (target === 'clan' && staffRank.rank_level < 4) {
        sendMessage(bot, sender, `&4&l|&c Рекламу клана могут редактировать Гл.Модераторы+`);
        return;
    }
    if (target === 'chat' && staffRank.rank_level < 3) {
        sendMessage(bot, sender, `&4&l|&c Рекламу в чате могут редактировать Ст.Модераторы+`);
        return;
    }
    
    let newState;
    if (action === 'on') newState = 'true';
    else if (action === 'off') newState = 'false';
    else {
        sendMessage(bot, sender, `&4&l|&c Использование: &eon/off`);
        return;
    }
    
    await db.setSetting(settingKey, newState, sender);
    bot.chat(`/cc &a&l|&f Реклама ${target === 'clan' ? 'клана' : 'в чате'} ${newState === 'true' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'} &e${sender}`);
    if (addLog) addLog(`📢 ${sender} ${newState === 'true' ? 'включил' : 'выключил'} рекламу ${target}`, 'info');
}

// ============================================
// /logs [ник] [тип] [страница] - Просмотр логов
// ============================================

async function logs(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 1) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для просмотра логов`);
        return;
    }
    
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/logs [ник] [тип] [страница]`);
        sendMessage(bot, sender, `&7&l|&f Типы: &echat, money, punishments`);
        return;
    }
    
    const target = args[0];
    const type = args[1] || 'chat';
    const page = parseInt(args[2]) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;
    
    let logs = [];
    let total = 0;
    
    try {
        if (type === 'chat') {
            logs = await db.all(`SELECT * FROM clan_chat_logs WHERE player = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
            total = (await db.get(`SELECT COUNT(*) as count FROM clan_chat_logs WHERE player = ?`, [target]))?.count || 0;
        } else if (type === 'money') {
            logs = await db.all(`SELECT * FROM money_logs WHERE player = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
            total = (await db.get(`SELECT COUNT(*) as count FROM money_logs WHERE player = ?`, [target]))?.count || 0;
        } else if (type === 'punishments') {
            logs = await db.all(`SELECT * FROM punishments WHERE player = ? ORDER BY issued_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
            total = (await db.get(`SELECT COUNT(*) as count FROM punishments WHERE player = ?`, [target]))?.count || 0;
        } else {
            sendMessage(bot, sender, `&4&l|&c Неизвестный тип. Доступно: &echat, money, punishments`);
            return;
        }
    } catch (err) {
        sendMessage(bot, sender, `&4&l|&c Ошибка получения логов: ${err.message}`);
        return;
    }
    
    if (logs.length === 0) {
        sendMessage(bot, sender, `&4&l|&c Логи для &e${target} &cне найдены`);
        return;
    }
    
    const totalPages = Math.ceil(total / limit);
    sendMessage(bot, sender, `&a&l|&f Логи &e${type} &fдля &e${target} &7(стр. ${page}/${totalPages})`);
    
    for (const log of logs) {
        if (type === 'chat') {
            sendMessage(bot, sender, `&7&l|&f [${log.sent_at?.slice(0, 16)}] &e${log.player}: &f${log.message?.substring(0, 50)}`);
        } else if (type === 'money') {
            const sign = log.amount > 0 ? '+' : '';
            sendMessage(bot, sender, `&7&l|&f [${log.created_at?.slice(0, 16)}] &e${sign}${log.amount}₽ &7- ${log.description}`);
        } else if (type === 'punishments') {
            sendMessage(bot, sender, `&7&l|&f [${log.issued_at?.slice(0, 16)}] &c${log.type} &7от &e${log.issued_by}: &f${log.reason}`);
        }
    }
    
    if (page < totalPages) {
        sendMessage(bot, sender, `&7&l|&f Следующая страница: &e/logs ${target} ${type} ${page + 1}`);
    }
}

// ============================================
// /awarn add/del [ник] [причина] - Выговор персоналу
// ============================================

async function awarn(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 3) {
        sendMessage(bot, sender, `&4&l|&c Выдавать выговоры могут только Ст.Модераторы+`);
        return;
    }
    
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/awarn add [ник] [причина]`);
        sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ');
    
    const targetStaff = await db.getStaffRank(target);
    if (targetStaff.rank_level === 0) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в персонале`);
        return;
    }
    
    if (targetStaff.rank_level >= staffRank.rank_level) {
        sendMessage(bot, sender, `&4&l|&c Нельзя выдать выговор вышестоящему сотруднику`);
        return;
    }
    
    if (action === 'add') {
        if (!reason) {
            sendMessage(bot, sender, `&4&l|&c Укажите причину выговора`);
            return;
        }
        
        const currentWarns = targetStaff.awarns || 0;
        const newWarnCount = currentWarns + 1;
        
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE minecraft_nick = ?`, [newWarnCount, target]);
        await db.addPunishment(target, 'staff_warn', reason, sender, null);
        
        sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnCount}/3)`);
        bot.chat(`/cc &c⚠️ &e${target} &cполучил выговор от &e${sender} &7(${newWarnCount}/3)`);
        
        if (newWarnCount >= 3) {
            await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL WHERE minecraft_nick = ?`, [target]);
            bot.chat(`/cc &c🔻 &e${target} &cснят с должности за 3 выговора`);
            if (addLog) addLog(`🔻 ${target} снят с должности за 3 выговора`, 'error');
        }
        
        if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const currentWarns = targetStaff.awarns || 0;
        if (currentWarns === 0) {
            sendMessage(bot, sender, `&4&l|&c У &e${target} &cнет выговоров`);
            return;
        }
        
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE minecraft_nick = ?`, [currentWarns - 1, target]);
        sendMessage(bot, sender, `&a&l|&f Выговор снят с &e${target}`);
        bot.chat(`/cc &a✅ &e${target} &a- выговор снят &e${sender}`);
        if (addLog) addLog(`✅ ${sender} снял выговор с ${target}`, 'info');
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    mute,
    kick,
    blacklist,
    check,
    spam,
    r,
    logs,
    awarn
};