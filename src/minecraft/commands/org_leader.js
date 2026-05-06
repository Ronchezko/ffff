// src/minecraft/commands/org_leader.js — Команды лидеров организаций Resistance City v5.0.0
// /orgleader — invite, kick, rank, rankinfo, setsalary, paybonus, vacation, duty, warn, unwarn, fine, stats, broadcast
// Полный код — 900+ строк

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

function checkLeaderAccess(username) {
    if (permissions.isAdmin(username, db)) return true;
    if (permissions.isMayor(username, db)) return true;
    const member = db.rpMembers.get(username);
    if (!member || !member.organization) return false;
    if (permissions.isOrgLeader(username, db)) return true;
    if (member.rank === 'Министр') return true;
    return false;
}

function getPlayerOrgKey(username) {
    const member = db.rpMembers.get(username);
    if (!member || !member.organization) return null;
    const mapping = {
        'Полиция (МВД)': 'police',
        'Армия': 'army',
        'Больница': 'hospital',
        'Академия': 'academy',
        'Мэрия и Суд': 'government'
    };
    return mapping[member.organization] || null;
}

function checkEmploymentRequirements(target) {
    const messages = [];
    if (!permissions.hasEducation(target, db)) messages.push('❌ Нет образования (Академия)');
    if (!permissions.hasMedicalBook(target, db)) messages.push('❌ Нет медкнижки (Больница)');
    if (permissions.isInJail(target, db)) messages.push('❌ В тюрьме');
    if (permissions.isSick(target, db)) messages.push('⚠ Болен (рекомендуется вылечить)');

    if (messages.length > 0) {
        return { passed: false, message: '&#CA4E4EНе выполнены требования:\n' + messages.join('\n') };
    }
    return { passed: true };
}

// ==================== /ORGLEADER ====================
function leaderManage(bot, username, args, source) {
    if (!checkLeaderAccess(username)) {
        return msg(bot, username, '&#CA4E4E❌ Только лидер организации, министр, мэр или администратор');
    }

    if (args.length < 1) {
        return msg(bot, username, '&#CA4E4E❌ /orgleader <invite|kick|rank|rankinfo|setsalary|paybonus|vacation|duty|warn|unwarn|fine|stats|broadcast>');
    }

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);
    const playerOrgKey = getPlayerOrgKey(username);
    const playerOrgName = db.rpMembers.get(username)?.organization;
    const isMayorOrAdmin = permissions.isMayor(username, db) || permissions.isAdmin(username, db);

    // ==================== INVITE ====================
    if (sub === 'invite') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader invite <ник>');
        const target = subArgs[0];

        const tm = db.rpMembers.get(target);
        if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не найден в RP');

        // Проверка, не в организации ли уже
        if (tm.organization) {
            const targetOrgKey = getPlayerOrgKey(target);
            if (isMayorOrAdmin && targetOrgKey !== playerOrgKey) {
                // Мэр/админ может переводить
            } else {
                return msg(bot, username, '&#CA4E4E❌ Игрок уже в ' + tm.organization + '. Исключите сначала.');
            }
        }

        // Проверка требований
        const reqCheck = checkEmploymentRequirements(target);
        if (!reqCheck.passed) return msg(bot, username, reqCheck.message);

        // Назначение
        const orgConfig = config.organizations[playerOrgKey];
        if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Организация не найдена');

        const ranks = Object.keys(orgConfig.ranks);
        let startRank = ranks[0];
        if (permissions.hasAdvancedEducation(target, db) && ranks.length > 1) {
            startRank = ranks[1];
        }

        db.rpMembers.setOrganization(target, playerOrgName, startRank);
        logger.info(username + ' пригласил ' + target + ' в ' + playerOrgName + ' (' + startRank + ')');

        // Уведомления
        msg(bot, username, '&#76C519✅ ' + target + ' принят в организацию\n&#D4D4D4Должность: &#FFB800' + startRank + '\n&#D4D4D4Зарплата: &#76C519' + utils.formatMoney(orgConfig.ranks[startRank].salary) + '/час');
        cc(bot, '&#76C519' + target + ' принят в ' + playerOrgName + ' (' + startRank + ')');

        try {
            bot.chat('/msg ' + target + ' &#76C519✅ Вы приняты в ' + playerOrgName + '!');
            bot.chat('/msg ' + target + ' &#D4D4D4Должность: &#FFB800' + startRank);
            bot.chat('/msg ' + target + ' &#D4D4D4Зарплата: &#76C519' + utils.formatMoney(orgConfig.ranks[startRank].salary) + '/час');
            bot.chat('/msg ' + target + ' &#D4D4D4Для начала работы: /org duty');
        } catch(e) {}
        return;
    }

    // ==================== KICK ====================
    if (sub === 'kick') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader kick <ник> [причина]');
        const target = subArgs[0];
        const reason = subArgs.slice(1).join(' ') || 'Не указана';

        const tm = db.rpMembers.get(target);
        if (!tm || tm.organization !== playerOrgName) {
            return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
        }

        if (target.toLowerCase() === username.toLowerCase()) {
            return msg(bot, username, '&#CA4E4E❌ Нельзя исключить самого себя');
        }

        // Проверка иерархии
        const targetLevel = permissions.getPlayerOrgLevel(target, db);
        const myLevel = permissions.getPlayerOrgLevel(username, db);
        if (!isMayorOrAdmin && targetLevel >= myLevel) {
            return msg(bot, username, '&#CA4E4E❌ Нельзя исключить равного или выше по рангу');
        }

        const oldRank = tm.rank;
        db.rpMembers.setOrganization(target, null, null);
        db.run('DELETE FROM active_duties WHERE username_lower = ?', [target.toLowerCase()]);

        logger.warn(username + ' исключил ' + target + ' из ' + playerOrgName + '. Причина: ' + reason);

        msg(bot, username, '&#76C519✅ ' + target + ' исключён из организации');
        cc(bot, '&#CA4E4E' + target + ' исключён из ' + playerOrgName);
        try { bot.chat('/msg ' + target + ' &#CA4E4EВы исключены из ' + playerOrgName + '. Причина: ' + reason); } catch(e) {}
        return;
    }

    // ==================== RANK ====================
    if (sub === 'rank') {
        if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /orgleader rank <set|promote|demote> <ник> [ранг]');
        const action = subArgs[0].toLowerCase();
        const target = subArgs[1];

        if (action === 'set') {
            const newRank = subArgs.slice(2).join(' ');
            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const orgConfig = config.organizations[playerOrgKey];
            if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Организация не найдена');

            if (!orgConfig.ranks[newRank]) {
                const validRanks = Object.keys(orgConfig.ranks).join(', ');
                return msg(bot, username, '&#CA4E4E❌ Неверный ранг. Доступные в ' + playerOrgName + ': ' + validRanks);
            }

            // Нельзя назначить выше своего ранга
            const targetRankLevel = orgConfig.ranks[newRank]?.level || 0;
            const myRankInfo = orgConfig.ranks[tm.rank];
            const myRankLevel = myRankInfo?.level || 0;

            if (!isMayorOrAdmin && targetRankLevel >= myRankLevel && target.toLowerCase() !== username.toLowerCase()) {
                return msg(bot, username, '&#CA4E4E❌ Нельзя назначить ранг выше или равный вашему');
            }

            db.rpMembers.setOrganization(target, playerOrgName, newRank);
            logger.info(username + ' изменил ранг ' + target + ' на ' + newRank + ' в ' + playerOrgName);

            msg(bot, username, '&#76C519✅ ' + target + ' назначен: &#FFB800' + newRank);
            try { bot.chat('/msg ' + target + ' &#76C519✅ Ваш ранг изменён на "' + newRank + '" в ' + playerOrgName); } catch(e) {}
            return;
        }

        if (action === 'promote') {
            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const orgConfig = config.organizations[playerOrgKey];
            const ranks = Object.keys(orgConfig.ranks);
            const currentIndex = ranks.indexOf(tm.rank);

            if (currentIndex === -1) return msg(bot, username, '&#CA4E4E❌ Текущий ранг не найден');
            if (currentIndex >= ranks.length - 1) return msg(bot, username, '&#CA4E4E❌ Достигнут максимальный ранг');

            const nextRank = ranks[currentIndex + 1];
            db.rpMembers.setOrganization(target, playerOrgName, nextRank);

            logger.info(username + ' повысил ' + target + ' до ' + nextRank);
            msg(bot, username, '&#76C519✅ ' + target + ' повышен: ' + tm.rank + ' → &#FFB800' + nextRank);
            cc(bot, '&#76C519' + target + ' повышен до ' + nextRank + ' в ' + playerOrgName);
            try { bot.chat('/msg ' + target + ' &#76C519🎉 Вы повышены до "' + nextRank + '"!'); } catch(e) {}
            return;
        }

        if (action === 'demote') {
            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const orgConfig = config.organizations[playerOrgKey];
            const ranks = Object.keys(orgConfig.ranks);
            const currentIndex = ranks.indexOf(tm.rank);

            if (currentIndex <= 0) return msg(bot, username, '&#CA4E4E❌ Нельзя понизить ниже минимального ранга');

            const prevRank = ranks[currentIndex - 1];
            db.rpMembers.setOrganization(target, playerOrgName, prevRank);

            logger.info(username + ' понизил ' + target + ' до ' + prevRank);
            msg(bot, username, '&#76C519✅ ' + target + ' понижен: ' + tm.rank + ' → &#FFB800' + prevRank);
            try { bot.chat('/msg ' + target + ' &#FFB800⚠ Вы понижены до "' + prevRank + '"'); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /orgleader rank <set|promote|demote>');
        return;
    }

    // ==================== RANKINFO ====================
    if (sub === 'rankinfo') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader rankinfo <ранг>');
        const rankName = subArgs.join(' ');
        const orgConfig = config.organizations[playerOrgKey];

        if (!orgConfig || !orgConfig.ranks[rankName]) {
            const validRanks = orgConfig ? Object.keys(orgConfig.ranks).join(', ') : 'не найдена';
            return msg(bot, username, '&#CA4E4E❌ Ранг не найден. Доступные: ' + validRanks);
        }

        const rankInfo = orgConfig.ranks[rankName];
        const count = db.all(
            'SELECT COUNT(*) as c FROM rp_members WHERE organization = ? AND rank = ? AND is_active = 1',
            [playerOrgName, rankName]
        )[0]?.c || 0;

        const membersAtRank = db.all(
            'SELECT username FROM rp_members WHERE organization = ? AND rank = ? AND is_active = 1',
            [playerOrgName, rankName]
        );

        const catNames = { junior: 'Младший состав', middle: 'Средний состав', senior: 'Старший состав', command: 'Руководство' };

        msg(bot, username, '&#80C4C5📋 Ранг: &#FFB800' + rankName + ' &#D4D4D4(' + playerOrgName + ')');
        msg(bot, username,
            '&#D4D4D4Зарплата: &#76C519' + utils.formatMoney(rankInfo.salary) + '/час' +
            ' &#D4D4D4| Уровень: &#76C519' + rankInfo.level +
            ' &#D4D4D4| Категория: &#76C519' + (catNames[rankInfo.category] || '—') +
            ' &#D4D4D4| Сотрудников: &#FFB800' + count
        );

        if (membersAtRank.length > 0 && membersAtRank.length <= 10) {
            const list = membersAtRank.map(m => m.username).join(', ');
            msg(bot, username, '&#D4D4D4Сотрудники с этим рангом: &#76C519' + list);
        } else if (membersAtRank.length > 10) {
            msg(bot, username, '&#D4D4D4Сотрудников: &#FFB800' + membersAtRank.length);
        }
        return;
    }

    // ==================== SETSALARY ====================
    if (sub === 'setsalary') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader setsalary <ранг> <сумма>');

        if (!isMayorOrAdmin && !permissions.isMinister(username, db)) {
            return msg(bot, username, '&#CA4E4E❌ Только министр, мэр или администратор может изменять зарплаты');
        }

        const rankName = subArgs[0];
        const newSalary = parseFloat(subArgs[1]);

        if (isNaN(newSalary) || newSalary < 0) return msg(bot, username, '&#CA4E4E❌ Зарплата не может быть отрицательной');
        if (newSalary > 50000 && !permissions.isAdmin(username, db)) {
            return msg(bot, username, '&#CA4E4E❌ Максимальная зарплата: 50 000 ₽/час. Для больших сумм обратитесь к администратору.');
        }

        const orgKey = subArgs[2]?.toLowerCase() || playerOrgKey;
        const orgConfig = config.organizations[orgKey];
        if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Организация не найдена');
        if (!orgConfig.ranks[rankName]) {
            return msg(bot, username, '&#CA4E4E❌ Ранг "' + rankName + '" не найден в ' + orgConfig.name);
        }

        const oldSalary = orgConfig.ranks[rankName].salary;
        orgConfig.ranks[rankName].salary = newSalary;

        logger.warn(username + ' изменил ЗП "' + rankName + '" в ' + orgConfig.name + ': ' + utils.formatMoney(oldSalary) + ' → ' + utils.formatMoney(newSalary));

        msg(bot, username, '&#76C519✅ Зарплата "' + rankName + '" изменена\n&#D4D4D4' + utils.formatMoney(oldSalary) + ' → &#FFB800' + utils.formatMoney(newSalary) + '/час');
        cc(bot, '&#FFB800💰 Зарплата "' + rankName + '" в ' + orgConfig.name + ': ' + utils.formatMoney(newSalary) + '/час');
        return;
    }

    // ==================== PAYBONUS / PB ====================
    if (sub === 'paybonus' || sub === 'pb') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader paybonus <ник> <сумма> [причина]');

        const target = subArgs[0];
        const amount = parseFloat(subArgs[1]);
        const reason = subArgs.slice(2).join(' ') || 'Премия';

        if (isNaN(amount) || amount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма премии должна быть положительной');
        if (amount > 50000) return msg(bot, username, '&#CA4E4E❌ Максимальная премия: 50 000 ₽ за раз');

        const tm = db.rpMembers.get(target);
        if (!tm || tm.organization !== playerOrgName) {
            return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
        }

        // Проверка бюджета
        const budget = db.orgBudgets.get(playerOrgKey);
        const currentBudget = budget?.budget || 0;

        if (currentBudget < amount) {
            return msg(bot, username,
                '&#CA4E4E❌ Недостаточно средств в бюджете!\n' +
                '&#D4D4D4Доступно: &#76C519' + utils.formatMoney(currentBudget) + '\n' +
                '&#D4D4D4Требуется: &#76C519' + utils.formatMoney(amount) + '\n' +
                '&#D4D4D4Попросите министра пополнить бюджет'
            );
        }

        // Проверка кулдауна
        const lastBonus = db.cooldowns ? db.cooldowns.get(username, 'org_bonus') : null;
        if (lastBonus) {
            const remaining = Math.ceil((lastBonus - Date.now()) / 1000);
            return msg(bot, username, '&#CA4E4E❌ Подождите ' + remaining + 'с перед следующей премией');
        }

        // Выполнение
        db.orgBudgets.updateBudget(playerOrgKey, -amount);
        db.rpMembers.updateBalance(target, amount, 'bonus', 'Премия от ' + username + ': ' + reason, username);

        if (db.cooldowns) db.cooldowns.set(username, 'org_bonus', 15);

        logger.info(username + ' выдал премию ' + target + ' — ' + utils.formatMoney(amount) + '. Причина: ' + reason);

        msg(bot, username, '&#76C519✅ Премия ' + utils.formatMoney(amount) + ' выдана ' + target);
        try {
            bot.chat('/msg ' + target + ' &#76C519🎉 Премия ' + utils.formatMoney(amount) + ' от руководства!');
            bot.chat('/msg ' + target + ' &#D4D4D4Причина: ' + reason);
        } catch(e) {}
        return;
    }

    // ==================== VACATION ====================
    if (sub === 'vacation') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader vacation <list|add|end|pending>');
        const action = subArgs[0].toLowerCase();

        if (action === 'list') {
            const vacations = db.vacations.getActiveByOrg(playerOrgName);
            if (vacations.length === 0) return msg(bot, username, '&#D4D4D4Нет сотрудников в отпуске');

            msg(bot, username, '&#80C4C5🏖️ Отпуска ' + playerOrgName + ' (' + vacations.length + '):');
            for (const v of vacations) {
                const remaining = utils.timeUntil(v.end_date);
                const totalDays = Math.ceil((new Date(v.end_date) - new Date(v.start_date)) / 86400000);
                msg(bot, username,
                    '&#D4D4D4' + v.username + ' — до ' + utils.formatDate(v.end_date) +
                    ' &#D4D4D4| Дней: &#FFB800' + totalDays +
                    ' &#D4D4D4| Осталось: &#FFB800' + remaining +
                    (v.reason ? ' &#D4D4D4| ' + v.reason : '')
                );
            }
            return;
        }

        if (action === 'add') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /orgleader vacation add <ник> <дней> [причина]');
            const target = subArgs[1];
            const days = parseInt(subArgs[2]);
            const reason = subArgs.slice(3).join(' ') || 'Отпуск';

            if (isNaN(days) || days < 1 || days > 30) {
                return msg(bot, username, '&#CA4E4E❌ Продолжительность отпуска: 1-30 дней');
            }

            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const existingVacation = db.vacations.getActive(target);
            if (existingVacation) {
                return msg(bot, username, '&#CA4E4E❌ У игрока уже активен отпуск до ' + utils.formatDate(existingVacation.end_date));
            }

            const endDate = new Date(Date.now() + days * 86400000);
            db.vacations.add(target, playerOrgName, endDate.toISOString(), reason);
            db.run('DELETE FROM active_duties WHERE username_lower = ?', [target.toLowerCase()]);

            logger.info(username + ' отправил ' + target + ' в отпуск на ' + days + ' дн (до ' + utils.formatDate(endDate) + ')');

            msg(bot, username, '&#76C519✅ ' + target + ' в отпуске на ' + days + ' дн\n&#D4D4D4До: ' + utils.formatDate(endDate));
            try {
                bot.chat('/msg ' + target + ' &#76C519🏖️ Вы в отпуске до ' + utils.formatDate(endDate));
                bot.chat('/msg ' + target + ' &#D4D4D4Причина: ' + reason);
            } catch(e) {}
            return;
        }

        if (action === 'end') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader vacation end <ник>');
            const target = subArgs[1];
            const vacation = db.vacations.getActive(target);

            if (!vacation || vacation.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ У игрока нет активного отпуска в вашей организации');
            }

            db.vacations.end(target);
            logger.info(username + ' досрочно завершил отпуск ' + target);

            msg(bot, username, '&#76C519✅ Отпуск ' + target + ' завершён');
            try { bot.chat('/msg ' + target + ' &#76C519Ваш отпуск завершён досрочно. Возвращайтесь на службу!'); } catch(e) {}
            return;
        }

        if (action === 'pending') {
            return msg(bot, username, '&#D4D4D4Система заявок на отпуск в разработке.\nИспользуйте /orgleader vacation add для немедленного оформления.');
        }

        msg(bot, username, '&#CA4E4E❌ /orgleader vacation <list|add|end|pending>');
        return;
    }

    // ==================== DUTY ====================
    if (sub === 'duty') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader duty <list|force|info>');
        const action = subArgs[0].toLowerCase();

        if (action === 'list') {
            const onDuty = db.all(
                "SELECT ad.username, ad.started_at, ad.minutes_on_duty, rp.rank " +
                "FROM active_duties ad JOIN rp_members rp ON ad.username_lower = rp.username_lower " +
                "WHERE ad.organization = ? AND rp.is_active = 1 ORDER BY ad.started_at ASC",
                [playerOrgName]
            );

            if (onDuty.length === 0) return msg(bot, username, '&#D4D4D4Нет сотрудников на дежурстве в ' + playerOrgName);

            msg(bot, username, '&#80C4C5📋 Дежурство ' + playerOrgName + ' (' + onDuty.length + '):');
            for (const d of onDuty) {
                const minutes = (d.minutes_on_duty || 0).toFixed(0);
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                const timeStr = hours > 0 ? hours + 'ч ' + mins + 'мин' : mins + 'мин';
                msg(bot, username, '&#D4D4D4' + d.username + ' (' + (d.rank || '—') + ') — ' + timeStr);
            }
            return;
        }

        if (action === 'force') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /orgleader duty force <ник> <on|off>');
            const target = subArgs[1];
            const forceAction = subArgs[2]?.toLowerCase() || 'on';

            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            if (forceAction === 'on') {
                db.run(
                    'INSERT OR REPLACE INTO active_duties (username, username_lower, organization, started_at, minutes_on_duty) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)',
                    [target, target.toLowerCase(), playerOrgName]
                );
                logger.info(username + ' принудительно поставил ' + target + ' на дежурство');
                msg(bot, username, '&#76C519✅ ' + target + ' поставлен на дежурство');
                try { bot.chat('/msg ' + target + ' &#FFB800⚠ Руководство поставило вас на дежурство'); } catch(e) {}
            } else if (forceAction === 'off') {
                db.run('DELETE FROM active_duties WHERE username_lower = ?', [target.toLowerCase()]);
                logger.info(username + ' принудительно снял ' + target + ' с дежурства');
                msg(bot, username, '&#76C519✅ ' + target + ' снят с дежурства');
                try { bot.chat('/msg ' + target + ' &#FFB800⚠ Руководство сняло вас с дежурства'); } catch(e) {}
            } else {
                return msg(bot, username, '&#CA4E4E❌ /orgleader duty force <ник> <on|off>');
            }
            return;
        }

        if (action === 'info') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader duty info <ник>');
            const target = subArgs[1];
            const duty = db.get('SELECT * FROM active_duties WHERE username_lower = ?', [target.toLowerCase()]);

            if (!duty) return msg(bot, username, '&#D4D4D4' + target + ' не на дежурстве');

            const minutes = (duty.minutes_on_duty || 0).toFixed(0);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeStr = hours > 0 ? hours + 'ч ' + mins + 'мин' : mins + 'мин';

            msg(bot, username,
                '&#80C4C5Дежурство ' + target + ':\n' +
                '&#D4D4D4Начало: &#76C519' + utils.formatDate(duty.started_at) + '\n' +
                '&#D4D4D4Отработано: &#76C519' + timeStr + '\n' +
                '&#D4D4D4Последний PayDay: &#76C519' + (duty.last_payday_at ? utils.formatDate(duty.last_payday_at) : 'Ещё не было')
            );
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /orgleader duty <list|force|info>');
        return;
    }

    // ==================== WARN ====================
    if (sub === 'warn') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader warn <add|del|list> <ник> [причина]');
        const action = subArgs[0].toLowerCase();

        if (action === 'list') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader warn list <ник>');
            const target = subArgs[1];
            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const warns = db.orgWarns.getCount(target, playerOrgName);
            msg(bot, username, '&#D4D4D4Выговоры ' + target + ' в ' + playerOrgName + ': ' + (warns > 0 ? '&#CA4E4E' + warns + '/3' : '&#76C5190'));
            return;
        }

        if (action === 'add') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader warn add <ник> [причина]');
            const target = subArgs[1];
            const reason = subArgs.slice(2).join(' ') || 'Не указана';

            const tm = db.rpMembers.get(target);
            if (!tm || tm.organization !== playerOrgName) {
                return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
            }

            const targetLevel = permissions.getPlayerOrgLevel(target, db);
            const myLevel = permissions.getPlayerOrgLevel(username, db);
            if (!isMayorOrAdmin && targetLevel >= myLevel && target.toLowerCase() !== username.toLowerCase()) {
                return msg(bot, username, '&#CA4E4E❌ Нельзя вынести выговор сотруднику с равным или высшим рангом');
            }

            const warnCount = db.orgWarns.add(target, playerOrgName, reason, username);
            logger.warn(username + ' выдал выговор ' + target + ' (' + warnCount + '/3) в ' + playerOrgName + '. Причина: ' + reason);

            if (warnCount >= 3) {
                db.rpMembers.setOrganization(target, null, null);
                db.run('DELETE FROM active_duties WHERE username_lower = ?', [target.toLowerCase()]);
                logger.warn(target + ' автоматически уволен из ' + playerOrgName + ' (3 выговора)');

                msg(bot, username, '&#CA4E4E🚫 ' + target + ' получил выговор #' + warnCount + '. АВТОМАТИЧЕСКОЕ УВОЛЬНЕНИЕ!');
                cc(bot, '&#CA4E4E' + target + ' уволен из ' + playerOrgName + ' (3 выговора)');
                try { bot.chat('/msg ' + target + ' &#CA4E4EВы уволены из ' + playerOrgName + ' (3 выговора)'); } catch(e) {}
            } else {
                msg(bot, username, '&#FFB800⚠ ' + target + ' получил выговор (' + warnCount + '/3)');
                try { bot.chat('/msg ' + target + ' &#FFB800⚠ Выговор ' + warnCount + '/3 в ' + playerOrgName + ': ' + reason); } catch(e) {}
            }
            return;
        }

        if (action === 'del') {
            if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader warn del <ник>');
            const target = subArgs[1];
            const reason = subArgs.slice(2).join(' ') || 'Не указана';

            db.orgWarns.remove(target, playerOrgName);
            logger.info(username + ' снял выговор с ' + target + ' в ' + playerOrgName);

            msg(bot, username, '&#76C519✅ Выговор снят с ' + target);
            try { bot.chat('/msg ' + target + ' &#76C519✅ С вас снят выговор в ' + playerOrgName); } catch(e) {}
            return;
        }

        msg(bot, username, '&#CA4E4E❌ /orgleader warn <add|del|list>');
        return;
    }

    // ==================== UNWARN ====================
    if (sub === 'unwarn') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader unwarn <ник> [причина]');
        const target = subArgs[0];
        const reason = subArgs.slice(1).join(' ') || 'Не указана';

        db.orgWarns.remove(target, playerOrgName);
        logger.info(username + ' снял выговор с ' + target + ' в ' + playerOrgName);

        msg(bot, username, '&#76C519✅ Выговор снят с ' + target);
        try { bot.chat('/msg ' + target + ' &#76C519✅ С вас снят выговор в ' + playerOrgName); } catch(e) {}
        return;
    }

    // ==================== FINE ====================
    if (sub === 'fine') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /orgleader fine <ник> <сумма> [причина]');
        const target = subArgs[0];
        const amount = parseFloat(subArgs[1]);
        const reason = subArgs.slice(2).join(' ') || 'Нарушение';

        if (isNaN(amount) || amount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма штрафа должна быть положительной');
        if (amount > 50000) return msg(bot, username, '&#CA4E4E❌ Максимальный штраф: 50 000 ₽');

        const tm = db.rpMembers.get(target);
        if (!tm || tm.organization !== playerOrgName) {
            return msg(bot, username, '&#CA4E4E❌ Игрок не состоит в вашей организации');
        }

        if (tm.balance < amount) {
            return msg(bot, username,
                '&#CA4E4E❌ У игрока недостаточно средств!\n' +
                '&#D4D4D4Баланс: &#76C519' + utils.formatMoney(tm.balance) + '\n' +
                '&#D4D4D4Штраф: &#76C519' + utils.formatMoney(amount)
            );
        }

        db.rpMembers.updateBalance(target, -amount, 'org_fine',
            'Штраф от руководства ' + playerOrgName + ': ' + reason, username);
        logger.info(username + ' оштрафовал ' + target + ' на ' + utils.formatMoney(amount));

        msg(bot, username, '&#76C519✅ Штраф ' + utils.formatMoney(amount) + ' выписан ' + target);
        try { bot.chat('/msg ' + target + ' &#CA4E4E⚠ Штраф ' + utils.formatMoney(amount) + ' от руководства: ' + reason); } catch(e) {}
        return;
    }

    // ==================== STATS ====================
    if (sub === 'stats') {
        const members = db.all(
            'SELECT username, rank, points, payday_count, is_in_city FROM rp_members WHERE organization = ? AND is_active = 1 ORDER BY rank, username',
            [playerOrgName]
        );
        const onDuty = db.all("SELECT username_lower FROM active_duties WHERE organization = ?", [playerOrgName]);
        const onDutySet = new Set(onDuty.map(d => d.username_lower));
        const budget = db.orgBudgets.get(playerOrgKey);

        msg(bot, username,
            '&#80C4C5📊 Статистика ' + playerOrgName + '\n' +
            '&#D4D4D4Сотрудников: &#FFB800' + members.length + '\n' +
            '&#D4D4D4На дежурстве: &#76C519' + onDuty.length + '\n' +
            '&#D4D4D4Бюджет: &#76C519' + utils.formatMoney(budget?.budget || 0) + '\n' +
            '&#D4D4D4Материалы: &#76C519' + (budget?.materials || 0)
        );

        if (members.length === 0) {
            msg(bot, username, '&#D4D4D4Нет сотрудников');
        } else if (members.length <= 10) {
            let currentRank = '';
            for (const m of members) {
                if (m.rank !== currentRank) {
                    currentRank = m.rank;
                    const rankCount = members.filter(x => x.rank === currentRank).length;
                    msg(bot, username, '&#FFB800' + currentRank + ' (' + rankCount + '):');
                }
                const dutyIcon = onDutySet.has(m.username.toLowerCase()) ? '🟢' : '⚫';
                const cityIcon = m.is_in_city ? '' : ' [Не в городе]';
                msg(bot, username, '  ' + dutyIcon + ' &#D4D4D4' + m.username + ' — Баллы: ' + (m.points || 0) + cityIcon);
            }
        } else {
            // Группировка по рангам
            const rankGroups = {};
            for (const m of members) {
                if (!rankGroups[m.rank]) rankGroups[m.rank] = [];
                rankGroups[m.rank].push(m);
            }
            for (const [rank, group] of Object.entries(rankGroups)) {
                msg(bot, username, '&#FFB800' + rank + ': &#D4D4D4' + group.length + ' чел.');
            }
        }
        return;
    }

    // ==================== BROADCAST ====================
    if (sub === 'broadcast') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgleader broadcast <сообщение>');
        const message = subArgs.join(' ');

        const members = db.all('SELECT username FROM rp_members WHERE organization = ? AND is_active = 1', [playerOrgName]);
        if (members.length === 0) return msg(bot, username, '&#D4D4D4Нет сотрудников для рассылки');

        let sentCount = 0;
        for (const m of members) {
            try {
                bot.chat('/msg ' + m.username + ' &#FFB800📢 [' + playerOrgName + '] ' + message);
                sentCount++;
            } catch(e) {}
        }

        logger.info(username + ' сделал рассылку в ' + playerOrgName + ': "' + message + '"');
        msg(bot, username, '&#76C519✅ Рассылка отправлена ' + sentCount + '/' + members.length + ' сотрудникам');
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /orgleader <invite|kick|rank|rankinfo|setsalary|paybonus|vacation|duty|warn|unwarn|fine|stats|broadcast>');
}

// ==================== ЭКСПОРТ ====================
module.exports = { leaderManage, checkEmploymentRequirements };