// src/minecraft/commands/admin.js — Административные команды Resistance City v5.0.0
// /admin, /a, /arp, /stopall, /reloadbd
// Полный набор: управление персоналом, экономикой, организациями, бандами, вирусом

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
function checkMinRank(username, requiredRank) {
    const staff = db.staff.get(username);
    if (!staff || staff.is_active !== 1) return false;
    return (permissions.STAFF_HIERARCHY[staff.rank] || 0) >= (permissions.STAFF_HIERARCHY[requiredRank] || 999);
}

// ==================== /ADMIN и /A ====================
function adminManage(bot, username, args, source) {
    if (args.length === 0) {
        return msg(bot, username, '&#CA4E4E❌ /admin <add|del|list|info|resetdaily|setlimit>');
    }

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // ==================== ADD ====================
    if (sub === 'add') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /admin add <ник> <роль>');
        const target = subArgs[0];
        const rankKey = subArgs[1].toLowerCase();
        const validRanks = Object.keys(config.staffRanks);

        if (!validRanks.includes(rankKey)) {
            const rankNames = validRanks.map(r => r + ' (' + config.staffRanks[r].name + ')').join(', ');
            return msg(bot, username, '&#CA4E4E❌ Неверный ранг. Доступные: ' + rankNames);
        }

        const issuerStaff = db.staff.get(username);
        if (!issuerStaff || issuerStaff.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Вы не персонал');
        if (issuerStaff.rank === 'curator' && rankKey === 'administrator') return msg(bot, username, '&#CA4E4E❌ Куратор не может назначить админа');

        const issuerLevel = permissions.STAFF_HIERARCHY[issuerStaff.rank] || 0;
        const targetLevel = permissions.STAFF_HIERARCHY[rankKey] || 0;
        if (issuerLevel <= targetLevel && issuerStaff.rank !== 'administrator') {
            return msg(bot, username, '&#CA4E4E❌ Нельзя назначить ранг выше или равный вашему');
        }

        const existingStaff = db.staff.get(target);
        const result = db.staff.add(target, rankKey);

        if (result.success) {
            const rankConfig = config.staffRanks[rankKey];
            if (rankConfig?.colorRank) bot.chat('/c rank ' + target + ' ' + rankConfig.colorRank);
            logger.warn(username + ' назначил ' + target + ' на ' + rankKey);
            msg(bot, username, '&#76C519✅ ' + target + ' назначен: &#FFB800' + (rankConfig?.name || rankKey));
            cc(bot, '&#76C519📋 ' + target + ' → &#FFB800' + (rankConfig?.name || rankKey));
        } else {
            msg(bot, username, '&#CA4E4E❌ Ошибка назначения');
        }
        return;
    }

    // ==================== DEL ====================
    if (sub === 'del') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /admin del <ник>');
        const target = subArgs[0];
        const targetStaff = db.staff.get(target);

        if (!targetStaff || targetStaff.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');
        if (!permissions.canManageStaff(username, target, db)) return msg(bot, username, '&#CA4E4E❌ Нельзя снять этого сотрудника');
        if (targetStaff.rank === 'administrator' && !permissions.isAdmin(username, db)) return msg(bot, username, '&#CA4E4E❌ Только админ может снять админа');

        const oldRank = targetStaff.rank;
        const result = db.staff.remove(target);

        if (result.success) {
            bot.chat('/c rank ' + target + ' ' + config.clan.defaultRank);
            logger.warn(username + ' снял ' + target + ' с ' + oldRank);
            msg(bot, username, '&#76C519✅ ' + target + ' снят с должности');
            cc(bot, '&#CA4E4E📋 ' + target + ' снят с персонала');
        } else {
            msg(bot, username, '&#CA4E4E❌ Ошибка снятия');
        }
        return;
    }

    // ==================== LIST ====================
    if (sub === 'list') {
        const staffList = db.staff.getAll();
        if (staffList.length === 0) return msg(bot, username, '&#D4D4D4Нет активного персонала');

        const sorted = staffList.sort((a, b) => (permissions.STAFF_HIERARCHY[b.rank] || 0) - (permissions.STAFF_HIERARCHY[a.rank] || 0));

        // Отправляем по 3 человека в сообщении
        const parts = [];
        for (let i = 0; i < sorted.length; i += 3) {
            const chunk = sorted.slice(i, i + 3);
            parts.push(chunk.map(s => {
                const rc = config.staffRanks[s.rank];
                return '&#FFB800' + (rc?.name || s.rank) + ' &#D4D4D4' + s.username + (s.warns > 0 ? ' &#CA4E4E[' + s.warns + ']' : '');
            }).join(' &#D4D4D4| '));
        }

        msg(bot, username, '&#80C4C5👥 Персонал (' + sorted.length + '):');
        parts.forEach(p => msg(bot, username, p));
        return;
    }

    // ==================== INFO ====================
    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /admin info <ник>');
        const target = subArgs[0];
        const staff = db.staff.get(target);
        if (!staff || staff.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');

        const rc = config.staffRanks[staff.rank];
        msg(bot, username,
            '&#80C4C5👤 ' + target + ' &#D4D4D4| &#FFB800' + (rc?.name || staff.rank) +
            ' &#D4D4D4| Уровень: &#76C519' + (permissions.STAFF_HIERARCHY[staff.rank] || 0)
        );
        msg(bot, username,
            '&#D4D4D4Выговоров: ' + (staff.warns > 0 ? '&#CA4E4E' + staff.warns + '/3' : '&#76C5190') +
            ' &#D4D4D4| Киков: ' + (staff.kicks_today || 0) +
            ' &#D4D4D4| Мутов: ' + (staff.mutes_today || 0) +
            ' &#D4D4D4| ЧС: ' + (staff.blacklists_today || 0)
        );
        msg(bot, username, '&#D4D4D4Назначен: &#76C519' + utils.formatDate(staff.promoted_at));
        return;
    }

    // ==================== RESETDAILY ====================
    if (sub === 'resetdaily') {
        if (subArgs.length < 1) {
            db.staff.resetDailyLimits();
            logger.info(username + ' сбросил дневные лимиты');
            return msg(bot, username, '&#76C519✅ Дневные лимиты сброшены для всех');
        }
        const target = subArgs[0];
        const targetStaff = db.staff.get(target);
        if (!targetStaff) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');

        db.run('UPDATE staff SET kicks_today = 0, mutes_today = 0, blacklists_today = 0 WHERE username_lower = ?', [target.toLowerCase()]);
        logger.info(username + ' сбросил лимиты для ' + target);
        msg(bot, username, '&#76C519✅ Лимиты сброшены для ' + target);
        return;
    }

    // ==================== SETLIMIT ====================
    if (sub === 'setlimit') {
        if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /admin setlimit <ник> <kicks|mutes|blacklists> <значение>');
        if (!permissions.isAdmin(username, db)) return msg(bot, username, '&#CA4E4E❌ Только администратор');

        const target = subArgs[0];
        const limitType = subArgs[1].toLowerCase();
        const limitValue = parseInt(subArgs[2]);

        if (!['kicks', 'mutes', 'blacklists'].includes(limitType)) return msg(bot, username, '&#CA4E4E❌ Тип: kicks, mutes, blacklists');
        if (isNaN(limitValue) || limitValue < 0) return msg(bot, username, '&#CA4E4E❌ Неверное значение');

        const targetStaff = db.staff.get(target);
        if (!targetStaff) return msg(bot, username, '&#CA4E4E❌ ' + target + ' не персонал');

        const colMap = { kicks: 'kicks_today', mutes: 'mutes_today', blacklists: 'blacklists_today' };
        db.run('UPDATE staff SET ' + colMap[limitType] + ' = ? WHERE username_lower = ?', [limitValue, target.toLowerCase()]);

        logger.warn(username + ' установил ' + limitType + ' = ' + limitValue + ' для ' + target);
        msg(bot, username, '&#76C519✅ ' + target + ': ' + limitType + ' = ' + limitValue);
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /admin <add|del|list|info|resetdaily|setlimit>');
}

// ==================== /ARP (ADMIN ROLEPLAY) ====================
function arpManage(bot, username, args, source) {
    if (args.length === 0) {
        return msg(bot, username, '&#CA4E4E❌ /arp <balance|rank|points|blacklist|payday|warn|stats|rp|idim|org|band|virus|economy|freeze|unfreeze|stopall|reloadbd>');
    }

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // ==================== BALANCE ====================
    if (sub === 'balance') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp balance <set|give|reset|del|info> <ник> [сумма]');
        const action = subArgs[0].toLowerCase();
        const target = subArgs[1];

        const tm = db.rpMembers.get(target);
        if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

        if (action === 'info') {
            const balanceLogs = db.all('SELECT * FROM balance_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT 5', [target.toLowerCase()]);
            msg(bot, username, '&#80C4C5💰 ' + target + ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(tm.balance) + ' &#D4D4D4| Банк: &#76C519' + utils.formatMoney(tm.bank_balance));
            if (balanceLogs.length > 0) {
                const lastLog = balanceLogs[0];
                msg(bot, username, '&#D4D4D4Последняя операция: ' + (lastLog.amount >= 0 ? '&a+' : '&c') + utils.formatMoney(lastLog.amount) + ' &#D4D4D4(' + lastLog.type + ')');
            }
            return;
        }

        if (action === 'set') {
            const amount = parseFloat(subArgs[2]) || 0;
            const diff = amount - tm.balance;
            db.rpMembers.updateBalance(target, diff, 'admin_set', 'Установлен админом ' + username, username);
            logger.warn(username + ' установил баланс ' + target + ' = ' + utils.formatMoney(amount));
            msg(bot, username, '&#76C519✅ Баланс ' + target + ': &#FFB800' + utils.formatMoney(amount));
            try { bot.chat('/msg ' + target + ' &#FFB800Ваш баланс изменён админом: ' + utils.formatMoney(amount)); } catch(e) {}
            return;
        }

        if (action === 'give') {
            const amount = parseFloat(subArgs[2]) || 0;
            if (amount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма > 0');
            db.rpMembers.updateBalance(target, amount, 'admin_give', 'Выдан админом ' + username, username);
            logger.warn(username + ' выдал ' + utils.formatMoney(amount) + ' → ' + target);
            msg(bot, username, '&#76C519✅ Выдано &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4→ ' + target);
            try { bot.chat('/msg ' + target + ' &#76C519🎁 Админ выдал вам &#FFB800' + utils.formatMoney(amount)); } catch(e) {}
            return;
        }

        if (action === 'reset') {
            db.rpMembers.updateBalance(target, -tm.balance, 'admin_reset', 'Сброшен админом ' + username, username);
            logger.warn(username + ' сбросил баланс ' + target);
            msg(bot, username, '&#76C519✅ Баланс ' + target + ' сброшен');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВаш баланс сброшен администратором'); } catch(e) {}
            return;
        }

        if (action === 'del') {
            const amount = parseFloat(subArgs[2]) || 0;
            if (amount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма > 0');
            if (tm.balance < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно средств! Баланс: ' + utils.formatMoney(tm.balance));
            db.rpMembers.updateBalance(target, -amount, 'admin_remove', 'Снято админом ' + username, username);
            logger.warn(username + ' снял ' + utils.formatMoney(amount) + ' у ' + target);
            msg(bot, username, '&#76C519✅ Снято &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4у ' + target);
            try { bot.chat('/msg ' + target + ' &#CA4E4EАдмин снял ' + utils.formatMoney(amount) + ' с вашего счёта'); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /arp balance <set|give|reset|del|info>');
        return;
    }

    // ==================== RANK ====================
    if (sub === 'rank') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp rank <set|del|info> <ник> [структура] [ранг]');
        const action = subArgs[0].toLowerCase();
        const target = subArgs[1];
        const tm = db.rpMembers.get(target);
        if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

        if (action === 'info') {
            if (!tm.organization) return msg(bot, username, '&#D4D4D4' + target + ' не состоит в организации');
            const orgConfig = Object.values(config.organizations).find(o => o.name === tm.organization);
            msg(bot, username,
                '&#80C4C5👤 ' + target + ' &#D4D4D4| &#FFB800' + tm.organization +
                ' &#D4D4D4| Ранг: &#76C519' + (tm.rank || 'Нет')
            );
            if (orgConfig && tm.rank && orgConfig.ranks[tm.rank]) {
                const ri = orgConfig.ranks[tm.rank];
                msg(bot, username, '&#D4D4D4Зарплата: &#76C519' + utils.formatMoney(ri.salary) + '/час &#D4D4D4| Уровень: &#76C519' + ri.level);
            }
            return;
        }

        if (action === 'set') {
            if (subArgs.length < 4) return msg(bot, username, '&#CA4E4E❌ /arp rank set <ник> <ключ_структуры> <ранг>');
            const orgKey = subArgs[2].toLowerCase();
            const rank = subArgs.slice(3).join(' ');
            const orgConfig = config.organizations[orgKey];

            if (!orgConfig) {
                const validOrgs = Object.keys(config.organizations).map(k => k + ' (' + config.organizations[k].name + ')').join(', ');
                return msg(bot, username, '&#CA4E4E❌ Структура. Доступные: ' + validOrgs);
            }
            if (!orgConfig.ranks[rank]) {
                return msg(bot, username, '&#CA4E4E❌ Неверный ранг. Доступные: ' + Object.keys(orgConfig.ranks).join(', '));
            }

            db.rpMembers.setOrganization(target, orgConfig.name, rank);
            logger.warn(username + ' назначил ' + target + ' в ' + orgConfig.name + ' (' + rank + ')');
            msg(bot, username, '&#76C519✅ ' + target + ' → &#FFB800' + orgConfig.name + ' &#D4D4D4(' + rank + ')');
            try { bot.chat('/msg ' + target + ' &#76C519Вы назначены в &#FFB800' + orgConfig.name + ' &#D4D4D4(' + rank + ')'); } catch(e) {}
            return;
        }

        if (action === 'del') {
            const oldOrg = tm.organization;
            const oldRank = tm.rank;
            db.rpMembers.setOrganization(target, null, null);
            logger.warn(username + ' снял ' + target + ' с ' + oldOrg + ' (' + oldRank + ')');
            msg(bot, username, '&#76C519✅ ' + target + ' снят с должности (был: ' + oldOrg + ')');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВы сняты с должности в ' + oldOrg); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /arp rank <set|del|info>');
        return;
    }

    // ==================== POINTS ====================
    if (sub === 'points') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp points <add|del|set|info> <ник> [количество]');
        const action = subArgs[0].toLowerCase();
        const target = subArgs[1];
        const tm = db.rpMembers.get(target);
        if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

        if (action === 'info') {
            return msg(bot, username, '&#80C4C5⭐ Баллы ' + target + ': &#FFB800' + (tm.points || 0));
        }
        if (action === 'add') {
            const amount = parseInt(subArgs[2]) || 0;
            if (amount <= 0) return msg(bot, username, '&#CA4E4E❌ Количество > 0');
            db.rpMembers.addPoints(target, amount);
            logger.info(username + ' добавил ' + amount + ' баллов → ' + target);
            msg(bot, username, '&#76C519✅ +' + amount + ' баллов → ' + target + ' (текущие: ' + ((tm.points || 0) + amount) + ')');
            try { bot.chat('/msg ' + target + ' &#76C519⭐ +' + amount + ' баллов активности'); } catch(e) {}
            return;
        }
        if (action === 'del') {
            const amount = parseInt(subArgs[2]) || 0;
            if (amount <= 0) return msg(bot, username, '&#CA4E4E❌ Количество > 0');
            db.rpMembers.addPoints(target, -amount);
            logger.info(username + ' снял ' + amount + ' баллов у ' + target);
            msg(bot, username, '&#76C519✅ -' + amount + ' баллов у ' + target);
            return;
        }
        if (action === 'set') {
            const amount = parseInt(subArgs[2]) || 0;
            if (amount < 0) return msg(bot, username, '&#CA4E4E❌ ≥ 0');
            const diff = amount - (tm.points || 0);
            db.rpMembers.addPoints(target, diff);
            logger.info(username + ' установил ' + amount + ' баллов для ' + target);
            msg(bot, username, '&#76C519✅ Баллы ' + target + ': &#FFB800' + amount);
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp points <add|del|set|info>');
        return;
    }

    // ==================== BLACKLIST (ОРГАНИЗАЦИЙ) ====================
    if (sub === 'blacklist' || sub === 'bl') {
        if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp blacklist <add|del|check> <ник> <ключ_организации>');
        const action = subArgs[0].toLowerCase();

        if (action === 'check') {
            const target = subArgs[1];
            const orgKey = subArgs[2].toLowerCase();
            const orgConfig = config.organizations[orgKey];
            if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');
            const isBL = db.orgBlacklists.isBlacklisted(target, orgConfig.name);
            msg(bot, username, '&#D4D4D4' + target + ' в ЧС ' + orgConfig.name + ': ' + (isBL ? '&#CA4E4EДа' : '&#76C519Нет'));
            return;
        }

        if (action === 'add') {
            const target = subArgs[1];
            const orgKey = subArgs[2].toLowerCase();
            const reason = subArgs.slice(3).join(' ') || 'Не указана';
            const orgConfig = config.organizations[orgKey];
            if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');

            db.orgBlacklists.add(target, orgConfig.name, reason, username);
            logger.warn(username + ' добавил ' + target + ' в ЧС ' + orgConfig.name);
            msg(bot, username, '&#76C519✅ ' + target + ' в ЧС ' + orgConfig.name);
            try { bot.chat('/msg ' + target + ' &#CA4E4EВы в ЧС ' + orgConfig.name); } catch(e) {}
            return;
        }

        if (action === 'del') {
            const target = subArgs[1];
            const orgKey = subArgs[2].toLowerCase();
            const orgConfig = config.organizations[orgKey];
            if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');

            db.orgBlacklists.remove(target, orgConfig.name);
            logger.info(username + ' удалил ' + target + ' из ЧС ' + orgConfig.name);
            msg(bot, username, '&#76C519✅ ' + target + ' удалён из ЧС ' + orgConfig.name);
            try { bot.chat('/msg ' + target + ' &#76C519Вы удалены из ЧС ' + orgConfig.name); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /arp blacklist <add|del|check>');
        return;
    }

    // ==================== PAYDAY ====================
    if (sub === 'payday') {
        if (!permissions.isAdmin(username, db)) return msg(bot, username, '&#CA4E4E❌ Только администратор');

        try {
            const paydayModule = require('../payday');
            paydayModule.processPayday(bot, true);
            logger.warn(username + ' запустил внеплановый PayDay');
            msg(bot, username, '&#76C519✅ Внеплановый PayDay запущен');
            cc(bot, '&#FFB800💰 ' + username + ' запустил внеплановый PayDay!');
        } catch(e) {
            msg(bot, username, '&#CA4E4E❌ Ошибка PayDay: ' + e.message);
        }
        return;
    }

    // ==================== WARN ====================
    if (sub === 'warn') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp warn <add|del|list> <ник> [причина]');
        const action = subArgs[0].toLowerCase();

        if (action === 'list') {
            const target = subArgs[1];
            const m = db.rpMembers.get(target);
            if (!m) return msg(bot, username, '&#CA4E4E❌ Игрок не найден');
            msg(bot, username, '&#D4D4D4Предупреждения ' + target + ': ' + (m.warns > 0 ? '&#CA4E4E' + m.warns + '/3' : '&#76C5190'));
            return;
        }

        if (action === 'add') {
            const target = subArgs[1];
            const reason = subArgs.slice(2).join(' ') || 'Не указана';
            db.rpMembers.addWarn(target);
            const updated = db.rpMembers.get(target);
            const wc = updated?.warns || 0;

            logger.warn(username + ' выдал предупреждение ' + target + ' (' + wc + '/3)');
            try { bot.chat('/msg ' + target + ' &#FFB800⚠ Предупреждение ' + wc + '/3: ' + reason); } catch(e) {}

            if (wc >= 3) {
                db.rpMembers.setFrozen(target, true, '3 предупреждения от ' + username);
                msg(bot, username, '&#CA4E4E🚫 ' + target + ': ' + wc + '/3! RP ЗАБЛОКИРОВАН!');
                cc(bot, '&#CA4E4E🚫 ' + target + ' заблокирован в RP (3 предупреждения)');
            } else {
                msg(bot, username, '&#FFB800⚠ ' + target + ': предупреждение ' + wc + '/3');
            }
            return;
        }

        if (action === 'del') {
            const target = subArgs[1];
            db.run('UPDATE rp_members SET warns = MAX(0, warns - 1), last_warn_at = NULL WHERE username_lower = ?', [target.toLowerCase()]);
            const updated = db.rpMembers.get(target);
            logger.info(username + ' снял предупреждение с ' + target);
            msg(bot, username, '&#76C519✅ Предупреждение снято с ' + target + ' (осталось: ' + (updated?.warns || 0) + ')');
            try { bot.chat('/msg ' + target + ' &#76C519✅ С вас снято предупреждение'); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /arp warn <add|del|list>');
        return;
    }

    // ==================== STATS ====================
    if (sub === 'stats') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp stats <ник>');
        const target = subArgs[0];
        const m = db.rpMembers.get(target);
        if (!m || m.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

        const clan = db.members.get(target);
        const bank = db.bank.getAccount(target);
        const props = db.properties.getOwned(target);

        msg(bot, username,
            '&#80C4C5📊 ' + target +
            ' &#D4D4D4| ID: &#76C519' + m.id +
            ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(m.balance) +
            ' &#D4D4D4| Банк: &#76C519' + utils.formatMoney(m.bank_balance)
        );

        msg(bot, username,
            '&#D4D4D4' + (m.organization || 'Безработный') +
            ' &#D4D4D4| ' + (m.rank || '—') +
            ' &#D4D4D4| Баллы: &#FFB800' + (m.points || 0) +
            ' &#D4D4D4| PayDay: &#FFB800' + (m.payday_count || 0) +
            ' &#D4D4D4| Часов: &#76C519' + (m.total_hours || 0).toFixed(1)
        );

        if (clan) {
            msg(bot, username,
                '&#D4D4D4Убийств: &#CA4E4E' + (clan.kills || 0) +
                ' &#D4D4D4| Смертей: &#FFB800' + (clan.deaths || 0) +
                ' &#D4D4D4| K/D: &#80C4C5' + (clan.deaths > 0 ? (clan.kills / clan.deaths).toFixed(2) : clan.kills) +
                ' &#D4D4D4| Имущества: &#76C519' + props.length
            );
        }
        return;
    }

    // ==================== RP ====================
    if (sub === 'rp') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp rp <del|freeze|unfreeze|blacklist|unblacklist> <ник> [причина]');
        const action = subArgs[0].toLowerCase();
        const target = subArgs[1];
        const reason = subArgs.slice(2).join(' ') || 'Не указана';

        const member = db.rpMembers.get(target);
        if (!member || member.is_active !== 1 && action !== 'unfreeze') return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

        if (action === 'del') {
            db.rpMembers.removeRp(target);
            logger.warn(username + ' забрал RP у ' + target + ': ' + reason);
            msg(bot, username, '&#76C519✅ RP-доступ забран у ' + target);
            cc(bot, '&#CA4E4E' + target + ' исключён из RP');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВаш RP-доступ аннулирован: ' + reason); } catch(e) {}
            return;
        }
        if (action === 'freeze') {
            db.rpMembers.setFrozen(target, true, reason);
            logger.warn(username + ' заморозил ' + target + ': ' + reason);
            msg(bot, username, '&#76C519✅ ' + target + ' заморожен');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВаш профиль заморожен: ' + reason); } catch(e) {}
            return;
        }
        if (action === 'unfreeze') {
            db.rpMembers.setFrozen(target, false);
            logger.info(username + ' разморозил ' + target);
            msg(bot, username, '&#76C519✅ ' + target + ' разморожен');
            try { bot.chat('/msg ' + target + ' &#76C519Ваш профиль разморожен'); } catch(e) {}
            return;
        }
        if (action === 'blacklist') {
            db.run('UPDATE rp_members SET blacklisted_from_rp = 1 WHERE username_lower = ?', [target.toLowerCase()]);
            logger.warn(username + ' заблокировал ' + target + ' в RP: ' + reason);
            msg(bot, username, '&#76C519✅ ' + target + ' заблокирован в RP');
            return;
        }
        if (action === 'unblacklist') {
            db.run('UPDATE rp_members SET blacklisted_from_rp = 0 WHERE username_lower = ?', [target.toLowerCase()]);
            logger.info(username + ' разблокировал ' + target + ' в RP');
            msg(bot, username, '&#76C519✅ ' + target + ' разблокирован в RP');
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp rp <del|freeze|unfreeze|blacklist|unblacklist>');
        return;
    }

    // ==================== IDIM ====================
    if (sub === 'idim') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp idim <add|del|info|list> <ник> [номер]');
        const action = subArgs[0].toLowerCase();

        if (action === 'list') {
            const target = subArgs[1];
            const props = db.properties.getOwned(target);
            if (props.length === 0) return msg(bot, username, '&#D4D4D4У ' + target + ' нет имущества');
            const list = props.map(p => '&b#' + p.property_id + ' ' + p.property_type).join(' | ');
            msg(bot, username, '&#80C4C5🏠 Имущество ' + target + ' (' + props.length + '): ' + list);
            return;
        }

        if (action === 'add') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp idim add <ник> <номер>');
            const target = subArgs[1];
            const propertyId = subArgs[2];
            if (!utils.isValidPropertyId(propertyId)) return msg(bot, username, '&#CA4E4E❌ Неверный ID');
            const propertyConfig = config.getPropertyInfo(propertyId);
            const existing = db.properties.get(propertyId);
            if (existing?.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' уже занято (' + existing.owner + ')');

            db.properties.grant(propertyId, target, username);
            const regionName = config.clan.regionPrefix + propertyId;
            bot.chat('/rg addmember ' + regionName + ' ' + target);
            logger.warn(username + ' выдал #' + propertyId + ' → ' + target);
            msg(bot, username, '&#76C519✅ Имущество #' + propertyId + ' (' + propertyConfig.type + ') выдано ' + target);
            try { bot.chat('/msg ' + target + ' &#76C519Вам выдано имущество #' + propertyId); } catch(e) {}
            return;
        }

        if (action === 'del') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp idim del <ник> <номер>');
            const target = subArgs[1];
            const propertyId = subArgs[2];
            const existing = db.properties.get(propertyId);
            if (!existing?.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');

            db.properties.remove(propertyId);
            const regionName = config.clan.regionPrefix + propertyId;
            bot.chat('/rg removemember ' + regionName + ' ' + target);
            logger.warn(username + ' забрал #' + propertyId + ' у ' + target);
            msg(bot, username, '&#76C519✅ Имущество #' + propertyId + ' забрано у ' + target);
            try { bot.chat('/msg ' + target + ' &#CA4E4EУ вас забрано имущество #' + propertyId); } catch(e) {}
            return;
        }

        if (action === 'info') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp idim info <номер>');
            const propertyId = subArgs[1];
            const prop = db.properties.get(propertyId);
            const propConfig = config.getPropertyInfo(propertyId);
            if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Не найдено');

            const typeNames = { apartment: 'Кв', house: 'Дом', office: 'Офис', business: 'Бизнес', port: 'Порт' };
            if (prop?.is_owned) {
                msg(bot, username, '&#80C4C5🏠 #' + propertyId + ' ' + (typeNames[propConfig.type] || propConfig.type) + ' &#D4D4D4| Владелец: &#76C519' + prop.owner + ' &#D4D4D4| Цена: &#76C519' + utils.formatMoney(propConfig.price));
                if (prop.co_owner_1) msg(bot, username, '&#D4D4D4Сожители: &#76C519' + prop.co_owner_1 + (prop.co_owner_2 ? ', ' + prop.co_owner_2 : ''));
            } else {
                msg(bot, username, '&#80C4C5🏠 #' + propertyId + ' ' + (typeNames[propConfig.type] || propConfig.type) + ' &#76C519Свободно &#D4D4D4| Цена: &#76C519' + utils.formatMoney(propConfig.price));
            }
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /arp idim <add|del|info|list>');
        return;
    }

    // ==================== ORG ====================
    if (sub === 'org') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp org <freeze|unfreeze|budget|materials|bonus|taxrate|info> <ключ>');
        const action = subArgs[0].toLowerCase();
        const orgKey = subArgs[1]?.toLowerCase();

        if (!orgKey || !config.organizations[orgKey]) {
            return msg(bot, username, '&#CA4E4E❌ Неверная организация. ' + Object.keys(config.organizations).join(', '));
        }

        const orgConfig = config.organizations[orgKey];

        if (action === 'freeze') {
            const reason = subArgs.slice(2).join(' ') || 'Не указана';
            db.orgBudgets.setFrozen(orgKey, true, reason);
            logger.warn(username + ' заморозил ' + orgConfig.name);
            msg(bot, username, '&#76C519✅ ' + orgConfig.name + ' заморожена');
            cc(bot, '&#CA4E4E⚠ ' + orgConfig.name + ' заморожена!');
            return;
        }
        if (action === 'unfreeze') {
            db.orgBudgets.setFrozen(orgKey, false);
            logger.info(username + ' разморозил ' + orgConfig.name);
            msg(bot, username, '&#76C519✅ ' + orgConfig.name + ' разморожена');
            cc(bot, '&#76C519✅ ' + orgConfig.name + ' разморожена');
            return;
        }
        if (action === 'budget') {
            if (subArgs.length < 3) {
                const budget = db.orgBudgets.get(orgKey);
                msg(bot, username, '&#80C4C5💰 ' + orgConfig.name + ' &#D4D4D4| Бюджет: &#76C519' + utils.formatMoney(budget?.budget || orgConfig.budget) + ' &#D4D4D4| Материалы: &#FFB800' + (budget?.materials || 0));
                return;
            }
            const budgetAction = subArgs[2].toLowerCase();
            const amount = parseFloat(subArgs[3]) || 0;

            if (budgetAction === 'set') {
                const current = db.orgBudgets.get(orgKey);
                const diff = amount - (current?.budget || 0);
                db.orgBudgets.updateBudget(orgKey, diff);
                logger.warn(username + ' установил бюджет ' + orgConfig.name + ' = ' + utils.formatMoney(amount));
                msg(bot, username, '&#76C519✅ Бюджет ' + orgConfig.name + ': &#FFB800' + utils.formatMoney(amount));
                return;
            }
            if (budgetAction === 'add') {
                db.orgBudgets.updateBudget(orgKey, amount);
                msg(bot, username, '&#76C519✅ +' + utils.formatMoney(amount) + ' → ' + orgConfig.name);
                return;
            }
            msg(bot, username, '&#CA4E4E❌ /arp org budget <ключ> <set|add> <сумма>');
            return;
        }
        if (action === 'materials') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp org materials <ключ> <set|add|del> <количество>');
            const matAction = subArgs[2].toLowerCase();
            const amount = parseInt(subArgs[3]) || 0;

            if (matAction === 'set') {
                const current = db.orgBudgets.get(orgKey);
                db.orgBudgets.updateMaterials(orgKey, amount - (current?.materials || 0));
                msg(bot, username, '&#76C519✅ Материалы ' + orgConfig.name + ': &#FFB800' + amount);
                return;
            }
            if (matAction === 'add') {
                db.orgBudgets.updateMaterials(orgKey, amount);
                msg(bot, username, '&#76C519✅ +' + amount + ' материалов → ' + orgConfig.name);
                return;
            }
            if (matAction === 'del') {
                const current = db.orgBudgets.get(orgKey);
                if ((current?.materials || 0) < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно. Текущие: ' + (current?.materials || 0));
                db.orgBudgets.updateMaterials(orgKey, -amount);
                msg(bot, username, '&#76C519✅ -' + amount + ' материалов из ' + orgConfig.name);
                return;
            }
            return;
        }
        if (action === 'bonus') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp org bonus <ключ> <процент>');
            const percent = parseFloat(subArgs[2]) / 100;
            db.orgBudgets.setBonus(orgKey, percent);
            logger.info(username + ' установил бонус ' + orgConfig.name + ' = ' + (percent * 100).toFixed(0) + '%');
            msg(bot, username, '&#76C519✅ Бонус ' + orgConfig.name + ': &#FFB800' + (percent * 100).toFixed(0) + '%');
            return;
        }
        if (action === 'taxrate') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp org taxrate <ключ> <ставка_%>');
            const rate = parseFloat(subArgs[2]) / 100;
            db.orgBudgets.setTaxRate(orgKey, rate);
            logger.info(username + ' установил налог ' + orgConfig.name + ' = ' + (rate * 100).toFixed(1) + '%');
            msg(bot, username, '&#76C519✅ Налог ' + orgConfig.name + ': &#FFB800' + (rate * 100).toFixed(1) + '%');
            return;
        }
        if (action === 'info') {
            const budget = db.orgBudgets.get(orgKey);
            const members = db.all('SELECT COUNT(*) as c FROM rp_members WHERE organization = ? AND is_active = 1', [orgConfig.name])[0]?.c || 0;
            msg(bot, username,
                '&#80C4C5🏛️ ' + orgConfig.name +
                ' &#D4D4D4| Бюджет: &#76C519' + utils.formatMoney(budget?.budget || orgConfig.budget) +
                ' &#D4D4D4| Сотрудников: &#FFB800' + members +
                ' &#D4D4D4| Статус: ' + (budget?.is_frozen ? '&#CA4E4EЗаморожена' : '&#76C519Активна')
            );
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp org <freeze|unfreeze|budget|materials|bonus|taxrate|info>');
        return;
    }

    // ==================== BAND ====================
    if (sub === 'band') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp band <create|delete|freeze|unfreeze|setleader|warn|kick|info|list|members|balance|materials>');
        const action = subArgs[0].toLowerCase();
        const bandArgs = subArgs.slice(1);

        if (action === 'create') {
            if (bandArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp band create <название> <цветное_название> [лидер]');
            const result = db.gangs.create(bandArgs[0], bandArgs[1], bandArgs[2] || username);
            if (result.success) {
                logger.warn(username + ' создал банду "' + bandArgs[0] + '"');
                msg(bot, username, '&#76C519✅ Банда "' + bandArgs[1] + '&r" создана! Лидер: ' + (bandArgs[2] || username));
                cc(bot, '&#FFB800🔫 Новая банда: ' + bandArgs[1]);
            } else {
                msg(bot, username, '&#CA4E4E❌ ' + (result.reason === 'gang_exists' ? 'Уже существует' : 'Ошибка'));
            }
            return;
        }
        if (action === 'delete') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band delete <название>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.delete(gang.id);
            logger.warn(username + ' удалил банду "' + bandArgs[0] + '"');
            msg(bot, username, '&#76C519✅ Банда удалена');
            return;
        }
        if (action === 'freeze') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band freeze <название> [причина]');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.freeze(gang.id, bandArgs.slice(1).join(' ') || 'Не указана');
            msg(bot, username, '&#76C519✅ Банда заморожена');
            return;
        }
        if (action === 'unfreeze') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band unfreeze <название>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.unfreeze(gang.id);
            msg(bot, username, '&#76C519✅ Банда разморожена');
            return;
        }
        if (action === 'setleader') {
            if (bandArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp band setleader <название> <ник>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.setLeader(gang.id, bandArgs[1]);
            msg(bot, username, '&#76C519✅ Новый лидер: ' + bandArgs[1]);
            return;
        }
        if (action === 'warn') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band warn <название> [причина]');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.addWarn(gang.id);
            const updated = db.gangs.get(bandArgs[0]);
            if (updated.warns >= 3) {
                db.gangs.freeze(gang.id, '3 выговора');
                msg(bot, username, '&#CA4E4E🚫 Выговор ' + updated.warns + '/3! Банда ЗАМОРОЖЕНА!');
                cc(bot, '&#CA4E4E🚫 Банда "' + bandArgs[0] + '" заморожена (3 выговора)');
            } else {
                msg(bot, username, '&#FFB800⚠ Выговор ' + updated.warns + '/3');
            }
            return;
        }
        if (action === 'kick') {
            if (bandArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp band kick <название> <ник>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            db.gangs.removeMember(gang.id, bandArgs[1]);
            msg(bot, username, '&#76C519✅ ' + bandArgs[1] + ' исключён');
            return;
        }
        if (action === 'info') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band info <название>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            const members = db.gangs.getMembers(gang.id);
            msg(bot, username,
                (gang.color_name || gang.name) +
                ' &#D4D4D4| Лидер: &#76C519' + gang.leader +
                ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(gang.balance) +
                ' &#D4D4D4| Мат: &#FFB800' + gang.materials +
                ' &#D4D4D4| Участников: &#FFB800' + members.length
            );
            return;
        }
        if (action === 'list') {
            const gangs = db.gangs.getAll();
            if (gangs.length === 0) return msg(bot, username, '&#D4D4D4Нет активных банд');
            const list = gangs.map(g => (g.color_name || g.name) + ' &#D4D4D4(' + g.leader + ')').join(' | ');
            msg(bot, username, '&#80C4C5🔫 Банды (' + gangs.length + '): ' + list);
            return;
        }
        if (action === 'members') {
            if (bandArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /arp band members <название>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            const members = db.gangs.getMembers(gang.id);
            msg(bot, username, '&#80C4C5👥 ' + bandArgs[0] + ' (' + members.length + '): ' + members.map(m => m.username).join(', '));
            return;
        }
        if (action === 'balance') {
            if (bandArgs.length < 2) {
                const gang = db.gangs.get(bandArgs[0]);
                if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
                return msg(bot, username, '&#80C4C5💰 ' + bandArgs[0] + ': &#76C519' + utils.formatMoney(gang.balance));
            }
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            const balAction = bandArgs[1].toLowerCase();
            const amount = parseFloat(bandArgs[2]) || 0;

            if (balAction === 'set') {
                db.gangs.updateBalance(gang.id, amount - gang.balance);
                msg(bot, username, '&#76C519✅ Баланс: &#FFB800' + utils.formatMoney(amount));
            } else if (balAction === 'add') {
                db.gangs.updateBalance(gang.id, amount);
                msg(bot, username, '&#76C519✅ +' + utils.formatMoney(amount));
            } else {
                msg(bot, username, '&#CA4E4E❌ /arp band balance <название> <set|add> <сумма>');
            }
            return;
        }
        if (action === 'materials') {
            if (bandArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /arp band materials <название> <set|add|del> <количество>');
            const gang = db.gangs.get(bandArgs[0]);
            if (!gang) return msg(bot, username, '&#CA4E4E❌ Не найдена');
            const matAction = bandArgs[1].toLowerCase();
            const amount = parseInt(bandArgs[2]) || 0;

            if (matAction === 'set') {
                db.gangs.updateMaterials(gang.id, amount - gang.materials);
                msg(bot, username, '&#76C519✅ Материалы: &#FFB800' + amount);
            } else if (matAction === 'add') {
                db.gangs.updateMaterials(gang.id, amount);
                msg(bot, username, '&#76C519✅ +' + amount + ' материалов');
            } else if (matAction === 'del') {
                db.gangs.updateMaterials(gang.id, -amount);
                msg(bot, username, '&#76C519✅ -' + amount + ' материалов');
            } else {
                msg(bot, username, '&#CA4E4E❌ /arp band materials <название> <set|add|del>');
            }
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp band <create|delete|freeze|unfreeze|setleader|warn|kick|info|list|members|balance|materials>');
        return;
    }

    // ==================== VIRUS ====================
    if (sub === 'virus') {
        if (subArgs.length < 1) {
            const enabled = db.settings.getBoolean('virus_enabled');
            const chance = db.settings.getNumber('virus_chance') || config.virus.defaultChance;
            msg(bot, username, '&#80C4C5🦠 Вирус: ' + (enabled ? '&#76C519Вкл' : '&#CA4E4EВыкл') + ' &#D4D4D4| Шанс: &#FFB800' + (chance * 100).toFixed(0) + '%');
            return;
        }

        const action = subArgs[0].toLowerCase();

        if (action === 'on') {
            db.settings.set('virus_enabled', 'true');
            db.settings.set('virus_chance', String(config.virus.highChance));
            logger.warn(username + ' включил вирус (40%)');
            msg(bot, username, '&#CA4E4E🦠 Вирус ВКЛЮЧЕН! Шанс: 40%');
            cc(bot, '&#CA4E4E🦠 ВНИМАНИЕ! Вирус активирован! Шанс заражения: 40%');
            return;
        }
        if (action === 'off') {
            db.settings.set('virus_enabled', 'false');
            logger.info(username + ' выключил вирус');
            msg(bot, username, '&#76C519✅ Вирус выключен');
            cc(bot, '&#76C519✅ Вирус деактивирован');
            return;
        }
        if (action === 'normal') {
            db.settings.set('virus_enabled', 'true');
            db.settings.set('virus_chance', String(config.virus.defaultChance));
            msg(bot, username, '&#76C519✅ Нормальный режим (5%)');
            return;
        }
        if (action === 'chance') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp virus chance <0-100>');
            const chancePercent = parseFloat(subArgs[1]);
            if (isNaN(chancePercent) || chancePercent < 0 || chancePercent > 100) return msg(bot, username, '&#CA4E4E❌ 0-100');
            const chance = chancePercent / 100;
            db.settings.set('virus_chance', String(chance));
            logger.info(username + ' установил шанс вируса: ' + chancePercent + '%');
            msg(bot, username, '&#76C519✅ Шанс заражения: &#FFB800' + chancePercent + '%');
            return;
        }
        if (action === 'infect') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp virus infect <ник> [часы]');
            const target = subArgs[1];
            const hours = parseInt(subArgs[2]) || 48;
            db.rpMembers.setSick(target, 'admin_infection', hours);
            logger.warn(username + ' заразил ' + target + ' на ' + hours + 'ч');
            msg(bot, username, '&#76C519✅ ' + target + ' заражён на ' + hours + 'ч');
            try { bot.chat('/msg ' + target + ' &#CA4E4E🦠 Вы заражены вирусом на ' + hours + 'ч'); } catch(e) {}
            return;
        }
        if (action === 'cure') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp virus cure <ник>');
            const target = subArgs[1];
            db.rpMembers.healFromSick(target, 'admin_cure');
            logger.info(username + ' вылечил ' + target);
            msg(bot, username, '&#76C519✅ ' + target + ' вылечен');
            try { bot.chat('/msg ' + target + ' &#76C519✅ Вы вылечены администратором'); } catch(e) {}
            return;
        }
        if (action === 'cureall') {
            const sickMembers = db.all("SELECT * FROM rp_members WHERE is_sick = 1 AND is_active = 1");
            for (const m of sickMembers) db.rpMembers.healFromSick(m.username, 'admin_cure_all');
            logger.warn(username + ' вылечил всех (' + sickMembers.length + ')');
            msg(bot, username, '&#76C519✅ Вылечено: &#FFB800' + sickMembers.length + ' игроков');
            cc(bot, '&#76C519✅ Все больные вылечены администратором');
            return;
        }
        if (action === 'stats') {
            const sickMembers = db.all("SELECT * FROM rp_members WHERE is_sick = 1 AND is_active = 1");
            msg(bot, username, '&#80C4C5🦠 Статистика &#D4D4D4| Больных: &#CA4E4E' + sickMembers.length + ' &#D4D4D4| Шанс: &#FFB800' + ((db.settings.getNumber('virus_chance') || 0.05) * 100).toFixed(0) + '%');
            if (sickMembers.length > 0 && sickMembers.length <= 10) {
                msg(bot, username, '&#D4D4D4Больные: ' + sickMembers.map(m => m.username).join(', '));
            }
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp virus <on|off|normal|chance|infect|cure|cureall|stats>');
        return;
    }

    // ==================== ECONOMY ====================
    if (sub === 'economy') {
        if (subArgs.length < 1) {
            const taxRate = db.settings.getNumber('economy_tax_rate') || 0.01;
            const allOrgs = db.orgBudgets.getAll();
            const totalBudget = allOrgs.reduce((s, o) => s + o.budget, 0);
            msg(bot, username, '&#80C4C5💰 Экономика &#D4D4D4| Налог: &#FFB800' + (taxRate * 100).toFixed(1) + '% &#D4D4D4| Бюджет орг: &#76C519' + utils.formatMoney(totalBudget));
            return;
        }

        const action = subArgs[0].toLowerCase();

        if (action === 'tax') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /arp economy tax <ставка_%>');
            const rate = parseFloat(subArgs[1]) / 100;
            if (isNaN(rate) || rate < 0 || rate > 1) return msg(bot, username, '&#CA4E4E❌ 0-100%');
            db.settings.set('economy_tax_rate', String(rate));
            logger.warn(username + ' изменил налог: ' + (rate * 100).toFixed(1) + '%');
            msg(bot, username, '&#76C519✅ Налог: &#FFB800' + (rate * 100).toFixed(1) + '%');
            cc(bot, '&#FFB800💰 Ставка налога изменена: ' + (rate * 100).toFixed(1) + '%');
            return;
        }
        if (action === 'info') {
            const rpMembers = db.rpMembers.getAll();
            const totalMoney = rpMembers.reduce((s, m) => s + m.balance + m.bank_balance, 0);
            msg(bot, username, '&#80C4C5📊 Экономика &#D4D4D4| Игроков: &#FFB800' + rpMembers.length + ' &#D4D4D4| Денег: &#76C519' + utils.formatMoney(totalMoney));
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /arp economy <tax|info>');
        return;
    }

    // ==================== FREEZE / UNFREEZE ====================
    if (sub === 'freeze') {
        const reason = subArgs.join(' ') || 'Не указана';
        db.settings.set('global_freeze', 'true');
        if (process.send) process.send({ type: 'global_freeze', enabled: true });
        logger.warn(username + ' активировал глобальную заморозку!');
        msg(bot, username, '&#CA4E4E⚠ Глобальная заморозка активирована!');
        cc(bot, '&#CA4E4E⚠ ГЛОБАЛЬНАЯ ЗАМОРОЗКА! Все системы остановлены.');
        return;
    }
    if (sub === 'unfreeze') {
        db.settings.set('global_freeze', 'false');
        if (process.send) process.send({ type: 'global_freeze', enabled: false });
        logger.warn(username + ' снял глобальную заморозку');
        msg(bot, username, '&#76C519✅ Системы восстановлены');
        cc(bot, '&#76C519✅ Глобальная заморозка снята!');
        return;
    }

    // ==================== STOPALL ====================
    if (sub === 'stopall') {
        if (!permissions.isAdmin(username, db)) return msg(bot, username, '&#CA4E4E❌ Только администратор');
        db.settings.set('global_freeze', 'true');
        if (process.send) process.send({ type: 'global_freeze', enabled: true });
        logger.error(username + ' активировал STOPALL!');
        msg(bot, username, '&#CA4E4E⛔ STOPALL! ВСЕ СИСТЕМЫ ОСТАНОВЛЕНЫ!');
        cc(bot, '&#CA4E4E⛔ STOPALL! Команды не выполняются.');
        return;
    }

    // ==================== RELOADBD ====================
    if (sub === 'reloadbd') {
        if (!permissions.isAdmin(username, db)) return msg(bot, username, '&#CA4E4E❌ Только администратор');
        db.run('DELETE FROM clan_chat_logs');
        db.run('DELETE FROM private_message_logs');
        logger.warn(username + ' очистил логи чата');
        msg(bot, username, '&#76C519✅ Логи чата очищены');
        return;
    }

    msg(bot, username, '&#CA4E4E❌ Неизвестная подкоманда /arp');
}

// ==================== /STOPALL и /RELOADBD ====================
function stopAll(bot, username, args, source) {
    return arpManage(bot, username, ['stopall'], source);
}
function reloadDb(bot, username, args, source) {
    return arpManage(bot, username, ['reloadbd'], source);
}

// ==================== ЭКСПОРТ ====================
module.exports = { adminManage, arpManage, stopAll, reloadDb };