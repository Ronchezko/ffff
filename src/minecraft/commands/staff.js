// src/minecraft/commands/staff.js
// Команды для персонала (модераторы, администраторы) с Discord интеграцией

const utils = require('../../shared/utils');
const cleanNickname = global.cleanNick(nick);
// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================



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
    await sendMessage(bot, sender, `&7&l|&f Для использования команды &e/${commandName} &fперейдите в Discord сервер Resistance`);
    await sendMessage(bot, sender, `&7&l|&f Ссылка: &e${discordLink}`);
    await sendMessage(bot, sender, `&7&l|&f В Discord доступна полная информация и логи`);
}

// Проверка, может ли модератор наказать цель
async function canPunish(executor, target, db) {
    if (executor.toLowerCase() === target.toLowerCase()) return false;
    
    const executorRank = await db.getStaffRank(executor);
    const targetRank = await db.getStaffRank(target);
    
    // Администратор может всё
    if (executorRank.rank_level >= 6) return true;
    // Куратор не может наказать Администратора
    if (executorRank.rank_level === 5 && targetRank.rank_level >= 6) return false;
    // Нельзя наказать вышестоящего
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
    return ranks[level] || 'Участник';
}

// Парсинг времени
function parseTime(timeStr) {
    let minutes = 0;
    if (timeStr.endsWith('m')) minutes = parseInt(timeStr);
    else if (timeStr.endsWith('h')) minutes = parseInt(timeStr) * 60;
    else if (timeStr.endsWith('d')) minutes = parseInt(timeStr) * 1440;
    else minutes = parseInt(timeStr);
    return isNaN(minutes) ? 0 : minutes;
}

function formatTime(minutes) {
    if (minutes >= 1440) return `${minutes / 1440}д`;
    if (minutes >= 60) return `${minutes / 60}ч`;
    return `${minutes}м`;
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/mute [ник] [время] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Пример: &e/mute Ronch_ 30m Флуд в чате`);
        return;
    }
    
    const target = args[0];
    const timeStr = args[1];
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    
    // Проверка на самого себя
    if (cleanSender === cleanTarget) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя замутить самого себя!`);
        return;
    }
    
    if (!await canPunish(sender, target, db)) {
        await sendMessage(bot, sender, `&4&l|&c Вы не можете замутить этого игрока!`);
        return;
    }
    
    const limitCheck = await db.checkStaffLimit(cleanSender, 'mute');
    if (!limitCheck.allowed) {
        await sendMessage(bot, sender, `&4&l|&c Вы исчерпали лимит мутов на сегодня (${limitCheck.current}/${limitCheck.max})!`);
        return;
    }
    
    const minutes = parseTime(timeStr);
    if (minutes <= 0) {
        await sendMessage(bot, sender, `&4&l|&c Неверный формат времени! Используйте: &e30m, 2h, 1d`);
        return;
    }
    
    await db.addPunishment(cleanTarget, 'mute', reason, sender, minutes, 'clan');
    await db.incrementStaffCounter(cleanSender, 'mute');
    
    bot.chat(`/c mute ${cleanTarget} ${reason}`);
    
    await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aзамучен на &e${formatTime(minutes)}`);
    await sendMessage(bot, target, `&4&l|&c Вы получили мут на &e${formatTime(minutes)} &cот &e${sender}`);
    await sendMessage(bot, target, `&4&l|&c Причина: &e${reason}`);
    await sendClanMessage(bot, `&c🔇 &e${target} &cполучил мут на ${formatTime(minutes)} от ${sender}`);
    
    // Авто-размут
    setTimeout(async () => {
        await db.removePunishment(cleanTarget, 'mute', 'system', 'Автоматическое снятие');
        bot.chat(`/c unmute ${cleanTarget}`);
        await sendMessage(bot, target, `&a&l|&f Ваш мут автоматически снят`);
        await sendClanMessage(bot, `&a🔊 &e${target} &aразмучен автоматически`);
    }, minutes * 60 * 1000);
    
    if (addLog) addLog(`🔇 ${sender} замутил ${target} на ${formatTime(minutes)} (${reason})`, 'warn');
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/kick [ник] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Пример: &e/kick Ronch_ Нарушение правил`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    const cleanTarget = cleanNick(target);
    
    if (cleanSender === cleanTarget) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя кикнуть самого себя!`);
        return;
    }
    
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
    
    await db.addPunishment(cleanTarget, 'kick', reason, sender, null, 'clan');
    await db.incrementStaffCounter(cleanSender, 'kick');
    await db.removeClanMember(cleanTarget);
    
    bot.chat(`/c kick ${cleanTarget}`);
    
    await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aкикнут из клана`);
    await sendMessage(bot, target, `&4&l|&c Вы кикнуты из клана &e${sender}`);
    await sendMessage(bot, target, `&4&l|&c Причина: &e${reason}`);
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist add [ник] [время] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist del [ник]`);
        await sendMessage(bot, sender, `&7&l|&f Пример времени: &e31d, 7d, 24h`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const cleanTarget = cleanNick(target);
    
    if (cleanSender === cleanTarget) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя добавить в ЧС самого себя!`);
        return;
    }
    
    if (action === 'add') {
        if (args.length < 4) {
            await sendMessage(bot, sender, `&7&l|&f Использование: &e/blacklist add [ник] [время] [причина]`);
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
        
        let minutes = parseTime(timeStr);
        if (minutes <= 0) minutes = 31 * 24 * 60; // 31 день по умолчанию
        
        await db.addPunishment(cleanTarget, 'blacklist', reason, sender, minutes, 'clan');
        await db.incrementStaffCounter(cleanSender, 'blacklist');
        await db.removeClanMember(cleanTarget);
        
        await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aдобавлен в ЧС на &e${formatTime(minutes)}`);
        await sendMessage(bot, target, `&4&l|&c Вы добавлены в чёрный список клана &e${sender}`);
        await sendMessage(bot, target, `&4&l|&c Причина: &e${reason}`);
        await sendClanMessage(bot, `&c⛔ &e${target} &cдобавлен в чёрный список клана на ${formatTime(minutes)}`);
        
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС на ${formatTime(minutes)} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const punishment = await db.get(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'blacklist' AND active = 1`, [cleanTarget]);
        if (!punishment) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне в чёрном списке!`);
            return;
        }
        
        // Проверка: вышестоящий модератор не может снять наказание нижестоящего
        const issuerRank = await db.getStaffRank(punishment.issued_by);
        if (staffRank.rank_level <= issuerRank.rank_level && staffRank.rank_level < 6) {
            await sendMessage(bot, sender, `&4&l|&c Вы не можете снять наказание, выданное вышестоящим сотрудником!`);
            return;
        }
        
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/check [ник]`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const profile = await db.getRPProfile(target);
    const clanMember = await db.getClanMember(target);
    const punishments = await db.all(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND active = 1`, [target]);
    
    // Отправляем в Discord
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            let msg = `📋 **Информация об игроке ${target}**\n\n`;
            msg += `👤 **В клане:** ${clanMember ? '✅ Да' : '❌ Нет'}\n`;
            if (profile) {
                msg += `💰 **Баланс:** ${profile.money?.toLocaleString()}₽\n`;
                msg += `🏢 **Структура:** ${profile.structure}\n`;
                msg += `⭐ **Ранг:** ${profile.job_rank}\n`;
                msg += `🎯 **Баллы RP:** ${profile.rp_points || 0}\n`;
                msg += `⚠️ **Предупреждения:** ${profile.warnings || 0}/3\n`;
                msg += `❄️ **Заморожен:** ${profile.is_frozen ? '✅ Да' : '❌ Нет'}\n`;
            }
            if (punishments.length > 0) {
                msg += `\n🔨 **Активные наказания:** ${punishments.length}\n`;
            }
            channel.send(msg);
        }
    }
    
    await sendMessage(bot, sender, `&a&l|&f Информация об игроке &e${target} &aотправлена в Discord`);
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/logs [ник] [тип] [страница]`);
        await sendMessage(bot, sender, `&7&l|&f Типы: &epunishments, money, chat`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const type = args[1] || 'punishments';
    const page = parseInt(args[2]) || 1;
    const limit = 15;
    const offset = (page - 1) * limit;
    
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            let msg = `📋 **Логи игрока ${target}**\nТип: ${type}\nСтраница: ${page}\n\n`;
            
            if (type === 'punishments') {
                const punishments = await db.all(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) ORDER BY issued_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
                for (const p of punishments) {
                    msg += `• ${p.type}: ${p.reason} (${p.issued_by}, ${new Date(p.issued_at).toLocaleString()})\n`;
                }
            } else if (type === 'money') {
                const moneyLogs = await db.all(`SELECT * FROM money_logs WHERE LOWER(player) = LOWER(?) ORDER BY created_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
                for (const l of moneyLogs) {
                    msg += `• ${l.type}: ${l.amount}₽ (${l.description || '-'})\n`;
                }
            } else if (type === 'chat') {
                const chatLogs = await db.all(`SELECT * FROM clan_chat_logs WHERE LOWER(player) = LOWER(?) ORDER BY sent_at DESC LIMIT ? OFFSET ?`, [target, limit, offset]);
                for (const c of chatLogs) {
                    msg += `• ${c.message.substring(0, 50)}... (${new Date(c.sent_at).toLocaleString()})\n`;
                }
            }
            
            if (msg.length > 1900) msg = msg.substring(0, 1900) + '\n...';
            channel.send(msg);
        }
    }
    
    await sendMessage(bot, sender, `&a&l|&f Логи игрока &e${target} &aотправлены в Discord`);
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn add [ник] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/awarn del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    
    if (cleanSender === cleanTarget) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя выдать выговор самому себе!`);
        return;
    }
    
    const targetStaff = await db.getStaffRank(cleanTarget);
    if (targetStaff.rank_level === 0) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в персонале!`);
        return;
    }
    
    if (targetStaff.rank_level >= staffRank.rank_level && staffRank.rank_level < 6) {
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
        await db.addPunishment(cleanTarget, 'staff_warn', reason, sender, null, 'clan');
        
        await sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnCount}/3)`);
        await sendMessage(bot, target, `&4&l|&f Вы получили выговор от &e${sender}`);
        await sendMessage(bot, target, `&4&l|&f Причина: &e${reason}`);
        await sendClanMessage(bot, `&c⚠️ &e${target} &cполучил выговор от ${sender} (${newWarnCount}/3)`);
        
        if (newWarnCount >= 3) {
            const oldRank = targetStaff.rank_level;
            await db.run(`UPDATE staff_stats SET rank_level = 0, rank_name = NULL, awarns = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanTarget]);
            await db.run(`UPDATE clan_members SET rank_name = 'Участник', rank_priority = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanTarget]);
            bot.chat(`/c rank ${target} &8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй`);
            
            await sendMessage(bot, target, `&4&l|&c Вы сняты с должности за 3 выговора!`);
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
        await sendClanMessage(bot, `&a✅ Авто-модерация ВКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } else if (state === 'off') {
        await db.setSetting('auto_mod_enabled', 'false', sender);
        await sendClanMessage(bot, `&c❌ Авто-модерация ВЫКЛЮЧЕНА &e${sender}`);
        if (addLog) addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    } else {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/spam on/off`);
    }
}

// ============================================
// /r clan/chat [on/off] - Реклама в клановом чате
// ============================================

async function r(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/r [clan/chat] [on/off]`);
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
        await sendMessage(bot, sender, `&7&l|&f Использование: &eon/off`);
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
    
    const staff = await db.all(`SELECT * FROM staff_stats WHERE rank_level > 0 ORDER BY rank_level DESC`);
    
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            let msg = `📋 **Список персонала Resistance**\n\n`;
            for (const s of staff) {
                msg += `• **${s.minecraft_nick}** - ${getRankName(s.rank_level)}`;
                if (s.awarns > 0) msg += ` ⚠️${s.awarns}/3`;
                msg += `\n`;
            }
            channel.send(msg);
        }
    }
    
    await sendMessage(bot, sender, `&a&l|&f Список персонала отправлен в Discord`);
}

// ============================================
// /staff stats [ник] - Статистика персонала (→ Discord)
// ============================================

async function staffStats(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования этой команды!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/staff stats [ник]`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const targetStaff = await db.getStaffRank(target);
    
    if (targetStaff.rank_level === 0) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в персонале!`);
        return;
    }
    
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            let msg = `📋 **Статистика персонала ${target}**\n\n`;
            msg += `⭐ **Ранг:** ${getRankName(targetStaff.rank_level)}\n`;
            msg += `⚠️ **Выговоры:** ${targetStaff.awarns || 0}/3\n`;
            msg += `👢 **Киков сегодня:** ${targetStaff.kicks_today || 0}\n`;
            msg += `🔇 **Мутов сегодня:** ${targetStaff.mutes_today || 0}\n`;
            msg += `⛔ **ЧС сегодня:** ${targetStaff.bl_today || 0}\n`;
            if (targetStaff.hired_at) {
                msg += `📅 **Назначен:** ${new Date(targetStaff.hired_at).toLocaleDateString()}\n`;
            }
            channel.send(msg);
        }
    }
    
    await sendMessage(bot, sender, `&a&l|&f Статистика персонала &e${target} &aотправлена в Discord`);
}

// ============================================
// /unfreeze [ник] - Разморозка RP профиля
// ============================================

async function unfreeze(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const staffRank = await db.getStaffRank(cleanSender);
    
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для разморозки!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/unfreeze [ник]`);
        return;
    }
    
    const target = cleanNick(args[0]);
    
    // Проверяем, зарегистрирован ли игрок в RP
    const player = await db.getRPProfile(target);
    if (!player) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP!`);
        return;
    }
    
    if (player.is_frozen !== 1) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне заморожен в RP`);
        return;
    }
    
    // Размораживаем
    await db.run(`UPDATE rp_players SET is_frozen = 0, structure = 'Гражданин', job_rank = 'Нет' WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
    
    await sendMessage(bot, sender, `&a&l|&f Вы &2успешно&f разморозили игрока &e${target}`);
    await sendMessage(bot, target, `&a&l|&f Ваш RP профиль &2разморожен&f! Можете снова участвовать в RP`);
    bot.chat(`/cc &a✅ &e${target} &aразморожен в RP ${sender}`);
    
    const discord = global.botComponents.discord;
    if (discord && discord.client) {
        const channel = discord.client.channels.cache.get('1474633679442804798');
        if (channel) {
            channel.send(`✅ **RP Разморозка**\nИгрок: ${target}\nРазморозил: ${sender}`);
        }
    }
    
    if (addLog) addLog(`✅ ${sender} разморозил ${target} в RP`, 'info');
}

// ============================================
// ЭКСПОРТ ВСЕХ КОМАНД
// ============================================

module.exports = {
    mute,
    kick,
    blacklist,
    check,
    logs,
    awarn,
    spam,
    r,
    staffList,
    staffStats,
    unfreeze
};