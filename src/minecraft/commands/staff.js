// src/minecraft/commands/staff.js
// Команды для модераторов и администрации клана

const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');

// ============================================
// /mute [ник] [время] [причина] - Мут игрока в клановом чате
// ============================================
// /automod [on/off/config] - Управление авто-модерацией
async function automod(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank?.(sender) || { rank_level: 0 };
    if (staffRank.rank_level < 4) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для управления авто-модерацией!`);
        return;
    }
    
    const moderation = await getModerationSystem(bot, db, addLog);
    
    if (args.length === 0) {
        const status = moderation.config.enabled ? '&aВКЛЮЧЕНА' : '&cВЫКЛЮЧЕНА';
        bot.chat(`/msg ${sender} &6🤖 Авто-модерация: ${status}`);
        return;
    }
    
    if (args[0].toLowerCase() === 'on') {
        moderation.config.enabled = true;
        await moderation.saveConfig();
        bot.chat(`/cc &a✅ Авто-модерация ВКЛЮЧЕНА ${sender}`);
        addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } 
    else if (args[0].toLowerCase() === 'off') {
        moderation.config.enabled = false;
        await moderation.saveConfig();
        bot.chat(`/cc &c❌ Авто-модерация ВЫКЛЮЧЕНА ${sender}`);
        addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    }
    else if (args[0].toLowerCase() === 'reset') {
        moderation.reset();
        bot.chat(`/msg ${sender} &a✅ Данные авто-модерации сброшены`);
    }
}

async function mute(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /mute [ник] [время] [причина]`);
        bot.chat(`/msg ${sender} &7Время: 10m, 1h, 1d`);
        return;
    }
    
    const target = args[0];
    const timeStr = args[1];
    const reason = args.slice(2).join(' ');
    
    // Проверка прав (нельзя замутить вышестоящего)
    const canMod = await permissions.canModerate(sender, target);
    if (!canMod) {
        bot.chat(`/msg ${sender} &cВы не можете замутить этого игрока!`);
        return;
    }
    
    // Проверка лимитов персонала
    const limitCheck = await db.checkStaffLimit(sender, 'mute');
    if (!limitCheck.allowed) {
        bot.chat(`/msg ${sender} &cВы исчерпали лимит мутов на сегодня (${limitCheck.current}/${limitCheck.max})!`);
        return;
    }
    
    // Парсим время
    const durationMs = utils.parseTimeString(timeStr);
    if (!durationMs) {
        bot.chat(`/msg ${sender} &cНеверный формат времени! Используйте: 10m, 1h, 1d`);
        return;
    }
    
    const durationMinutes = Math.floor(durationMs / 60000);
    
    // Выдаём мут
    await db.addPunishment(target, 'mute', reason, sender, durationMinutes);
    await db.incrementStaffCounter(sender, 'mute');
    
    // Отправляем команду на сервер
    bot.chat(`/c mute ${target} ${reason}`);
    
    bot.chat(`/msg ${sender} &a✅ Игрок ${target} замучен на ${timeStr} Причина: ${reason}`);
    bot.chat(`/cc &c🔇 &e${target} &cполучил мут на ${timeStr} от ${sender} Причина: ${reason}`);
    
    if (addLog) addLog(`🔇 ${sender} замутил ${target} на ${timeStr} (${reason})`, 'warn');
}

// ============================================
// /kick [ник] [причина] - Кик из клана
// ============================================
async function kick(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /kick [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    // Проверка прав
    const canMod = await permissions.canModerate(sender, target);
    if (!canMod) {
        bot.chat(`/msg ${sender} &cВы не можете кикнуть этого игрока!`);
        return;
    }
    
    // Проверка лимитов
    const limitCheck = await db.checkStaffLimit(sender, 'kick');
    if (!limitCheck.allowed) {
        bot.chat(`/msg ${sender} &cВы исчерпали лимит киков на сегодня (${limitCheck.current}/${limitCheck.max})!`);
        return;
    }
    
    // Проверяем, состоит ли в клане
    const member = await db.getClanMember(target);
    if (!member) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не состоит в клане!`);
        return;
    }
    
    // Выполняем кик
    await db.addPunishment(target, 'kick', reason, sender, null);
    await db.incrementStaffCounter(sender, 'kick');
    await db.removeClanMember(target);
    
    bot.chat(`/c kick ${target}`);
    bot.chat(`/msg ${target} &cВы были кикнуты из клана ${sender} Причина: ${reason}`);
    bot.chat(`/cc &c👢 &e${target} &cбыл кикнут из клана ${sender} Причина: ${reason}`);
    
    if (addLog) addLog(`👢 ${sender} кикнул ${target} (${reason})`, 'warn');
}

// ============================================
// /blacklist add/del [ник] [время] [причина] - Чёрный список клана
// ============================================
async function blacklist(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /blacklist add [ник] [время] [причина]`);
        bot.chat(`/msg ${sender} &cИспользование: /blacklist del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    
    if (action === 'add') {
        if (args.length < 4) {
            bot.chat(`/msg ${sender} &cИспользование: /blacklist add [ник] [время] [причина]`);
            return;
        }
        
        const timeStr = args[2];
        const reason = args.slice(3).join(' ');
        
        // Проверка прав
        const canMod = await permissions.canModerate(sender, target);
        if (!canMod) {
            bot.chat(`/msg ${sender} &cВы не можете добавить этого игрока в ЧС!`);
            return;
        }
        
        // Проверка лимитов
        const limitCheck = await db.checkStaffLimit(sender, 'blacklist');
        if (!limitCheck.allowed) {
            bot.chat(`/msg ${sender} &cВы исчерпали лимит ЧС на сегодня (${limitCheck.current}/${limitCheck.max})!`);
            return;
        }
        
        // Парсим время
        const durationMs = utils.parseTimeString(timeStr);
        const durationMinutes = durationMs ? Math.floor(durationMs / 60000) : null;
        
        await db.addPunishment(target, 'blacklist', reason, sender, durationMinutes);
        await db.incrementStaffCounter(sender, 'blacklist');
        
        // Кикаем из клана если состоит
        const member = await db.getClanMember(target);
        if (member) {
            bot.chat(`/c kick ${target}`);
            await db.removeClanMember(target);
        }
        
        bot.chat(`/msg ${sender} &a✅ Игрок ${target} добавлен в ЧС на ${timeStr}`);
        bot.chat(`/cc &c⛔ &e${target} &cдобавлен в чёрный список клана ${sender} Причина: ${reason}`);
        
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС (${reason})`, 'warn');
        
    } else if (action === 'del') {
        await db.removePunishment(target, 'blacklist', sender, 'Снятие по запросу');
        
        bot.chat(`/msg ${sender} &a✅ Игрок ${target} удалён из ЧС`);
        bot.chat(`/cc &a✅ &e${target} &aудалён из чёрного списка ${sender}`);
        
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС`, 'info');
    } else {
        bot.chat(`/msg ${sender} &cНеизвестное действие. Используйте add или del`);
    }
}

// ============================================
// /awarn add/del [ник] [причина] - Выговор персоналу
// ============================================
async function awarn(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /awarn add [ник] [причина]`);
        bot.chat(`/msg ${sender} &cИспользование: /awarn del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ');
    
    // Проверка прав (выговор может дать только Ст.Модератор+)
    const actorRank = await db.getStaffRank(sender);
    if (actorRank.rank_level < 3) {
        bot.chat(`/msg ${sender} &cВыдавать выговоры могут только Ст.Модераторы и выше!`);
        return;
    }
    
    // Проверка, что цель в персонале
    const targetStaff = await db.getStaffRank(target);
    if (targetStaff.rank_level === 0) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не состоит в персонале!`);
        return;
    }
    
    // Нельзя выдать выговор вышестоящему
    if (targetStaff.rank_level >= actorRank.rank_level) {
        bot.chat(`/msg ${sender} &cНельзя выдать выговор вышестоящему сотруднику!`);
        return;
    }
    
    if (action === 'add') {
        if (!reason) {
            bot.chat(`/msg ${sender} &cУкажите причину выговора!`);
            return;
        }
        
        // Получаем текущее количество выговоров
        const staff = await db.getStaffStats(target);
        const newWarnCount = (staff?.awarns || 0) + 1;
        
        // Обновляем
        await db.updateStaffWarnings(target, newWarnCount);
        await db.addPunishment(target, 'staff_warn', reason, sender, null);
        
        bot.chat(`/msg ${sender} &a✅ Выговор выдан ${target} (${newWarnCount}/3)`);
        bot.chat(`/msg ${target} &c⚠️ Вы получили выговор от ${sender} Причина: ${reason}`);
        bot.chat(`/cc &c⚠️ &e${target} &cполучил выговор (${newWarnCount}/3) от ${sender}`);
        
        // Если 3 выговора - снимаем с должности
        if (newWarnCount >= 3) {
            await db.updateStaffRank(target, 0, 'Снят');
            bot.chat(`/cc &c🔻 &e${target} &cснят с должности за 3 выговора!`);
            if (addLog) addLog(`🔻 ${target} снят с должности за 3 выговора`, 'error');
        }
        
        if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const staff = await db.getStaffStats(target);
        const currentWarns = staff?.awarns || 0;
        
        if (currentWarns === 0) {
            bot.chat(`/msg ${sender} &cУ ${target} нет выговоров!`);
            return;
        }
        
        await db.updateStaffWarnings(target, currentWarns - 1);
        bot.chat(`/msg ${sender} &a✅ Выговор снят с ${target}`);
        bot.chat(`/cc &a✅ &e${target} &a- выговор снят ${sender}`);
        
        if (addLog) addLog(`✅ ${sender} снял выговор с ${target}`, 'info');
    }
}

// ============================================
// /spam [on/off] - Включение/выключение авто-модерации
// ============================================
async function spam(bot, sender, args, db, addLog) {
    // Доступно с Гл.Модератора (ранг 4+)
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 4) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для управления авто-модерацией!`);
        return;
    }
    
    let newState;
    if (args.length === 0) {
        const current = await db.getSetting('auto_mod_enabled');
        bot.chat(`/msg ${sender} &7Авто-модерация сейчас: &e${current === 'true' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}`);
        return;
    }
    
    if (args[0].toLowerCase() === 'on') {
        newState = 'true';
        await db.setSetting('auto_mod_enabled', newState, sender);
        bot.chat(`/cc &a✅ Авто-модерация ВКЛЮЧЕНА ${sender}`);
        if (addLog) addLog(`✅ ${sender} включил авто-модерацию`, 'info');
    } else if (args[0].toLowerCase() === 'off') {
        newState = 'false';
        await db.setSetting('auto_mod_enabled', newState, sender);
        bot.chat(`/cc &c❌ Авто-модерация ВЫКЛЮЧЕНА ${sender}`);
        if (addLog) addLog(`❌ ${sender} выключил авто-модерацию`, 'warn');
    } else {
        bot.chat(`/msg ${sender} &cИспользование: /spam [on/off]`);
    }
}

// ============================================
// /r clan/chat [on/off] - Реклама в клановом чате
// ============================================
async function r(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /r [clan/chat] [on/off]`);
        return;
    }
    
    const target = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    
    let settingKey;
    if (target === 'clan') {
        settingKey = 'clan_ad_enabled';
    } else if (target === 'chat') {
        settingKey = 'chat_ad_enabled';
    } else {
        bot.chat(`/msg ${sender} &cДоступные цели: clan, chat`);
        return;
    }
    
    let newState;
    if (action === 'on') {
        newState = 'true';
    } else if (action === 'off') {
        newState = 'false';
    } else {
        bot.chat(`/msg ${sender} &cИспользование: on/off`);
        return;
    }
    
    await db.setSetting(settingKey, newState, sender);
    bot.chat(`/cc &a✅ Реклама ${target === 'clan' ? 'клана' : 'в чате'} ${newState === 'true' ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'} ${sender}`);
    if (addLog) addLog(`📢 ${sender} ${newState === 'true' ? 'включил' : 'выключил'} рекламу ${target}`, 'info');
}

// ============================================
// /logs [ник] [тип] [страница] - Просмотр логов игрока
// ============================================
async function logs(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /logs [ник] [тип] [страница]`);
        bot.chat(`/msg ${sender} &7Типы: chat, money, punishments`);
        return;
    }
    
    const target = args[0];
    const type = args[1] || 'chat';
    const page = parseInt(args[2]) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    let logs = [];
    let total = 0;
    
    switch(type) {
        case 'chat':
            logs = await db.getChatLogsForPlayer(target, limit, offset);
            total = await db.getChatLogsCount(target);
            break;
        case 'money':
            logs = await db.getMoneyLogsForPlayer(target, limit, offset);
            total = await db.getMoneyLogsCount(target);
            break;
        case 'punishments':
            logs = await db.getPunishmentsForPlayer(target, limit, offset);
            total = await db.getPunishmentsCount(target);
            break;
        default:
            bot.chat(`/msg ${sender} &cНеизвестный тип логов. Доступно: chat, money, punishments`);
            return;
    }
    
    if (logs.length === 0) {
        bot.chat(`/msg ${sender} &cЛоги для ${target} не найдены`);
        return;
    }
    
    const totalPages = Math.ceil(total / limit);
    
    bot.chat(`/msg ${sender} &6📋 ЛОГИ ${type.toUpperCase()} ДЛЯ ${target} (стр. ${page}/${totalPages})`);
    
    for (const log of logs) {
        if (type === 'chat') {
            bot.chat(`/msg ${sender} &7[${log.sent_at}] &e${log.player}: &f${log.message.substring(0, 50)}`);
        } else if (type === 'money') {
            const sign = log.amount > 0 ? '+' : '';
            bot.chat(`/msg ${sender} &7[${log.created_at}] &e${sign}${log.amount}₽ &7- ${log.description}`);
        } else if (type === 'punishments') {
            bot.chat(`/msg ${sender} &7[${log.issued_at}] &c${log.type} &7от ${log.issued_by}: ${log.reason}`);
        }
    }
    
    if (page < totalPages) {
        bot.chat(`/msg ${sender} &7Для следующей страницы: /logs ${target} ${type} ${page + 1}`);
    }
}

// ============================================
// /check [ник] - Проверить информацию об игроке
// ============================================
async function check(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /check [ник]`);
        return;
    }
    
    const target = args[0];
    
    const clanMember = await db.getClanMember(target);
    const rpProfile = await db.getRPProfile(target);
    const staffRank = await db.getStaffRank(target);
    const isMuted = await db.isMuted(target);
    const isBlacklisted = await db.isBlacklisted(target);
    
    if (!clanMember && !rpProfile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не найден в базе данных`);
        return;
    }
    
    bot.chat(`/msg ${sender} &6╔══════════════════════════════════════╗`);
    bot.chat(`/msg ${sender} &6║ &l📋 ИНФОРМАЦИЯ ОБ ИГРОКЕ &6║`);
    bot.chat(`/msg ${sender} &6╠══════════════════════════════════════╣`);
    bot.chat(`/msg ${sender} &6║ &7Ник: &e${target}`);
    
    if (clanMember) {
        bot.chat(`/msg ${sender} &6║ &7Ранг в клане: &e${clanMember.rank_name}`);
        bot.chat(`/msg ${sender} &6║ &7Статистика: &e${clanMember.kills}🗡️ / ${clanMember.deaths}💀`);
    }
    
    if (rpProfile) {
        bot.chat(`/msg ${sender} &6║ &7Структура: &e${rpProfile.structure}`);
        bot.chat(`/msg ${sender} &6║ &7Должность: &e${rpProfile.job_rank}`);
        bot.chat(`/msg ${sender} &6║ &7Баланс: &e${utils.formatMoney(rpProfile.money)}`);
    }
    
    if (staffRank.rank_level > 0) {
        bot.chat(`/msg ${sender} &6║ &7Персонал: &e${permissions.STAFF_LEVELS[staffRank.rank_level]}`);
    }
    
    if (isMuted) {
        bot.chat(`/msg ${sender} &6║ &7Статус: &c🔇 В МУТЕ`);
    }
    
    if (isBlacklisted) {
        bot.chat(`/msg ${sender} &6║ &7Статус: &c⛔ В ЧЁРНОМ СПИСКЕ`);
    }
    
    bot.chat(`/msg ${sender} &6╚══════════════════════════════════════╝`);
}

// ============================================
// ЭКСПОРТ
// ============================================
module.exports = {
    mute,
    kick,
    blacklist,
    awarn,
    spam,
    r,
    logs,
    check,
    automod
};