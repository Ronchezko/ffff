// src/minecraft/commands/staff.js
// Команды для персонала (модераторы, администраторы) с Discord интеграцией

const utils = require('../../shared/utils');

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}

async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

async function sendClanMessage(bot, message) {
    bot.chat(`/cc ${message}`);
    await utils.sleep(300);
}

// Отправка сообщения о необходимости использовать Discord
async function sendDiscordRedirect(bot, sender, commandName) {
    const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/resistance';
    await sendMessage(bot, sender, `&e&l|&f Для использования команды &e/${commandName} &fперейдите в Discord сервер Resistance`);
    await sendMessage(bot, sender, `&7&l|&f Ссылка: &e${discordLink}`);
    await sendMessage(bot, sender, `&7&l|&f В Discord доступна полная информация и логи`);
}

// Проверка, может ли модератор наказать цель
async function canPunish(executor, target, db) {
    const executorRank = await db.getStaffRank(executor);
    const targetRank = await db.getStaffRank(target);
    
    if (executorRank.rank_level >= 6) return true;
    if (executorRank.rank_level <= targetRank.rank_level) return false;
    return true;
}

// Получение названия ранга по уровню
function getRankName(level) {
    const ranks = {
        1: 'Мл.Модератор',
        2: 'Модератор',
        3: 'Ст.Модератор',
        4: 'Гл.Модератор',
        5: 'Куратор',
        6: 'Администратор'
    };
    return ranks[level] || 'Неизвестно';
}

// ============================================
// /mute [ник] [время] [причина] - Мут в клановом чате
// ============================================

async function mute(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 3) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/mute [ник] [время] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Время: &e10m, 1h, 1d`);
        return;
    }
    
    const target = args[0];
    const timeStr = args[1];
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    
    if (!await canPunish(sender, target, db)) {
        await sendMessage(bot, sender, `&4&l|&c Вы не можете замутить этого игрока!`);
        return;
    }
    
    const limitCheck = await db.checkStaffLimit(cleanSender, 'mute');
    if (!limitCheck.allowed) {
        await sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит мутов на сегодня (${limitCheck.current}/${limitCheck.max})!`);
        return;
    }
    
    let minutes = 0;
    if (timeStr.endsWith('m')) minutes = parseInt(timeStr);
    else if (timeStr.endsWith('h')) minutes = parseInt(timeStr) * 60;
    else if (timeStr.endsWith('d')) minutes = parseInt(timeStr) * 1440;
    else minutes = parseInt(timeStr);
    
    if (isNaN(minutes) || minutes <= 0) {
        await sendMessage(bot, sender, `&4&l|&c Неверный формат времени! Используйте: &e10m, 1h, 1d`);
        return;
    }
    
    await db.addPunishment(cleanTarget, 'mute', reason, sender, minutes, 'clan');
    await db.incrementStaffCounter(cleanSender, 'mute');
    
    bot.chat(`/c mute ${cleanTarget} ${reason}`);
    
    await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aзамучен на &e${timeStr}`);
    await sendMessage(bot, target, `&c&l|&f Вы получили мут на &e${timeStr} &cот &e${sender}&f. Причина: &e${reason}`);
    await sendClanMessage(bot, `&c🔇 &e${target} &cполучил мут на ${timeStr} от ${sender}`);
    
    setTimeout(async () => {
        await db.removePunishment(cleanTarget, 'mute', 'system', 'Автоматическое снятие');
        bot.chat(`/c unmute ${cleanTarget}`);
        await sendMessage(bot, target, `&a&l|&f Ваш мут автоматически снят`);
        await sendClanMessage(bot, `&a🔊 &e${target} &aразмучен автоматически`);
    }, minutes * 60 * 1000);
    
    if (addLog) addLog(`🔇 ${sender} замутил ${target} на ${timeStr} (${reason})`, 'warn');
}

// ============================================
// /kick [ник] [причина] - Кик из клана
// ============================================

async function kick(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/kick [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    const cleanTarget = cleanNick(target);
    
    if (!await canPunish(sender, target, db)) {
        await sendMessage(bot, sender, `&4&l|&c Вы не можете кикнуть этого игрока!`);
        return;
    }
    
    const limitCheck = await db.checkStaffLimit(cleanSender, 'kick');
    if (!limitCheck.allowed) {
        await sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит киков на сегодня (${limitCheck.current}/${limitCheck.max})!`);
        return;
    }
    
    const member = await db.getClanMember(cleanTarget);
    if (!member) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в клане!`);
        return;
    }
    
    await db.addPunishment(cleanTarget, 'kick', reason, sender, null);
    await db.incrementStaffCounter(cleanSender, 'kick');
    await db.removeClanMember(cleanTarget);
    
    bot.chat(`/c kick ${cleanTarget}`);
    
    await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aкикнут из клана`);
    await sendMessage(bot, target, `&c&l|&f Вы кикнуты из клана &e${sender}&f. Причина: &e${reason}`);
    await sendClanMessage(bot, `&c👢 &e${target} &cкикнут из клана ${sender}`);
    
    if (addLog) addLog(`👢 ${sender} кикнул ${target} (${reason})`, 'warn');
}

// ============================================
// /blacklist add/del [ник] [время] [причина] - Чёрный список
// ============================================

async function blacklist(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/blacklist add [ник] [время] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const cleanTarget = cleanNick(target);
    
    if (action === 'add') {
        if (args.length < 4) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/blacklist add [ник] [время] [причина]`);
            return;
        }
        
        if (!await canPunish(sender, target, db)) {
            await sendMessage(bot, sender, `&4&l|&c Вы не можете добавить этого игрока в ЧС!`);
            return;
        }
        
        const timeStr = args[2];
        const reason = args.slice(3).join(' ');
        
        const limitCheck = await db.checkStaffLimit(cleanSender, 'blacklist');
        if (!limitCheck.allowed) {
            await sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит ЧС на сегодня (${limitCheck.current}/${limitCheck.max})!`);
            return;
        }
        
        let minutes = 0;
        if (timeStr.endsWith('h')) minutes = parseInt(timeStr) * 60;
        else if (timeStr.endsWith('d')) minutes = parseInt(timeStr) * 1440;
        else minutes = parseInt(timeStr);
        
        await db.addPunishment(cleanTarget, 'blacklist', reason, sender, minutes);
        await db.incrementStaffCounter(cleanSender, 'blacklist');
        await db.removeClanMember(cleanTarget);
        
        await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aдобавлен в ЧС на &e${timeStr}`);
        await sendMessage(bot, target, `&c&l|&f Вы добавлены в чёрный список клана &e${sender}&f. Причина: &e${reason}`);
        await sendClanMessage(bot, `&c⛔ &e${target} &cдобавлен в чёрный список клана`);
        
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС (${reason})`, 'warn');
        
    } else if (action === 'del') {
        await db.removePunishment(cleanTarget, 'blacklist', sender, 'Снятие по запросу');
        
        await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aудалён из ЧС`);
        await sendMessage(bot, target, `&a&l|&f Вы удалены из чёрного списка клана &e${sender}`);
        await sendClanMessage(bot, `&a✅ &e${target} &aудалён из чёрного списка`);
        
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС`, 'info');
    }
}
// ============================================
// /check [ник] - Информация об игроке (→ Discord)
// ============================================

async function check(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/check [ник]`);
        return;
    }
    
    // Отправляем в Discord (личные данные игрока)
    await sendDiscordRedirect(bot, sender, 'check');
}

// ============================================
// /logs [ник] [тип] [страница] - Логи игрока (→ Discord)
// ============================================

async function logs(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/logs [ник] [тип] [страница]`);
        await sendMessage(bot, sender, `&7&l|&f Типы: &echat, money, punishments`);
        return;
    }
    
    // Отправляем в Discord (логи игрока)
    await sendDiscordRedirect(bot, sender, 'logs');
}

// ============================================
// /awarn add/del [ник] [причина] - Выговор персоналу
// ============================================

async function awarn(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 3) {
        await sendMessage(bot, sender, `&4&l|&c Выдавать выговоры могут только Ст.Модераторы+!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/awarn add [ник] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    
    const targetStaff = await db.getStaffRank(cleanTarget);
    if (targetStaff.rank_level === 0) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в персонале!`);
        return;
    }
    
    if (targetStaff.rank_level >= staffRank.rank_level) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя выдать выговор вышестоящему сотруднику!`);
        return;
    }
    
    if (action === 'add') {
        if (!reason) {
            await sendMessage(bot, sender, `&4&l|&c Укажите причину выговора!`);
            return;
        }
        
        const currentWarns = targetStaff.awarns || 0;
        const newWarnCount = currentWarns + 1;
        
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [newWarnCount, cleanTarget]);
        await db.addPunishment(cleanTarget, 'staff_warn', reason, sender, null);
        
        await sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnCount}/3)`);
        await sendMessage(bot, target, `&c&l|&f Вы получили выговор от &e${sender}&f. Причина: &e${reason}`);
        await sendClanMessage(bot, `&c⚠️ &e${target} &cполучил выговор от ${sender} (${newWarnCount}/3)`);
        
        if (newWarnCount >= 3) {
            await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanTarget]);
            await sendMessage(bot, target, `&c&l|&f Вы сняты с должности за 3 выговора!`);
            await sendClanMessage(bot, `&c🔻 &e${target} &cснят с должности за 3 выговора`);
            if (addLog) addLog(`🔻 ${target} снят с должности за 3 выговора`, 'error');
        }
        
        if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const currentWarns = targetStaff.awarns || 0;
        if (currentWarns === 0) {
            await sendMessage(bot, sender, `&4&l|&c У &e${target} &cнет выговоров!`);
            return;
        }
        
        await db.run(`UPDATE staff_stats SET awarns = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [currentWarns - 1, cleanTarget]);
        
        await sendMessage(bot, sender, `&a&l|&f Выговор снят с &e${target}`);
        await sendMessage(bot, target, `&a&l|&f С вас снят выговор &e${sender}`);
        await sendClanMessage(bot, `&a✅ &e${target} &a- выговор снят ${sender}`);
        
        if (addLog) addLog(`✅ ${sender} снял выговор с ${target}`, 'info');
    }
}
// ============================================
// /spam [on/off] - Включение/выключение авто-модерации
// ============================================

async function spam(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 4) {
        await sendMessage(bot, sender, `&4&l|&c Управлять авто-модерацией могут только Гл.Модераторы+!`);
        return;
    }
    
    if (args.length === 0) {
        const current = await db.getSetting('auto_mod_enabled');
        await sendMessage(bot, sender, `&a&l|&f Авто-модерация: &e${current === 'true' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}`);
        return;
    }
    
    const state = args[0].toLowerCase();
    
    if (state === 'on') {
        await db.setSetting('auto_mod_enabled', 'true', sender);
        await sendClanMessage(bot, `&a✅ Авто-модерация &aВКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } else if (state === 'off') {
        await db.setSetting('auto_mod_enabled', 'false', sender);
        await sendClanMessage(bot, `&c❌ Авто-модерация &cВЫКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    } else {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/spam on/off`);
    }
}

// ============================================
// /r clan/chat [on/off] - Реклама в клановом чате
// ============================================

async function r(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/r [clan/chat] [on/off]`);
        return;
    }
    
    const target = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    
    let settingKey;
    if (target === 'clan') settingKey = 'clan_ad_enabled';
    else if (target === 'chat') settingKey = 'chat_ad_enabled';
    else {
        await sendMessage(bot, sender, `&4&l|&c Доступные цели: &eclan, chat`);
        return;
    }
    
    if (target === 'clan' && staffRank.rank_level < 4) {
        await sendMessage(bot, sender, `&4&l|&c Рекламу клана могут редактировать Гл.Модераторы+`);
        return;
    }
    if (target === 'chat' && staffRank.rank_level < 3) {
        await sendMessage(bot, sender, `&4&l|&c Рекламу в чате могут редактировать Ст.Модераторы+`);
        return;
    }
    
    if (action !== 'on' && action !== 'off') {
        await sendMessage(bot, sender, `&4&l|&c Использование: &eon/off`);
        return;
    }
    
    const newState = action === 'on' ? 'true' : 'false';
    await db.setSetting(settingKey, newState, sender);
    
    await sendClanMessage(bot, `&a✅ Реклама ${target === 'clan' ? 'клана' : 'в чате'} ${action === 'on' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'} &e${sender}`);
    if (addLog) addLog(`📢 ${sender} ${action === 'on' ? 'включил' : 'выключил'} рекламу ${target}`, 'info');
}

// ============================================
// /staff list - Список персонала (→ Discord)
// ============================================

async function staffList(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    // Отправляем в Discord (список персонала)
    await sendDiscordRedirect(bot, sender, 'staff list');
}

// ============================================
// /staff stats [ник] - Статистика персонала (→ Discord)
// ============================================
// /arp unfreeze <ник>
async function arpUnfreeze(sender, args, bot, db) {
    const target = args[2];
    
    if (!target) {
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/arp unfreeze <ник>`);
        return;
    }
    
    // Проверка прав (минимум модератор)
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 1) {
        bot.chat(`/msg ${sender} &4&l|&c У вас нет прав для разморозки`);
        return;
    }
    
    // Проверяем, заморожен ли игрок
    const player = await db.get(
        `SELECT is_frozen FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [target]
    );
    
    if (!player || player.is_frozen !== 1) {
        bot.chat(`/msg ${sender} &4&l|&c Игрок &e${target} &cне заморожен в RP`);
        return;
    }
    
    // Размораживаем
    await db.run(
        `UPDATE rp_players SET is_frozen = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [target]
    );
    
    bot.chat(`/msg ${sender} &a&l|&f Вы &2успешно&f разморозили игрока &e${target}`);
    bot.chat(`/msg ${target} &a&l|&f Ваш RP профиль &2разморожен&f! Можете снова участвовать в RP`);
    
    // Логируем в Discord
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            channel.send(`✅ **RP Разморозка**\nИгрок: ${target}\nРазморозил: ${sender}`);
        }
    }
}
async function staffStats(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/staff stats [ник]`);
        return;
    }
    
    // Отправляем в Discord (статистика персонала)
    await sendDiscordRedirect(bot, sender, 'staff stats');
}

// ============================================
// ЭКСПОРТ ВСЕХ КОМАНД
// ============================================

module.exports = {
    // Основные наказания
    mute,
    kick,
    blacklist,
    arpUnfreeze,
    // Информационные (→ Discord)
    check,        // → Discord
    logs,         // → Discord
    staffList,    // → Discord
    staffStats,   // → Discord
    
    // Выговоры персоналу
    awarn,
    
    // Настройки
    spam,
    r
};
