// src/minecraft/commands/org.js — Команды организаций Resistance City v5.0.0
// /org, /o — список организаций, информация, статистика, дежурства
// Команды полиции: /search, /check, /fine, /order
// Команды армии: /tr, /border
// Команды больницы: /redcode, /rc, /heal, /medbook
// Команды академии: /grade, /educate

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

// ==================== /ORG (/O) ====================

function orgManage(bot, username, args, source) {
    if (args.length < 1) {
        return utils.formatUsageError(username,
            '/org <list|info|members|ranks|points|wstatus|duty|balance|my> [аргументы]');
    }

    const subCommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // Проверка RP-статуса
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.is_active !== 1) {
        return utils.formatError(username, 'Вы не зарегистрированы в RP! Используйте /rp');
    }

    switch (subCommand) {

        // ==================== LIST ====================
        case 'list': {
            let msg = `&#80C4C5🏛️ Государственные структуры Resistance:\n`;
            msg += `&#D4D4D4══════════════════════════════\n\n`;

            for (const [key, org] of Object.entries(config.organizations)) {
                const budget = db.orgBudgets.get(key);
                const membersCount = db.all(
                    'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                    [org.name]
                )[0]?.count || 0;

                const isFrozen = budget?.is_frozen || false;

                msg += `&#FFB800${org.name}\n`;
                msg += `&#D4D4D4  Ключ: ${key}\n`;
                msg += `&#D4D4D4  Сотрудников: &#76C519${membersCount}\n`;
                msg += `&#D4D4D4  Бюджет: &#76C519${utils.formatMoney(budget?.budget || org.budget)}\n`;

                if (isFrozen) {
                    msg += `&#CA4E4E  ⚠ ЗАМОРОЖЕНА\n`;
                }

                // Доступные ранги (первые 3)
                const ranks = Object.keys(org.ranks);
                msg += `&#D4D4D4  Ранги: ${ranks.slice(0, 3).join(', ')}`;
                if (ranks.length > 3) msg += `... и ещё ${ranks.length - 3}`;
                msg += `\n\n`;
            }

            msg += `&#D4D4D4Информация: &#FFB800/org info <ключ>\n`;
            msg += `&#D4D4D4Вступить: обратитесь к лидеру организации`;

            return utils.formatInfo(username, msg);
        }

        // ==================== INFO ====================
        case 'info': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/org info <ключ_организации>');
            }

            const orgKey = subArgs[0].toLowerCase();
            const orgConfig = config.organizations[orgKey];

            if (!orgConfig) {
                const validOrgs = Object.keys(config.organizations)
                    .map(k => `${k} (${config.organizations[k].name})`).join(', ');
                return utils.formatError(username, `Неверная организация. Доступные: ${validOrgs}`);
            }

            const budget = db.orgBudgets.get(orgKey);
            const members = db.all(
                'SELECT username, rank FROM rp_members WHERE organization = ? AND is_active = 1 ORDER BY username',
                [orgConfig.name]
            );

            // Группировка по рангам
            const membersByRank = {};
            for (const m of members) {
                if (!membersByRank[m.rank]) membersByRank[m.rank] = [];
                membersByRank[m.rank].push(m.username);
            }

            let msg = `&#80C4C5🏛️ ${orgConfig.name}\n`;
            msg += `&#D4D4D4══════════════════════════════\n\n`;

            msg += `&#FFB800Общая информация:\n`;
            msg += `&#D4D4D4  Бюджет: &#76C519${utils.formatMoney(budget?.budget || orgConfig.budget)}\n`;
            msg += `&#D4D4D4  Материалы: &#76C519${budget?.materials || 0}\n`;
            msg += `&#D4D4D4  Бонус к ЗП: &#76C519${((budget?.bonus_percent || 0) * 100).toFixed(0)}%\n`;
            msg += `&#D4D4D4  Налоговая ставка: &#76C519${((budget?.tax_rate || 0.01) * 100).toFixed(1)}%\n`;
            msg += `&#D4D4D4  Статус: ${budget?.is_frozen ? '&#CA4E4EЗаморожена' : '&#76C519Активна'}\n`;
            msg += `&#D4D4D4  Сотрудников: &#76C519${members.length}\n\n`;

            msg += `&#FFB800Структура рангов:\n`;
            for (const [rank, info] of Object.entries(orgConfig.ranks)) {
                const count = membersByRank[rank]?.length || 0;
                const categoryName = getCategoryName(info.category);
                msg += `&#D4D4D4  ${rank} (${categoryName}) — &#76C519${utils.formatMoney(info.salary)}/час`;
                if (count > 0) msg += ` — ${count} чел.`;
                msg += `\n`;
            }

            if (members.length > 0) {
                msg += `\n&#FFB800Текущий состав:\n`;
                for (const [rank, usernames] of Object.entries(membersByRank)) {
                    msg += `&#D4D4D4  ${rank}: ${usernames.join(', ')}\n`;
                }
            }

            return utils.formatInfo(username, msg);
        }

        // ==================== MEMBERS ====================
        case 'members': {
            const playerOrg = rpMember.organization;
            if (!playerOrg) {
                return utils.formatError(username, 'Вы не состоите в организации');
            }

            const members = db.all(
                'SELECT username, rank FROM rp_members WHERE organization = ? AND is_active = 1 AND is_in_city = 1 ORDER BY rank, username',
                [playerOrg]
            );

            const totalMembers = db.all(
                'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                [playerOrg]
            )[0]?.count || 0;

            let msg = `&#80C4C5👥 ${playerOrg} — онлайн (${members.length}/${totalMembers}):\n`;
            msg += `&#D4D4D4══════════════════════\n`;

            if (members.length === 0) {
                msg += `&#D4D4D4Нет сотрудников в сети`;
            } else {
                let currentRank = '';
                for (const m of members) {
                    if (m.rank !== currentRank) {
                        currentRank = m.rank;
                        msg += `\n&#FFB800${currentRank}:\n`;
                    }
                    msg += `&#D4D4D4  • &#76C519${m.username}\n`;
                }
            }

            return utils.formatInfo(username, msg);
        }

        // ==================== RANKS ====================
        case 'ranks': {
            if (subArgs.length < 1) {
                const playerOrg = rpMember.organization;
                if (!playerOrg) {
                    return utils.formatError(username, 'Вы не состоите в организации. Укажите организацию: /org ranks <ключ> <ранг>');
                }

                // Показываем все ранги организации игрока
                const orgConfig = Object.values(config.organizations).find(o => o.name === playerOrg);
                if (!orgConfig) return utils.formatError(username, 'Организация не найдена');

                let msg = `&#80C4C5Ранги ${playerOrg}:\n`;
                msg += `&#D4D4D4══════════════════════\n`;

                for (const [rank, info] of Object.entries(orgConfig.ranks)) {
                    const count = db.all(
                        'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND rank = ? AND is_active = 1',
                        [playerOrg, rank]
                    )[0]?.count || 0;

                    msg += `&#FFB800${rank}\n`;
                    msg += `&#D4D4D4  Зарплата: &#76C519${utils.formatMoney(info.salary)}/час\n`;
                    msg += `&#D4D4D4  Уровень: ${info.level} | Категория: ${getCategoryName(info.category)}\n`;
                    msg += `&#D4D4D4  Сотрудников: ${count}\n\n`;
                }

                return utils.formatInfo(username, msg);
            }

            // Информация о конкретном ранге
            const orgKey = subArgs[0].toLowerCase();
            const rankName = subArgs.slice(1).join(' ');

            const orgConfig = config.organizations[orgKey];
            if (!orgConfig) {
                return utils.formatError(username, `Неверная организация: ${orgKey}`);
            }

            const rankInfo = orgConfig.ranks[rankName];
            if (!rankInfo) {
                const validRanks = Object.keys(orgConfig.ranks).join(', ');
                return utils.formatError(username,
                    `Неверный ранг. Доступные в ${orgConfig.name}: ${validRanks}`);
            }

            const count = db.all(
                'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND rank = ? AND is_active = 1',
                [orgConfig.name, rankName]
            )[0]?.count || 0;

            let msg = `&#80C4C5Ранг: ${rankName} (${orgConfig.name})\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Зарплата: &#76C519${utils.formatMoney(rankInfo.salary)}/час\n`;
            msg += `&#D4D4D4Уровень: &#76C519${rankInfo.level}\n`;
            msg += `&#D4D4D4Категория: &#76C519${getCategoryName(rankInfo.category)}\n`;
            msg += `&#D4D4D4Сотрудников с этим рангом: &#76C519${count}\n`;

            return utils.formatInfo(username, msg);
        }

        // ==================== POINTS ====================
        case 'points': {
            if (!rpMember.organization) {
                return utils.formatError(username, 'Вы не состоите в организации');
            }

            return utils.formatInfo(username,
                `&#80C4C5⭐ Ваши баллы активности: &#76C519${rpMember.points || 0}\n` +
                `&#D4D4D4Баллы начисляются руководством за активную службу.\n` +
                `&#D4D4D4Используются для повышения в должности.`
            );
        }

        // ==================== WSTATUS ====================
        case 'wstatus': {
            if (!rpMember.organization) {
                return utils.formatError(username, 'Вы не состоите в организации');
            }

            const orgConfig = Object.values(config.organizations).find(o => o.name === rpMember.organization);
            const activeDuty = db.get(
                'SELECT * FROM active_duties WHERE username_lower = ?',
                [username.toLowerCase()]
            );

            let msg = `&#80C4C5📊 Рабочая статистика ${username}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Организация: &#FFB800${rpMember.organization}\n`;
            msg += `&#D4D4D4Ранг: &#76C519${rpMember.rank || 'Нет'}\n`;
            msg += `&#D4D4D4Всего часов: &#76C519${(rpMember.total_hours || 0).toFixed(1)}\n`;
            msg += `&#D4D4D4PayDay'ев: &#76C519${rpMember.payday_count}\n`;

            if (activeDuty) {
                msg += `&#D4D4D4На дежурстве: &#76C519Да (с ${utils.formatDate(activeDuty.started_at)})\n`;
                msg += `&#D4D4D4Минут на дежурстве: &#76C519${(activeDuty.minutes_on_duty || 0).toFixed(0)}\n`;
            } else {
                msg += `&#D4D4D4На дежурстве: &#CA4E4EНет\n`;
                msg += `&#D4D4D4Встаньте на дежурство: &#FFB800/org duty`;
            }

            const balanceLogs = db.all(
                'SELECT * FROM balance_logs WHERE username_lower = ? AND type = ? ORDER BY created_at DESC LIMIT 5',
                [username.toLowerCase(), 'payday']
            );

            if (balanceLogs.length > 0) {
                msg += `\n&#FFB800Последние PayDay:\n`;
                for (const log of balanceLogs) {
                    msg += `&#D4D4D4  ${utils.formatDate(log.created_at)}: &#76C519+${utils.formatMoney(log.amount)}\n`;
                }
            }

            return utils.formatInfo(username, msg);
        }

        // ==================== DUTY ====================
        case 'duty': {
            if (!rpMember.organization) {
                return utils.formatError(username,
                    'Вы не состоите в организации!\n' +
                    'Вступите в организацию через лидера или администратора.'
                );
            }

            // Проверка, не в тюрьме ли
            if (permissions.isInJail(username, db)) {
                return utils.formatError(username, 'Вы находитесь в тюрьме!');
            }

            // Проверка, не болен ли
            if (permissions.isSick(username, db)) {
                return utils.formatError(username,
                    'Вы больны! Посетите больницу для лечения.');
            }

            // Проверка, не в отпуске ли
            const vacation = db.vacations.getActive(username);
            if (vacation) {
                return utils.formatError(username,
                    `Вы в отпуске до ${utils.formatDate(vacation.end_date)}!`);
            }

            // Проверка рабочего времени
            if (!utils.isWorkTime()) {
                if (utils.isRestTime()) {
                    return utils.formatInfo(username,
                        '&#FFB800⏰ Сейчас время отдыха (23:00–14:00).\n' +
                        'Зарплата не начисляется. Вы можете находиться на дежурстве.');
                }
                if (utils.isBreakTime()) {
                    return utils.formatInfo(username,
                        '&#FFB800🍽️ Сейчас перерыв (17:00–18:00).\n' +
                        'Зарплата не начисляется. Вы можете находиться на дежурстве.');
                }
            }

            // Проверка медкнижки
            const hasMedBook = permissions.hasMedicalBook(username, db);
            if (!hasMedBook) {
                return utils.formatError(username,
                    '&#CA4E4EУ вас нет медицинской книжки!\n' +
                    'Медкнижка обязательна для работы в гос. структурах.\n' +
                    'Получите её в больнице или купите: /license buy medbook');
            }

            // Проверка образования
            const hasEducation = permissions.hasEducation(username, db);
            if (!hasEducation) {
                return utils.formatError(username,
                    '&#CA4E4EУ вас нет образования!\n' +
                    'Образование обязательно для работы.\n' +
                    'Получите его в Академии.');
            }

            // Проверка, не на дежурстве ли уже
            const existingDuty = db.get(
                'SELECT * FROM active_duties WHERE username_lower = ?',
                [username.toLowerCase()]
            );

            if (existingDuty) {
                // Уже на дежурстве — снимаем
                db.run('DELETE FROM active_duties WHERE username_lower = ?', [username.toLowerCase()]);

                logger.info(`${username} снялся с дежурства (${rpMember.organization})`);

                return utils.formatInfo(username,
                    `&#FFB800📴 Вы снялись с дежурства.\n` +
                    `&#D4D4D4Отработано минут: ${(existingDuty.minutes_on_duty || 0).toFixed(0)}\n` +
                    `&#D4D4D4Зарплата будет начислена в ближайший PayDay.`
                );
            }

            // Встаём на дежурство
            db.run(
                'INSERT OR REPLACE INTO active_duties (username, username_lower, organization, started_at, minutes_on_duty) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)',
                [username, username.toLowerCase(), rpMember.organization]
            );

            logger.info(`${username} встал на дежурство (${rpMember.organization})`);

            // Уведомление в чат организации (в клановый)
            bot.chat(`/cc &#76C519📋 ${username} (${rpMember.rank || 'Сотрудник'} ${rpMember.organization}) заступил на дежурство`);

            return utils.formatSuccess(username,
                `&#76C519✅ Вы заступили на дежурство!\n` +
                `&#D4D4D4Организация: &#FFB800${rpMember.organization}\n` +
                `&#D4D4D4Ранг: ${rpMember.rank || 'Нет'}\n` +
                `&#D4D4D4Зарплата будет начисляться в PayDay.\n` +
                `&#D4D4D4Для снятия: &#FFB800/org duty`
            );
        }

        // ==================== BALANCE ====================
        case 'balance': {
            if (!rpMember.organization) {
                return utils.formatError(username, 'Вы не состоите в организации');
            }

            const orgConfig = Object.values(config.organizations).find(o => o.name === rpMember.organization);
            if (!orgConfig) return utils.formatError(username, 'Организация не найдена');

            const orgKey = Object.keys(config.organizations).find(k => config.organizations[k].name === rpMember.organization);
            const budget = db.orgBudgets.get(orgKey);

            if (subArgs.length < 1) {
                // Просмотр бюджета
                return utils.formatInfo(username,
                    `&#80C4C5💰 Бюджет ${rpMember.organization}\n` +
                    `&#D4D4D4══════════════════════\n` +
                    `&#D4D4D4Баланс: &#76C519${utils.formatMoney(budget?.budget || 0)}\n` +
                    `&#D4D4D4Материалы: &#76C519${budget?.materials || 0}\n`
                );
            }

            const action = subArgs[0].toLowerCase();

            // Только лидер может пополнять/снимать
            if (!permissions.isOrgLeader(username, db) && !permissions.isMinister(username, db)) {
                return utils.formatError(username,
                    'Только лидер организации или министр может управлять бюджетом');
            }

            if (action === 'deposit' || action === 'dep') {
                if (subArgs.length < 2) {
                    return utils.formatUsageError(username, '/org balance deposit <сумма>');
                }

                const amount = utils.safeParseNumber(subArgs[1], 0);
                if (amount <= 0) return utils.formatError(username, 'Укажите положительную сумму');

                if (rpMember.balance < amount) {
                    return utils.formatError(username, 'Недостаточно личных средств');
                }

                db.rpMembers.updateBalance(username, -amount, 'org_deposit',
                    `Пополнение бюджета ${rpMember.organization}`, 'SYSTEM');
                db.orgBudgets.updateBudget(orgKey, amount);

                logger.info(`${username} пополнил бюджет ${rpMember.organization} на ${utils.formatMoney(amount)}`);

                return utils.formatSuccess(username,
                    `Бюджет пополнен на ${utils.formatMoney(amount)}`);
            }

            if (action === 'withdraw' || action === 'with') {
                if (subArgs.length < 2) {
                    return utils.formatUsageError(username, '/org balance withdraw <сумма>');
                }

                const amount = utils.safeParseNumber(subArgs[1], 0);
                if (amount <= 0) return utils.formatError(username, 'Укажите положительную сумму');

                const currentBudget = budget?.budget || 0;
                if (currentBudget < amount) {
                    return utils.formatError(username,
                        `Недостаточно средств в бюджете! Доступно: ${utils.formatMoney(currentBudget)}`);
                }

                db.orgBudgets.updateBudget(orgKey, -amount);
                db.rpMembers.updateBalance(username, amount, 'org_withdraw',
                    `Снятие из бюджета ${rpMember.organization}`, 'SYSTEM');

                logger.warn(`${username} снял ${utils.formatMoney(amount)} из бюджета ${rpMember.organization}`);

                return utils.formatSuccess(username,
                    `Снято ${utils.formatMoney(amount)} из бюджета`);
            }

            return utils.formatUsageError(username, '/org balance [deposit|withdraw] [сумма]');
        }

        // ==================== MY ====================
        case 'my': {
            if (!rpMember.organization) {
                return utils.formatInfo(username,
                    '&#D4D4D4Вы не состоите в организации.\n' +
                    'Используйте /org list для списка доступных организаций.'
                );
            }

            const orgConfig = Object.values(config.organizations).find(o => o.name === rpMember.organization);
            const rankInfo = orgConfig?.ranks[rpMember.rank || ''];

            let msg = `&#80C4C5Ваша организация:\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Название: &#FFB800${rpMember.organization}\n`;
            msg += `&#D4D4D4Ранг: &#76C519${rpMember.rank || 'Нет'}\n`;

            if (rankInfo) {
                msg += `&#D4D4D4Зарплата: &#76C519${utils.formatMoney(rankInfo.salary)}/час\n`;
                msg += `&#D4D4D4Уровень: &#76C519${rankInfo.level}\n`;
            }

            msg += `&#D4D4D4Баллы: &#76C519${rpMember.points || 0}\n`;
            msg += `&#D4D4D4PayDay'ев: &#76C519${rpMember.payday_count}\n`;

            const activeDuty = db.get(
                'SELECT * FROM active_duties WHERE username_lower = ?',
                [username.toLowerCase()]
            );
            msg += `&#D4D4D4Дежурство: ${activeDuty ? '&#76C519На дежурстве' : '&#CA4E4EНе на дежурстве'}\n`;

            return utils.formatInfo(username, msg);
        }

        default:
            return utils.formatUsageError(username,
                '/org <list|info|members|ranks|points|wstatus|duty|balance|my>');
    }
}

// ==================== КОМАНДЫ ПОЛИЦИИ ====================

function policeSearch(bot, username, args, source) {
    return handlePoliceCommand(bot, username, 'search', args, source);
}

function policeCheck(bot, username, args, source) {
    return handlePoliceCommand(bot, username, 'check', args, source);
}

function policeFine(bot, username, args, source) {
    return handlePoliceCommand(bot, username, 'fine', args, source);
}

function policeOrder(bot, username, args, source) {
    return handlePoliceCommand(bot, username, 'order', args, source);
}

function handlePoliceCommand(bot, username, command, args, source) {
    // Проверка организации
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Полиция (МВД)') {
        return utils.formatError(username, 'Вы не являетесь сотрудником полиции');
    }

    // Проверка прав на команду
    const policeConfig = config.organizations.police;
    const commandConfig = policeConfig.commands[command];
    if (!commandConfig) return utils.formatError(username, 'Неизвестная полицейская команда');

    const accessCheck = permissions.checkOrgCommandAccess(username, `/${command}`, commandConfig.minRank, db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, accessCheck.message?.replace(/&[0-9a-fk-or]/gi, '') || 'Недостаточно прав');
    }

    switch (command) {
        case 'search': {
            if (args.length < 1) return utils.formatUsageError(username, '/search <ник>');
            const target = args[0];

            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                return utils.formatError(username, 'Игрок не найден в RP');
            }

            logger.info(`${username} (полиция) провёл досмотр ${target}`);

            bot.chat(`/msg ${target} &#FFB800⚠ Сотрудник полиции ${username} проводит личный досмотр. Ожидайте.`);

            return utils.formatInfo(username,
                `&#80C4C5🔍 Досмотр: ${target}\n` +
                `&#D4D4D4Баланс: &#76C519${utils.formatMoney(targetMember.balance)}\n` +
                `&#D4D4D4Организация: ${targetMember.organization || 'Нет'}\n` +
                `&#D4D4D4В розыске: проверьте через /check`
            );
        }

        case 'check': {
            if (args.length < 1) return utils.formatUsageError(username, '/check <ник>');
            const target = args[0];

            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                return utils.formatError(username, 'Игрок не найден в RP');
            }

            const fines = db.fines.getAll(target);
            const unpaidFines = fines.filter(f => f.status === 'pending' || f.status === 'rejected');
            const jailRecords = db.all(
                'SELECT * FROM jail_records WHERE username_lower = ? ORDER BY jail_start DESC LIMIT 10',
                [target.toLowerCase()]
            );

            let msg = `&#80C4C5📋 Проверка: ${target}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Штрафов неоплаченных: ${unpaidFines.length > 0 ? `&#CA4E4E${unpaidFines.length}` : '&#76C5190'}\n`;
            msg += `&#D4D4D4Судимостей: ${jailRecords.length > 0 ? `&#CA4E4E${jailRecords.length}` : '&#76C5190'}\n`;

            if (unpaidFines.length > 0) {
                msg += `\n&#CA4E4EНеоплаченные штрафы:\n`;
                for (const f of unpaidFines.slice(0, 5)) {
                    msg += `&#D4D4D4  ${utils.formatMoney(f.amount)} — ${f.reason} (от ${f.issued_by})\n`;
                }
            }

            if (jailRecords.length > 0) {
                msg += `\n&#D4D4D4Последние заключения:\n`;
                for (const j of jailRecords.slice(0, 3)) {
                    msg += `&#D4D4D4  ${utils.formatDate(j.jail_start)} — ${utils.formatDuration(j.duration_minutes)} (${j.reason})\n`;
                }
            }

            return utils.formatInfo(username, msg);
        }

        case 'fine': {
            if (args.length < 2) return utils.formatUsageError(username, '/fine <ник> <сумма> [причина]');
            const target = args[0];
            const amount = utils.safeParseNumber(args[1], 0);
            const reason = args.slice(2).join(' ') || 'Нарушение закона';

            if (amount <= 0) return utils.formatError(username, 'Сумма штрафа должна быть положительной');
            if (amount > 100000) return utils.formatError(username, 'Максимальная сумма штрафа: 100 000 ₽');

            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                return utils.formatError(username, 'Игрок не найден в RP');
            }

            const fine = db.fines.create(target, amount, reason, username);

            if (fine) {
                logger.info(`${username} (полиция) выписал штраф ${target} на ${utils.formatMoney(amount)}`);

                // Уведомление нарушителю
                bot.chat(`/msg ${target} &#FFB800⚠ Вам выписан штраф!\n` +
                    `&#D4D4D4Сумма: ${utils.formatMoney(amount)}\n` +
                    `&#D4D4D4Причина: ${reason}\n` +
                    `&#D4D4D4Сотрудник: ${username}\n\n` +
                    `&#D4D4D4Вы согласны оплатить? Напишите &#76C519да &#D4D4D4или &#CA4E4Eнет &#D4D4D4в ЛС боту.\n` +
                    `&#D4D4D4У вас 1 минута на ответ.`
                );

                // Авто-отклонение через минуту
                setTimeout(() => {
                    const currentFine = db.fines.get(fine.id);
                    if (currentFine && currentFine.status === 'pending') {
                        db.fines.autoExpire(fine.id);
                        try {
                            bot.chat(`/msg ${username} &#FFB800Штраф для ${target} автоматически отклонён (нет ответа).`);
                        } catch (e) {}
                    }
                }, 60000);

                return utils.formatSuccess(username,
                    `Штраф ${utils.formatMoney(amount)} выписан ${target}\n` +
                    `Причина: ${reason}`
                );
            }

            return utils.formatError(username, 'Ошибка выписки штрафа');
        }

        case 'order': {
            if (args.length < 1) return utils.formatUsageError(username, '/order <ник>');
            const target = args[0];

            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                return utils.formatError(username, 'Игрок не найден в RP');
            }

            logger.info(`${username} (полиция) показал ордер игроку ${target}`);

            bot.chat(`/msg ${target} &#FFB800⚠ Сотрудник полиции ${username} предъявляет ордер на досмотр имущества.`);

            return utils.formatSuccess(username,
                `Ордер предъявлен игроку ${target}`
            );
        }

        default:
            return utils.formatError(username, 'Неизвестная полицейская команда');
    }
}

// ==================== КОМАНДЫ АРМИИ ====================

function armyThreatLevel(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Армия') {
        return utils.formatError(username, 'Вы не являетесь военнослужащим');
    }

    if (args.length < 1) {
        // Показать статус
        const currentLevel = db.settings.get('army_threat_level') || 'Нет';
        return utils.formatInfo(username,
            `&#80C4C5🛡️ Уровень тревоги: &#FFB800${currentLevel}\n` +
            `&#D4D4D4Уровни: Альфа (низкий), Бета (средний), Омега (высокий)\n` +
            `&#D4D4D4Изменить: /tr <уровень> (от Капитана)`
        );
    }

    const level = args[0];
    const validLevels = ['Альфа', 'Бета', 'Омега', 'альфа', 'бета', 'омега'];

    if (!validLevels.includes(level)) {
        return utils.formatError(username, 'Неверный уровень. Доступные: Альфа, Бета, Омега');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/tr set', 'Капитан', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только от Капитана и выше');
    }

    const formattedLevel = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
    db.settings.set('army_threat_level', formattedLevel);

    logger.warn(`${username} изменил уровень тревоги на ${formattedLevel}`);

    bot.chat(`/cc &#CA4E4E🛡️ УРОВЕНЬ ТРЕВОГИ: ${formattedLevel}! (${username})`);

    return utils.formatSuccess(username, `Уровень тревоги: ${formattedLevel}`);
}

function armyBorderCheck(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Армия') {
        return utils.formatError(username, 'Вы не являетесь военнослужащим');
    }

    if (args.length < 1) {
        return utils.formatUsageError(username, '/border <ник>');
    }

    const target = args[0];
    const targetMember = db.rpMembers.get(target);

    if (!targetMember || targetMember.is_active !== 1) {
        return utils.formatError(username, 'Игрок не найден в RP');
    }

    logger.info(`${username} (армия) проверил документы ${target}`);

    return utils.formatInfo(username,
        `&#80C4C5🛡️ Проверка: ${target}\n` +
        `&#D4D4D4Паспорт: ${targetMember.is_active ? '&#76C519Действителен' : '&#CA4E4EНедействителен'}\n` +
        `&#D4D4D4Организация: ${targetMember.organization || 'Нет'}\n` +
        `&#D4D4D4Статус: ${targetMember.is_in_city ? '&#76C519В городе' : '&#FFB800Не в городе'}`
    );
}

// ==================== КОМАНДЫ БОЛЬНИЦЫ ====================

function hospitalRedCode(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Больница') {
        return utils.formatError(username, 'Вы не являетесь сотрудником больницы');
    }

    if (args.length < 1) {
        const redCodeActive = db.settings.getBoolean('hospital_red_code');
        return utils.formatInfo(username,
            `&#80C4C5🏥 Красный код: ${redCodeActive ? '&#CA4E4EАКТИВЕН' : '&#76C519Не активен'}\n` +
            `&#D4D4D4Изменить: /redcode on|off (от Врача)`
        );
    }

    const action = args[0].toLowerCase();
    if (action !== 'on' && action !== 'off') {
        return utils.formatUsageError(username, '/redcode <on|off>');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/redcode set', 'Врач', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только от Врача и выше');
    }

    db.settings.set('hospital_red_code', action === 'on' ? 'true' : 'false');

    logger.warn(`${username} ${action === 'on' ? 'активировал' : 'деактивировал'} красный код`);

    bot.chat(`/cc ${action === 'on' ? '&#CA4E4E🚨 КРАСНЫЙ КОД! Всем врачам срочно в больницу!' : '&#76C519✅ Красный код снят'}`);

    return utils.formatSuccess(username,
        `Красный код: ${action === 'on' ? '&#CA4E4EВКЛЮЧЕН' : '&#76C519ВЫКЛЮЧЕН'}`);
}

function hospitalHeal(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Больница') {
        return utils.formatError(username, 'Вы не являетесь сотрудником больницы');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/heal', 'Фельдшер', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только от Фельдшера и выше');
    }

    if (args.length < 1) {
        return utils.formatUsageError(username, '/heal <ник> [free|paid]');
    }

    const target = args[0];
    const treatmentType = args[1]?.toLowerCase() || 'free';

    const targetMember = db.rpMembers.get(target);
    if (!targetMember || targetMember.is_active !== 1) {
        return utils.formatError(username, 'Игрок не найден в RP');
    }

    if (!targetMember.is_sick) {
        return utils.formatError(username, 'Игрок не болен');
    }

    if (treatmentType === 'paid') {
        if (targetMember.balance < config.virus.paidTreatmentCost) {
            return utils.formatError(username,
                `У игрока недостаточно средств! Нужно: ${utils.formatMoney(config.virus.paidTreatmentCost)}`);
        }

        db.rpMembers.updateBalance(target, -config.virus.paidTreatmentCost,
            'medical_treatment', 'Платное лечение', username);
        db.rpMembers.healFromSick(target, 'paid');

        logger.info(`${username} вылечил ${target} (платно)`);

        bot.chat(`/msg ${target} &#76C519✅ Вы вылечены (платное лечение). Списанo: ${utils.formatMoney(config.virus.paidTreatmentCost)}`);

        return utils.formatSuccess(username,
            `${target} вылечен (платно, ${utils.formatMoney(config.virus.paidTreatmentCost)})`);
    }

    // Бесплатное лечение
    db.rpMembers.healFromSick(target, 'free');

    logger.info(`${username} вылечил ${target} (бесплатно, 48ч)`);

    bot.chat(`/msg ${target} &#76C519✅ Вы проходите бесплатное лечение. Выздоровление через 48 часов.`);

    return utils.formatSuccess(username,
        `${target} направлен на бесплатное лечение (48ч)`);
}

function hospitalMedBook(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Больница') {
        return utils.formatError(username, 'Вы не являетесь сотрудником больницы');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/medbook', 'Врач', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только Врач и Главный врач могут выдавать медкнижки');
    }

    if (args.length < 1) {
        return utils.formatUsageError(username, '/medbook <ник>');
    }

    const target = args[0];
    const targetMember = db.rpMembers.get(target);

    if (!targetMember || targetMember.is_active !== 1) {
        return utils.formatError(username, 'Игрок не найден в RP');
    }

    db.medicalBooks.issue(target, username, config.licenses.medicalBook.validityDays);
    db.licenses.create(target, 'medbook', config.licenses.medicalBook.validityDays, 0);

    logger.info(`${username} выдал медкнижку ${target}`);

    bot.chat(`/msg ${target} &#76C519✅ Вам выдана медицинская книжка (врач: ${username})`);

    return utils.formatSuccess(username,
        `Медкнижка выдана ${target} на ${config.licenses.medicalBook.validityDays} дн`);
}

// ==================== КОМАНДЫ АКАДЕМИИ ====================

function academyGrade(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Академия') {
        return utils.formatError(username, 'Вы не являетесь сотрудником Академии');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/grade', 'Преподаватель', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только от Преподавателя и выше');
    }

    if (args.length < 3) {
        return utils.formatUsageError(username, '/grade <ник> <название_курса> <оценка_2-5>');
    }

    const target = args[0];
    const course = args[1];
    const grade = utils.safeParseInt(args[2], -1);

    if (grade < 2 || grade > 5) {
        return utils.formatError(username, 'Оценка должна быть от 2 до 5');
    }

    const targetMember = db.rpMembers.get(target);
    if (!targetMember || targetMember.is_active !== 1) {
        return utils.formatError(username, 'Игрок не найден в RP');
    }

    db.education.addGrade(target, course, grade);

    // Если оценка 3+ и это базовый курс — выдаём базовое образование
    if (grade >= 3 && !permissions.hasEducation(target, db)) {
        db.education.setBasic(target, true);
        logger.info(`${target} получил базовое образование (курс: ${course}, оценка: ${grade})`);
    }

    logger.info(`${username} поставил оценку ${grade} игроку ${target} за курс ${course}`);

    const gradeEmoji = grade === 5 ? '⭐' : grade === 4 ? '✅' : grade === 3 ? '✔️' : '❌';

    bot.chat(`/msg ${target} ${gradeEmoji} Оценка за курс "${course}": ${grade}/5 (преподаватель: ${username})`);

    return utils.formatSuccess(username,
        `Оценка ${grade}/5 выставлена ${target} за курс "${course}"`);
}

function academyEducate(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Академия') {
        return utils.formatError(username, 'Вы не являетесь сотрудником Академии');
    }

    const accessCheck = permissions.checkOrgCommandAccess(username, '/educate', 'Преподаватель', db);
    if (!accessCheck.allowed) {
        return utils.formatError(username, 'Только от Преподавателя и выше');
    }

    if (args.length < 2) {
        return utils.formatUsageError(username, '/educate <ник> <basic|advanced>');
    }

    const target = args[0];
    const eduType = args[1].toLowerCase();

    if (!['basic', 'advanced'].includes(eduType)) {
        return utils.formatUsageError(username, '/educate <ник> <basic|advanced>');
    }

    const targetMember = db.rpMembers.get(target);
    if (!targetMember || targetMember.is_active !== 1) {
        return utils.formatError(username, 'Игрок не найден в RP');
    }

    if (eduType === 'basic') {
        db.education.setBasic(target, true);
        logger.info(`${username} выдал базовое образование ${target}`);

        bot.chat(`/msg ${target} &#76C519✅ Вы получили базовое образование (преподаватель: ${username})`);

        return utils.formatSuccess(username, `Базовое образование выдано ${target}`);
    }

    if (eduType === 'advanced') {
        if (!permissions.hasEducation(target, db)) {
            return utils.formatError(username, 'Игроку нужно сначала получить базовое образование');
        }

        db.education.setAdvanced(target, true);
        db.licenses.create(target, 'education_advanced', 365, 0);

        logger.info(`${username} выдал доп. образование ${target}`);

        bot.chat(`/msg ${target} &#76C519✅ Вы получили дополнительное образование (преподаватель: ${username})`);

        return utils.formatSuccess(username, `Дополнительное образование выдано ${target}`);
    }

    return utils.formatError(username, 'Ошибка');
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function getCategoryName(category) {
    const names = {
        'junior': 'Младший состав',
        'middle': 'Средний состав',
        'senior': 'Старший состав',
        'command': 'Руководство',
    };
    return names[category] || category || 'Не указана';
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    orgManage,
    policeSearch,
    policeCheck,
    policeFine,
    policeOrder,
    armyThreatLevel,
    armyBorderCheck,
    hospitalRedCode,
    hospitalHeal,
    hospitalMedBook,
    academyGrade,
    academyEducate,
};