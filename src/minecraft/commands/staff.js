// src/minecraft/commands/staff.js — Команды модерации персонала Resistance City v5.0.0
// /blacklist, /bl, /kick, /mute, /awarn, /spam, /sp, /r, /logs
// Полный набор с проверкой прав, лимитами, иерархией

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function msg(bot, user, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/msg ' + user + ' ' + text); } catch(e) {}
}
function cc(bot, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/cc ' + text); } catch(e) {}
}

function checkDailyLimit(username, limitType) {
    if (permissions.isAdmin(username, db) || permissions.isCurator(username, db)) return { allowed: true };
    const staff = db.staff.get(username);
    if (!staff || staff.is_active !== 1) return { allowed: false, reason: 'not_staff' };
    const rankConfig = config.staffRanks[staff.rank];
    if (!rankConfig || !rankConfig.dailyLimits) return { allowed: false, reason: 'unknown_rank' };

    const limitField = limitType === 'kick' ? 'kicks_today' : limitType === 'mute' ? 'mutes_today' : 'blacklists_today';
    const limitValue = rankConfig.dailyLimits[limitType === 'kick' ? 'kicks' : limitType === 'mute' ? 'mutes' : 'blacklists'];
    const currentValue = staff[limitField] || 0;

    if (currentValue >= limitValue && limitValue !== Infinity) {
        return { allowed: false, reason: 'daily_limit_exceeded', current: currentValue, max: limitValue };
    }
    return { allowed: true };
}

function incrementCounter(username, type) {
    if (type === 'kick') db.staff.incrementKicks(username);
    else if (type === 'mute') db.staff.incrementMutes(username);
    else if (type === 'blacklist') db.staff.incrementBlacklists(username);
}

// ==================== /BLACKLIST и /BL ====================
function blacklistManage(bot, username, args, source) {
    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ /blacklist <add|del|check|list|info> [аргументы]');

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // ==================== ADD ====================
    if (sub === 'add') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /blacklist add <ник> [время_мин] [причина]');

        const limitCheck = checkDailyLimit(username, 'blacklist');
        if (!limitCheck.allowed) {
            if (limitCheck.reason === 'daily_limit_exceeded') return msg(bot, username, '&#CA4E4E❌ Лимит ЧС исчерпан (' + limitCheck.current + '/' + limitCheck.max + ')');
            return msg(bot, username, '&#CA4E4E❌ Ошибка проверки прав');
        }

        const target = subArgs[0];
        const duration = parseInt(subArgs[1]) || config.autoMod.blacklistDurationHours * 60;
        const reason = subArgs.slice(2).join(' ') || 'Не указана';

        if (target.toLowerCase() === username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Нельзя добавить себя');
        if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя наказать этого игрока');

        const activePunishments = db.punishments.getActive(target);
        const alreadyBL = activePunishments.some(p => p.type === 'blacklist' && p.is_active === 1);
        if (alreadyBL) return msg(bot, username, '&#CA4E4E❌ ' + target + ' уже в ЧС');

        const result = db.punishments.add(target, 'blacklist', duration, reason, username);
        if (result.success) {
            incrementCounter(username, 'blacklist');
            logger.warn(username + ' добавил ' + target + ' в ЧС на ' + duration + ' мин');

            const member = db.members.get(target);
            if (member && member.is_in_clan === 1) bot.chat('/c kick ' + target);

            msg(bot, username, '&#76C519✅ ' + target + ' в ЧС на ' + utils.formatDuration(duration));
            cc(bot, '&#CA4E4E🚫 ' + target + ' в ЧС на ' + utils.formatDuration(duration) + ' | ' + reason);
            try { bot.chat('/msg ' + target + ' &#CA4E4EВы в ЧС на ' + utils.formatDuration(duration) + ': ' + reason); } catch(e) {}
        } else {
            msg(bot, username, '&#CA4E4E❌ Ошибка');
        }
        return;
    }

    // ==================== DEL ====================
    if (sub === 'del') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /blacklist del <ник>');
        const target = subArgs[0];

        const activePunishments = db.punishments.getActive(target);
        const bl = activePunishments.find(p => p.type === 'blacklist' && p.is_active === 1);
        if (!bl) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не в ЧС');

        if (bl.issued_by_lower !== username.toLowerCase() && !permissions.isAdmin(username, db) && !permissions.isCurator(username, db)) {
            if (!permissions.canManageStaff(username, bl.issued_by, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя снять ЧС от вышестоящего');
        }

        db.punishments.remove(bl.id, username);
        logger.info(username + ' снял ЧС с ' + target);
        msg(bot, username, '&#76C519✅ ЧС снят с ' + target);
        cc(bot, '&#76C519✅ ЧС снят с ' + target);
        try { bot.chat('/msg ' + target + ' &#76C519ЧС снят. Добро пожаловать!'); } catch(e) {}
        return;
    }

    // ==================== CHECK ====================
    if (sub === 'check') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /blacklist check <ник>');
        const target = subArgs[0];
        const activePunishments = db.punishments.getActive(target);
        const bl = activePunishments.find(p => p.type === 'blacklist' && p.is_active === 1);

        if (bl) {
            msg(bot, username,
                '&#CA4E4E🚫 ' + target + ' в ЧС &#D4D4D4| Выдал: &#76C519' + bl.issued_by +
                ' &#D4D4D4| Истекает: &#FFB800' + utils.formatDate(bl.expires_at) +
                ' &#D4D4D4| Осталось: &#FFB800' + utils.timeUntil(bl.expires_at)
            );
            msg(bot, username, '&#D4D4D4Причина: ' + bl.reason);
        } else {
            msg(bot, username, '&#76C519✅ ' + target + ' не в ЧС');
        }
        return;
    }

    // ==================== LIST ====================
    if (sub === 'list') {
        const allBL = db.all("SELECT * FROM punishment_logs WHERE type = 'blacklist' AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY issued_at DESC");
        if (allBL.length === 0) return msg(bot, username, '&#D4D4D4ЧС пуст');

        const parts = [];
        for (let i = 0; i < allBL.length; i += 3) {
            const chunk = allBL.slice(i, i + 3);
            parts.push(chunk.map(b => '&#CA4E4E' + b.username + ' &#D4D4D4(' + b.issued_by + ') ' + utils.timeUntil(b.expires_at)).join(' &#D4D4D4| '));
        }
        msg(bot, username, '&#80C4C5🚫 ЧС (' + allBL.length + '):');
        parts.forEach(p => msg(bot, username, p));
        return;
    }

    // ==================== INFO ====================
    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /blacklist info <ник>');
        const target = subArgs[0];
        const allBL = db.all("SELECT * FROM punishment_logs WHERE username_lower = ? AND type = 'blacklist' ORDER BY issued_at DESC LIMIT 20", [target.toLowerCase()]);

        if (allBL.length === 0) return msg(bot, username, '&#D4D4D4' + target + ' не был в ЧС');

        msg(bot, username, '&#80C4C5📋 История ЧС ' + target + ' (' + allBL.length + '):');
        const lastFive = allBL.slice(0, 5);
        lastFive.forEach(b => {
            const status = b.is_active ? '&#CA4E4EАКТИВЕН' : '&#76C519Снят';
            msg(bot, username, status + ' &#D4D4D4| ' + utils.formatDate(b.issued_at) + ' &#D4D4D4| ' + b.issued_by + ' &#D4D4D4| ' + (b.reason || '—'));
        });
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /blacklist <add|del|check|list|info>');
}

// ==================== /KICK ====================
function kickManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /kick <ник> [причина]');

    const limitCheck = checkDailyLimit(username, 'kick');
    if (!limitCheck.allowed) {
        if (limitCheck.reason === 'daily_limit_exceeded') return msg(bot, username, '&#CA4E4E❌ Лимит киков (' + limitCheck.current + '/' + limitCheck.max + ')');
        return msg(bot, username, '&#CA4E4E❌ Ошибка прав');
    }

    const target = args[0];
    const reason = args.slice(1).join(' ') || 'Не указана';

    if (target.toLowerCase() === username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Нельзя кикнуть себя');
    if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя кикнуть этого игрока');

    const member = db.members.get(target);
    if (!member || member.is_in_clan !== 1) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не в клане');

    bot.chat('/c kick ' + target);
    db.punishments.add(target, 'kick', null, reason, username);
    incrementCounter(username, 'kick');

    logger.warn(username + ' кикнул ' + target + ': ' + reason);
    msg(bot, username, '&#76C519✅ ' + target + ' исключён из клана');
    cc(bot, '&#CA4E4E👢 ' + target + ' исключён | ' + reason + ' | ' + username);
    try { bot.chat('/msg ' + target + ' &#CA4E4EВы исключены из клана: ' + reason); } catch(e) {}

    const rpMember = db.rpMembers.get(target);
    if (rpMember && rpMember.is_active === 1 && rpMember.organization) {
        db.rpMembers.setOrganization(target, null, null);
    }
}

// ==================== /MUTE ====================
function muteManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /mute <ник> [время_мин] [причина] [chat|pm|all]');

    const limitCheck = checkDailyLimit(username, 'mute');
    if (!limitCheck.allowed) {
        if (limitCheck.reason === 'daily_limit_exceeded') return msg(bot, username, '&#CA4E4E❌ Лимит мутов (' + limitCheck.current + '/' + limitCheck.max + ')');
        return msg(bot, username, '&#CA4E4E❌ Ошибка прав');
    }

    const target = args[0];
    let duration = config.autoMod.muteDurationMinutes;
    let reason = 'Не указана';
    let muteType = 'chat';
    const remainingArgs = args.slice(1);

    if (remainingArgs.length > 0 && !isNaN(remainingArgs[0])) {
        duration = parseInt(remainingArgs[0]);
        remainingArgs.splice(0, 1);
    }
    if (remainingArgs.length > 0 && ['chat', 'pm', 'all'].includes(remainingArgs[remainingArgs.length - 1].toLowerCase())) {
        muteType = remainingArgs.pop().toLowerCase();
    }
    if (remainingArgs.length > 0) reason = remainingArgs.join(' ');

    if (target.toLowerCase() === username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Нельзя замутить себя');
    if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя замутить этого игрока');

    const activePunishments = db.punishments.getActive(target);
    const alreadyMuted = activePunishments.some(p => (p.type === 'mute' || p.type === 'pm_mute') && p.is_active === 1);
    if (alreadyMuted) return msg(bot, username, '&#CA4E4E❌ ' + target + ' уже заглушен');

    const muteDbType = muteType === 'pm' ? 'pm_mute' : 'mute';
    db.punishments.add(target, muteDbType, duration, reason, username);
    incrementCounter(username, 'mute');

    if (muteType === 'chat' || muteType === 'all') bot.chat('/c mute ' + target + ' ' + reason);

    logger.warn(username + ' замутил ' + target + ' (' + muteType + ') на ' + duration + ' мин');

    setTimeout(() => {
        try {
            if (muteType === 'chat' || muteType === 'all') bot.chat('/c unmute ' + target);
            const activeNow = db.punishments.getActive(target);
            const muteRecord = activeNow.find(p => (p.type === 'mute' || p.type === 'pm_mute') && p.is_active === 1);
            if (muteRecord) db.punishments.remove(muteRecord.id, 'AutoMod');
            logger.info('Авто-размут ' + target);
            try { bot.chat('/msg ' + target + ' &#76C519Мут истёк. Добро пожаловать!'); } catch(e) {}
        } catch(e) {}
    }, duration * 60000);

    const typeName = muteType === 'pm' ? 'в ЛС' : muteType === 'all' ? 'полный' : 'в чате';
    msg(bot, username, '&#76C519✅ ' + target + ' заглушен (' + typeName + ') на ' + utils.formatDuration(duration));
    cc(bot, '&#FFB800🔇 ' + target + ' заглушен (' + typeName + ') на ' + utils.formatDuration(duration) + ' | ' + reason);
    try { bot.chat('/msg ' + target + ' &#FFB800Вы заглушены (' + typeName + ') на ' + utils.formatDuration(duration) + ': ' + reason); } catch(e) {}
}

// ==================== /UNMUTE ====================
function unmuteManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /unmute <ник> [chat|pm|all]');
    const target = args[0];
    const muteType = args[1]?.toLowerCase() || 'all';

    const activePunishments = db.punishments.getActive(target);
    let muteRecord;
    if (muteType === 'all') muteRecord = activePunishments.find(p => (p.type === 'mute' || p.type === 'pm_mute') && p.is_active === 1);
    else if (muteType === 'pm') muteRecord = activePunishments.find(p => p.type === 'pm_mute' && p.is_active === 1);
    else muteRecord = activePunishments.find(p => p.type === 'mute' && p.is_active === 1);

    if (!muteRecord) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не заглушен');

    if (muteRecord.issued_by_lower !== username.toLowerCase() && !permissions.isAdmin(username, db) && !permissions.isCurator(username, db)) {
        if (!permissions.canManageStaff(username, muteRecord.issued_by, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя снять мут от вышестоящего');
    }

    db.punishments.remove(muteRecord.id, username);
    if (muteRecord.type === 'mute') bot.chat('/c unmute ' + target);

    logger.info(username + ' снял мут с ' + target);
    msg(bot, username, '&#76C519✅ Мут снят с ' + target);
    cc(bot, '&#76C519🔊 Мут снят с ' + target);
    try { bot.chat('/msg ' + target + ' &#76C519Мут снят!'); } catch(e) {}
}

// ==================== /AWARN ====================
function warnManage(bot, username, args, source) {
    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ /awarn <add|del|list|check> <ник> [причина]');
    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    if (sub === 'add') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /awarn add <ник> [причина]');
        const target = subArgs[0];
        const reason = subArgs.slice(1).join(' ') || 'Не указана';

        if (target.toLowerCase() === username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Нельзя вынести выговор себе');
        if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя вынести выговор вышестоящему');

        const targetStaff = db.staff.get(target);
        if (!targetStaff || targetStaff.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');

        const warnCount = db.staff.addWarn(target, reason, username);
        logger.warn(username + ' выдал выговор ' + target + ' (' + warnCount + '/3)');

        if (warnCount >= 3) {
            const oldRank = targetStaff.rank;
            db.staff.remove(target);
            bot.chat('/c rank ' + target + ' ' + config.clan.defaultRank);
            logger.warn(target + ' снят с должности (3 выговора)');
            msg(bot, username, '&#CA4E4E🚫 ' + target + ': выговор ' + warnCount + '/3! СНЯТ С ДОЛЖНОСТИ!');
            cc(bot, '&#CA4E4E⚠ ' + target + ' снят с должности (3 выговора)');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВы сняты с должности (3 выговора)'); } catch(e) {}
        } else {
            msg(bot, username, '&#FFB800⚠ ' + target + ': выговор ' + warnCount + '/3');
            try { bot.chat('/msg ' + target + ' &#FFB800⚠ Выговор ' + warnCount + '/3: ' + reason); } catch(e) {}
        }
        return;
    }

    if (sub === 'del') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /awarn del <ник>');
        const target = subArgs[0];
        const reason = subArgs.slice(1).join(' ') || 'Не указана';

        if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя снять выговор с вышестоящего');
        const targetStaff = db.staff.get(target);
        if (!targetStaff || targetStaff.warns <= 0) return msg(bot, username, '&#CA4E4E❌ У ' + target + ' нет выговоров');

        db.staff.removeWarn(target, reason, username);
        logger.info(username + ' снял выговор с ' + target);
        msg(bot, username, '&#76C519✅ Выговор снят с ' + target);
        try { bot.chat('/msg ' + target + ' &#76C519С вас снят выговор'); } catch(e) {}
        return;
    }

    if (sub === 'list') {
        const allStaff = db.staff.getAll();
        const withWarns = allStaff.filter(s => s.warns > 0);
        if (withWarns.length === 0) return msg(bot, username, '&#D4D4D4Нет персонала с выговорами');

        msg(bot, username, '&#80C4C5⚠ Персонал с выговорами (' + withWarns.length + '):');
        withWarns.forEach(s => {
            const rc = config.staffRanks[s.rank];
            msg(bot, username, '&#CA4E4E' + s.username + ' &#D4D4D4(' + (rc?.name || s.rank) + '): ' + s.warns + '/3');
        });
        return;
    }

    if (sub === 'check') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /awarn check <ник>');
        const target = subArgs[0];
        const targetStaff = db.staff.get(target);
        if (!targetStaff || targetStaff.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');

        const warns = db.staff.getWarns(target);
        msg(bot, username, '&#80C4C5⚠ ' + target + ': ' + targetStaff.warns + '/3 выговоров');
        if (warns.length > 0) {
            warns.slice(0, 3).forEach(w => {
                msg(bot, username, '&#D4D4D4• ' + w.reason + ' (от ' + w.issued_by + ', ' + utils.formatDate(w.issued_at) + ')');
            });
        }
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /awarn <add|del|list|check>');
}

// ==================== /SPAM и /SP ====================
function spamSettings(bot, username, args, source) {
    if (args.length < 1) {
        const amEnabled = db.settings.getBoolean('auto_mod_enabled');
        msg(bot, username,
            '&#80C4C5🛡️ Автомодерация: ' + (amEnabled ? '&#76C519Вкл' : '&#CA4E4EВыкл') +
            ' &#D4D4D4| Лимит: &#FFB800' + config.autoMod.maxMessagesPerMinute + '/мин' +
            ' &#D4D4D4| Предупр: &#FFB800' + config.autoMod.warnCountBeforeMute +
            ' &#D4D4D4| Мут: &#FFB800' + config.autoMod.muteDurationMinutes + 'мин'
        );
        msg(bot, username, '&#D4D4D4/spam on|off &#D4D4D4| /spam set <параметр> <значение>');
        return;
    }

    const sub = args[0].toLowerCase();

    if (sub === 'on') {
        db.settings.set('auto_mod_enabled', 'true');
        logger.info(username + ' включил автомодерацию');
        msg(bot, username, '&#76C519✅ Автомодерация включена');
        cc(bot, '&#76C519🛡️ Автомодерация включена');
        return;
    }
    if (sub === 'off') {
        db.settings.set('auto_mod_enabled', 'false');
        logger.warn(username + ' выключил автомодерацию');
        msg(bot, username, '&#76C519✅ Автомодерация выключена');
        cc(bot, '&#CA4E4E⚠ Автомодерация выключена!');
        return;
    }
    if (sub === 'set') {
        if (args.length < 3) return msg(bot, username, '&#CA4E4E❌ /spam set <max_messages|warn_count|mute_duration|blacklist_limit> <значение>');
        const param = args[1].toLowerCase();
        const value = parseInt(args[2]);
        if (isNaN(value) || value < 1) return msg(bot, username, '&#CA4E4E❌ Положительное число');

        if (param === 'max_messages' || param === 'messages') {
            config.autoMod.maxMessagesPerMinute = value;
            msg(bot, username, '&#76C519✅ Лимит: ' + value + '/мин');
        } else if (param === 'warn_count' || param === 'warns') {
            config.autoMod.warnCountBeforeMute = value;
            msg(bot, username, '&#76C519✅ Предупреждений: ' + value);
        } else if (param === 'mute_duration' || param === 'mute') {
            config.autoMod.muteDurationMinutes = value;
            msg(bot, username, '&#76C519✅ Длительность мута: ' + value + ' мин');
        } else if (param === 'blacklist_limit' || param === 'blacklist') {
            config.autoMod.blacklistJoinLeaveLimit = value;
            msg(bot, username, '&#76C519✅ Лимит входов/выходов: ' + value);
        } else {
            msg(bot, username, '&#CA4E4E❌ Параметр: max_messages, warn_count, mute_duration, blacklist_limit');
        }
        return;
    }
    msg(bot, username, '&#CA4E4E❌ /spam <on|off|set>');
}

// ==================== /R (РЕКЛАМА) ====================
function adSettings(bot, username, args, source) {
    if (args.length < 1) {
        const clanAd = db.settings.getBoolean('clan_ad_enabled');
        const chatAd = db.settings.getBoolean('chat_ad_enabled');
        msg(bot, username,
            '&#80C4C5📢 Реклама &#D4D4D4| Клана: ' + (clanAd ? '&#76C519Вкл' : '&#CA4E4EВыкл') +
            ' &#D4D4D4| В чате: ' + (chatAd ? '&#76C519Вкл' : '&#CA4E4EВыкл')
        );
        msg(bot, username, '&#D4D4D4/r <clan|chat> <on|off|toggle>');
        return;
    }

    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ /r <clan|chat> <on|off|toggle>');
    const type = args[0].toLowerCase();
    const action = args[1].toLowerCase();

    if (!['clan', 'chat'].includes(type)) return msg(bot, username, '&#CA4E4E❌ Тип: clan или chat');

    const settingKey = type === 'clan' ? 'clan_ad_enabled' : 'chat_ad_enabled';
    let newValue;
    if (action === 'toggle') {
        newValue = !db.settings.getBoolean(settingKey);
    } else {
        newValue = action === 'on';
    }

    db.settings.set(settingKey, newValue ? 'true' : 'false');
    const typeName = type === 'clan' ? 'клана' : 'в чате';
    logger.info(username + ' ' + (newValue ? 'включил' : 'выключил') + ' рекламу ' + typeName);
    msg(bot, username, '&#76C519✅ Реклама ' + typeName + ': ' + (newValue ? '&#76C519вкл' : '&#CA4E4Eвыкл'));
}

// ==================== /LOGS ====================
function viewLogs(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /logs <ник> [punishments|balance|chat|pm|jail|fines|all] [стр]');
    const target = args[0];
    const logType = args[1]?.toLowerCase() || 'all';
    const page = parseInt(args[2]) || 1;
    const perPage = 3;

    const member = db.members.get(target);
    const rpMember = db.rpMembers.get(target);
    if (!member && !rpMember) return msg(bot, username, '&#CA4E4E❌ Игрок не найден');

    if (logType === 'punishments' || logType === 'punish') {
        const list = db.punishments.getByUsername(target, 50);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4У ' + target + ' нет наказаний');

        const totalPages = Math.ceil(list.length / perPage);
        const cp = Math.min(page, totalPages);
        const pageItems = list.slice((cp - 1) * perPage, cp * perPage);

        msg(bot, username, '&#80C4C5📋 Наказания ' + target + ' (' + list.length + '):');
        pageItems.forEach(p => {
            const typeNames = { mute: 'Мут', pm_mute: 'Мут ЛС', kick: 'Кик', blacklist: 'ЧС' };
            const status = p.is_active ? '&#CA4E4EАктивно' : '&#76C519Снято';
            msg(bot, username, status + ' &#D4D4D4| ' + (typeNames[p.type] || p.type) + ' &#D4D4D4| ' + p.issued_by + ' &#D4D4D4| ' + utils.formatDate(p.issued_at) + ' &#D4D4D4| ' + (p.reason || '—'));
        });
        if (totalPages > 1) msg(bot, username, '&#D4D4D4Стр. ' + cp + '/' + totalPages);
        return;
    }

    if (logType === 'balance' || logType === 'bal') {
        const list = db.all('SELECT * FROM balance_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT 50', [target.toLowerCase()]);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4Нет финансовых логов');

        const totalPages = Math.ceil(list.length / perPage);
        const cp = Math.min(page, totalPages);
        const pageItems = list.slice((cp - 1) * perPage, cp * perPage);

        msg(bot, username, '&#80C4C5💰 Финансы ' + target + ' (' + list.length + '):');
        pageItems.forEach(l => {
            const sign = l.amount >= 0 ? '&a+' : '&c';
            msg(bot, username, sign + utils.formatMoney(l.amount) + ' &#D4D4D4| ' + l.type + ' &#D4D4D4| ' + utils.formatDate(l.created_at));
        });
        if (totalPages > 1) msg(bot, username, '&#D4D4D4Стр. ' + cp + '/' + totalPages);
        return;
    }

    if (logType === 'chat') {
        const list = db.chatLogs.getClanChatLogs(target, 30);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4Нет сообщений');

        msg(bot, username, '&#80C4C5💬 Чат ' + target + ' (' + list.length + '):');
        list.slice(0, 5).forEach(l => {
            msg(bot, username, '&#D4D4D4' + utils.formatDate(l.created_at) + ': ' + l.message.substring(0, 100));
        });
        return;
    }

    if (logType === 'pm') {
        const list = db.chatLogs.getPrivateMessageLogs(target, 30);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4Нет ЛС');

        msg(bot, username, '&#80C4C5✉️ ЛС ' + target + ' (' + list.length + '):');
        list.slice(0, 5).forEach(l => {
            const dir = l.sender_lower === target.toLowerCase() ? '→' : '←';
            msg(bot, username, dir + ' ' + (l.sender_lower === target.toLowerCase() ? l.receiver : l.sender) + ': ' + l.message.substring(0, 80));
        });
        return;
    }

    if (logType === 'jail') {
        const list = db.all('SELECT * FROM jail_records WHERE username_lower = ? ORDER BY jail_start DESC LIMIT 30', [target.toLowerCase()]);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4Не был в тюрьме');

        msg(bot, username, '&#80C4C5🔒 Тюрьма ' + target + ' (' + list.length + '):');
        list.slice(0, 5).forEach(j => {
            msg(bot, username, (j.is_active ? '&#CA4E4E' : '&#76C519') + j.reason + ' &#D4D4D4| ' + utils.formatDuration(j.duration_minutes) + ' &#D4D4D4| ' + j.jailed_by);
        });
        return;
    }

    if (logType === 'fines') {
        const list = db.fines.getAll(target);
        if (list.length === 0) return msg(bot, username, '&#D4D4D4Нет штрафов');

        msg(bot, username, '&#80C4C5📋 Штрафы ' + target + ' (' + list.length + '):');
        list.slice(0, 5).forEach(f => {
            const statusNames = { pending: '⏳', paid: '✅', rejected: '❌', expired: '⌛' };
            msg(bot, username, (statusNames[f.status] || '') + ' ' + utils.formatMoney(f.amount) + ' &#D4D4D4| ' + f.reason + ' &#D4D4D4| ' + f.issued_by);
        });
        return;
    }

    // ALL
    const punishments = db.punishments.getByUsername(target, 5);
    const balanceLogs = db.all('SELECT * FROM balance_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT 3', [target.toLowerCase()]);

    msg(bot, username, '&#80C4C5📊 Сводка ' + target + ':');
    if (punishments.length > 0) {
        const active = punishments.filter(p => p.is_active);
        if (active.length > 0) msg(bot, username, '&#CA4E4EАктивных наказаний: ' + active.length);
    }
    if (balanceLogs.length > 0) {
        const last = balanceLogs[0];
        msg(bot, username, '&#D4D4D4Последняя операция: ' + (last.amount >= 0 ? '&a+' : '&c') + utils.formatMoney(last.amount) + ' (' + last.type + ')');
    }
    if (rpMember?.organization) {
        msg(bot, username, '&#FFB800' + rpMember.organization + ' &#D4D4D4| ' + (rpMember.rank || '—'));
    }
    msg(bot, username, '&#D4D4D4Подробнее: /logs ' + target + ' <тип>');
}

// ==================== ЭКСПОРТ ====================
module.exports = { blacklistManage, kickManage, muteManage, unmuteManage, warnManage, spamSettings, adSettings, viewLogs };