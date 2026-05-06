// src/minecraft/commands/ministry.js — Команды министров и мэра Resistance City v5.0.0
// /tax, /budget, /grant, /crime, /bonus, /materials, /freezeorg, /citystats, /orgstatus

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

function msg(bot, user, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/msg ' + user + ' ' + text); } catch(e) {}
}
function cc(bot, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/cc ' + text); } catch(e) {}
}

function checkMinistryAccess(username, role) {
    if (permissions.isAdmin(username, db)) return true;
    if (permissions.isMayor(username, db)) return true;
    if (role === 'minister' || role === 'any') return permissions.isMinister(username, db);
    return false;
}

// ==================== /TAX ====================
function taxManage(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'minister')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр экономики или мэр');
    }

    if (args.length < 1) {
        const pt = db.settings.getNumber('economy_tax_rate') || 0.01;
        const it = db.settings.getNumber('payday_tax_rate') || 0.01;
        const bt = db.settings.getNumber('business_tax_rate') || 0.02;
        const tt = db.settings.getNumber('transfer_tax_rate') || 0;

        msg(bot, username,
            '&#80C4C5💰 Налоговая система Resistance\n' +
            '&#D4D4D4══════════════════════\n' +
            '&#D4D4D4На имущество: &#FFB800' + (pt * 100).toFixed(1) + '%\n' +
            '&#D4D4D4Подоходный: &#FFB800' + (it * 100).toFixed(1) + '%\n' +
            '&#D4D4D4На бизнес: &#FFB800' + (bt * 100).toFixed(1) + '%\n' +
            '&#D4D4D4На переводы: &#FFB800' + (tt * 100).toFixed(1) + '%\n\n' +
            '&#D4D4D4Изменить: &#FFB800/tax set <тип> <ставка_%>\n' +
            '&#D4D4D4Список: &#FFB800/tax list\n' +
            '&#D4D4D4Статистика: &#FFB800/tax stats'
        );
        return;
    }

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // ==================== TAX SET ====================
    if (sub === 'set') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /tax set <property|income|business|transfer> <ставка_%>');

        const taxType = subArgs[0].toLowerCase();
        const rate = parseFloat(subArgs[1]);

        if (isNaN(rate) || rate < 0 || rate > 50) return msg(bot, username, '&#CA4E4E❌ Ставка должна быть от 0 до 50%');

        const settingsMap = {
            property: 'economy_tax_rate',
            income: 'payday_tax_rate',
            business: 'business_tax_rate',
            transfer: 'transfer_tax_rate'
        };

        const namesMap = {
            property: 'на имущество',
            income: 'подоходный',
            business: 'на бизнес',
            transfer: 'на переводы'
        };

        if (!settingsMap[taxType]) {
            return msg(bot, username, '&#CA4E4E❌ Неверный тип. Доступные: property, income, business, transfer');
        }

        const rateDecimal = rate / 100;
        db.settings.set(settingsMap[taxType], String(rateDecimal));

        logger.warn(username + ' изменил налог ' + namesMap[taxType] + ': ' + rate + '%');

        msg(bot, username, '&#76C519✅ Налог ' + namesMap[taxType] + ' установлен: &#FFB800' + rate + '%');
        cc(bot, '&#FFB800💰 Ставка налога ' + namesMap[taxType] + ' изменена: ' + rate + '%');
        return;
    }

    // ==================== TAX LIST ====================
    if (sub === 'list') {
        const pt = db.settings.getNumber('economy_tax_rate') || 0.01;
        const it = db.settings.getNumber('payday_tax_rate') || 0.01;
        const bt = db.settings.getNumber('business_tax_rate') || 0.02;
        const tt = db.settings.getNumber('transfer_tax_rate') || 0;

        msg(bot, username,
            '&#80C4C5📋 Текущие налоги:\n' +
            '&#D4D4D4══════════════════════\n' +
            '&#D4D4D4На имущество: &#FFB800' + (pt * 100).toFixed(1) + '%\n' +
            '&#D4D4D4Подоходный: &#FFB800' + (it * 100).toFixed(1) + '%\n' +
            '&#D4D4D4На бизнес: &#FFB800' + (bt * 100).toFixed(1) + '%\n' +
            '&#D4D4D4На переводы: &#FFB800' + (tt * 100).toFixed(1) + '%'
        );
        return;
    }

    // ==================== TAX STATS ====================
    if (sub === 'stats') {
        const propertyTax = db.all("SELECT SUM(ABS(amount)) as t FROM balance_logs WHERE type = 'tax_payment'")[0]?.t || 0;
        const allPaydays = db.all("SELECT SUM(amount) as t FROM balance_logs WHERE type = 'payday'")[0]?.t || 0;
        const incomeTaxRate = db.settings.getNumber('payday_tax_rate') || 0.01;
        const estimatedIncomeTax = Math.floor(Math.abs(allPaydays) * incomeTaxRate);
        const totalFines = db.all("SELECT SUM(amount) as t FROM fines WHERE status = 'paid'")[0]?.t || 0;

        msg(bot, username,
            '&#80C4C5📊 Налоговая статистика:\n' +
            '&#D4D4D4══════════════════════\n' +
            '&#D4D4D4Налог на имущество: &#76C519' + utils.formatMoney(propertyTax) + '\n' +
            '&#D4D4D4Подоходный (примерно): &#76C519' + utils.formatMoney(estimatedIncomeTax) + '\n' +
            '&#D4D4D4Штрафы: &#76C519' + utils.formatMoney(totalFines) + '\n' +
            '&#D4D4D4Всего собрано: &#76C519' + utils.formatMoney(propertyTax + estimatedIncomeTax + totalFines)
        );
        return;
    }

    // ==================== TAX INFO ====================
    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /tax info <property|income|business|transfer>');

        const taxType = subArgs[0].toLowerCase();
        const namesMap = {
            property: 'на имущество',
            income: 'подоходный',
            business: 'на бизнес',
            transfer: 'на переводы'
        };
        const descMap = {
            property: 'Взимается еженедельно с владельцев недвижимости',
            income: 'Взимается с каждой зарплаты (PayDay)',
            business: 'Взимается с дохода бизнесов',
            transfer: 'Взимается с денежных переводов между игроками'
        };
        const settingsMap = {
            property: 'economy_tax_rate',
            income: 'payday_tax_rate',
            business: 'business_tax_rate',
            transfer: 'transfer_tax_rate'
        };

        if (!namesMap[taxType]) return msg(bot, username, '&#CA4E4E❌ Неверный тип. property, income, business, transfer');

        const currentRate = db.settings.getNumber(settingsMap[taxType]) || 0.01;

        msg(bot, username,
            '&#80C4C5💰 Налог ' + namesMap[taxType] + '\n' +
            '&#D4D4D4══════════════════════\n' +
            '&#D4D4D4' + descMap[taxType] + '\n' +
            '&#D4D4D4Текущая ставка: &#FFB800' + (currentRate * 100).toFixed(1) + '%\n' +
            '&#D4D4D4Изменить: &#FFB800/tax set ' + taxType + ' <ставка_%>'
        );
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /tax <set|list|stats|info>');
}

// ==================== /BUDGET ====================
function budgetManage(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'minister')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр, мэр или администратор');
    }

    const isMayorOrAdmin = permissions.isMayor(username, db) || permissions.isAdmin(username, db);

    if (args.length < 1) {
        const allOrgs = db.orgBudgets.getAll();
        let totalBudget = 0;
        let totalMaterials = 0;

        msg(bot, username, '&#80C4C5💰 Бюджет Resistance\n&#D4D4D4══════════════════════');

        for (const org of allOrgs) {
            const employeeCount = db.all(
                'SELECT COUNT(*) as c FROM rp_members WHERE organization = ? AND is_active = 1',
                [org.name]
            )[0]?.c || 0;

            msg(bot, username,
                '&#FFB800' + org.name + '\n' +
                '&#D4D4D4  Бюджет: &#76C519' + utils.formatMoney(org.budget) + '\n' +
                '&#D4D4D4  Материалы: &#76C519' + org.materials + '\n' +
                '&#D4D4D4  Сотрудников: &#76C519' + employeeCount +
                (org.is_frozen ? ' &#CA4E4E[Заморожена]' : '')
            );

            totalBudget += org.budget;
            totalMaterials += org.materials;
        }

        msg(bot, username,
            '&#D4D4D4══════════════════════\n' +
            '&#D4D4D4Общий бюджет: &#76C519' + utils.formatMoney(totalBudget) + '\n' +
            '&#D4D4D4Всего материалов: &#76C519' + totalMaterials + '\n' +
            '&#D4D4D4Управление: &#FFB800/budget <ключ> <set|add|info>'
        );
        return;
    }

    const subArgs = args;

    // ==================== BUDGET INFO ====================
    if (subArgs[0].toLowerCase() === 'info') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /budget info <ключ_организации>');

        const orgKey = subArgs[1].toLowerCase();
        const orgConfig = config.organizations[orgKey];
        if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация. ' + Object.keys(config.organizations).join(', '));

        const budget = db.orgBudgets.get(orgKey);
        const employeeCount = db.all(
            'SELECT COUNT(*) as c FROM rp_members WHERE organization = ? AND is_active = 1',
            [orgConfig.name]
        )[0]?.c || 0;

        msg(bot, username,
            '&#80C4C5💰 ' + orgConfig.name + '\n' +
            '&#D4D4D4Бюджет: &#76C519' + utils.formatMoney(budget?.budget || 0) + '\n' +
            '&#D4D4D4Материалы: &#76C519' + (budget?.materials || 0) + '\n' +
            '&#D4D4D4Сотрудников: &#76C519' + employeeCount + '\n' +
            '&#D4D4D4Статус: ' + (budget?.is_frozen ? '&#CA4E4EЗаморожена' : '&#76C519Активна')
        );
        return;
    }

    // ==================== BUDGET SET/ADD ====================
    if (args.length < 3) return msg(bot, username, '&#CA4E4E❌ /budget <ключ> <set|add> <сумма>');

    const orgKey = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    const amount = parseFloat(args[2]);

    const orgConfig = config.organizations[orgKey];
    if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');

    if (isNaN(amount) || amount < 0) return msg(bot, username, '&#CA4E4E❌ Сумма должна быть ≥ 0');

    if (action === 'set') {
        const current = db.orgBudgets.get(orgKey);
        const diff = amount - (current?.budget || 0);
        db.orgBudgets.updateBudget(orgKey, diff);
        logger.warn(username + ' установил бюджет ' + orgConfig.name + ': ' + utils.formatMoney(amount));
        msg(bot, username, '&#76C519✅ Бюджет ' + orgConfig.name + ': &#FFB800' + utils.formatMoney(amount));
        return;
    }

    if (action === 'add') {
        db.orgBudgets.updateBudget(orgKey, amount);
        logger.info(username + ' пополнил бюджет ' + orgConfig.name + ' на ' + utils.formatMoney(amount));
        msg(bot, username, '&#76C519✅ +' + utils.formatMoney(amount) + ' → ' + orgConfig.name);
        return;
    }

    if (action === 'transfer') {
        if (args.length < 4) return msg(bot, username, '&#CA4E4E❌ /budget transfer <из> <в> <сумма>');
        if (!isMayorOrAdmin) return msg(bot, username, '&#CA4E4E❌ Только мэр или администратор');

        const toKey = args[2].toLowerCase();
        const transferAmount = parseFloat(args[3]);
        const toConfig = config.organizations[toKey];

        if (!toConfig) return msg(bot, username, '&#CA4E4E❌ Неверная целевая организация');
        if (orgKey === toKey) return msg(bot, username, '&#CA4E4E❌ Нельзя перевести в ту же организацию');
        if (isNaN(transferAmount) || transferAmount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма > 0');

        const fromBudget = db.orgBudgets.get(orgKey);
        if (!fromBudget || fromBudget.budget < transferAmount) {
            return msg(bot, username, '&#CA4E4E❌ В ' + orgConfig.name + ' недостаточно средств');
        }

        db.orgBudgets.updateBudget(orgKey, -transferAmount);
        db.orgBudgets.updateBudget(toKey, transferAmount);
        logger.warn(username + ' перевёл ' + utils.formatMoney(transferAmount) + ' из ' + orgConfig.name + ' в ' + toConfig.name);

        msg(bot, username, '&#76C519✅ Перевод ' + utils.formatMoney(transferAmount) + ': ' + orgConfig.name + ' → ' + toConfig.name);
        cc(bot, '&#FFB800💰 Перевод ' + utils.formatMoney(transferAmount) + ': ' + orgConfig.name + ' → ' + toConfig.name);
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /budget <ключ> <set|add|transfer|info>');
}

// ==================== /GRANT ====================
function grantManage(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'minister')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр экономики, мэр или администратор');
    }

    if (args.length < 3) {
        if (args.length === 1 && args[0].toLowerCase() === 'list') {
            const grants = db.all("SELECT * FROM balance_logs WHERE type = 'grant' ORDER BY created_at DESC LIMIT 10");
            if (grants.length === 0) return msg(bot, username, '&#D4D4D4Гранты ещё не выдавались');

            msg(bot, username, '&#80C4C5🎓 Последние гранты:');
            for (const g of grants) {
                msg(bot, username,
                    '&#76C519' + g.username + ' &#D4D4D4— ' + utils.formatMoney(Math.abs(g.amount)) +
                    ' &#D4D4D4| ' + (g.reason || '—') + ' &#D4D4D4| ' + utils.formatDate(g.created_at)
                );
            }
            return;
        }

        if (args.length === 1 && args[0].toLowerCase() === 'total') {
            const total = db.all("SELECT SUM(ABS(amount)) as t FROM balance_logs WHERE type = 'grant'")[0]?.t || 0;
            const count = db.all("SELECT COUNT(*) as c FROM balance_logs WHERE type = 'grant'")[0]?.c || 0;
            msg(bot, username, '&#80C4C5🎓 Выдано грантов: &#FFB800' + count + ' &#D4D4D4на сумму &#76C519' + utils.formatMoney(total));
            return;
        }

        return msg(bot, username, '&#CA4E4E❌ /grant <ник> <сумма> [причина]');
    }

    const target = args[0];
    const amount = parseFloat(args[1]);
    const reason = args.slice(2).join(' ') || 'Грант';

    if (isNaN(amount) || amount <= 0) return msg(bot, username, '&#CA4E4E❌ Сумма гранта должна быть положительной');
    if (amount > 500000 && !permissions.isAdmin(username, db)) {
        return msg(bot, username, '&#CA4E4E❌ Максимальная сумма: 500 000 ₽. Для больших сумм — к администратору.');
    }

    const tm = db.rpMembers.get(target);
    if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не найден в RP');

    const cityBudget = db.orgBudgets.get('government');
    if (!cityBudget || cityBudget.budget < amount) {
        return msg(bot, username, '&#CA4E4E❌ Недостаточно средств в бюджете города!\nДоступно: ' + utils.formatMoney(cityBudget?.budget || 0));
    }

    db.orgBudgets.updateBudget('government', -amount);
    db.rpMembers.updateBalance(target, amount, 'grant', 'Грант: ' + reason, username);

    logger.warn(username + ' выдал грант ' + target + ' на ' + utils.formatMoney(amount) + '. Причина: ' + reason);

    msg(bot, username, '&#76C519✅ Грант ' + utils.formatMoney(amount) + ' выдан ' + target);
    cc(bot, '&#76C519🎓 ' + target + ' получил грант ' + utils.formatMoney(amount) + ' от ' + username);
    try { bot.chat('/msg ' + target + ' &#76C519🎉 Вы получили грант ' + utils.formatMoney(amount) + '! ' + reason); } catch(e) {}
}

// ==================== /CRIME ====================
function crimeStats(bot, username, args, source) {
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.organization !== 'Полиция (МВД)') {
        if (!checkMinistryAccess(username, 'minister')) {
            return msg(bot, username, '&#CA4E4E❌ Только министр МВД, мэр или администратор');
        }
    }

    const sub = args[0]?.toLowerCase() || 'all';

    if (sub === 'fines') {
        const total = db.all('SELECT COUNT(*) as c FROM fines')[0]?.c || 0;
        const pending = db.all("SELECT COUNT(*) as c FROM fines WHERE status = 'pending'")[0]?.c || 0;
        const paid = db.all("SELECT COUNT(*) as c FROM fines WHERE status = 'paid'")[0]?.c || 0;
        const totalSum = db.all('SELECT SUM(amount) as t FROM fines')[0]?.t || 0;
        const unpaidSum = db.all("SELECT SUM(amount) as t FROM fines WHERE status IN ('pending', 'rejected')")[0]?.t || 0;

        msg(bot, username,
            '&#80C4C5🚔 Штрафы:\n' +
            '&#D4D4D4Всего: &#FFB800' + total + '\n' +
            '&#D4D4D4Оплачено: &#76C519' + paid + '\n' +
            '&#D4D4D4Не оплачено: &#CA4E4E' + pending + '\n' +
            '&#D4D4D4Сумма к оплате: &#CA4E4E' + utils.formatMoney(unpaidSum)
        );
        return;
    }

    if (sub === 'jail') {
        const total = db.all('SELECT COUNT(*) as c FROM jail_records')[0]?.c || 0;
        const active = db.all('SELECT COUNT(*) as c FROM jail_records WHERE is_active = 1')[0]?.c || 0;

        msg(bot, username,
            '&#80C4C5🔒 Тюрьма:\n' +
            '&#D4D4D4Всего заключений: &#FFB800' + total + '\n' +
            '&#D4D4D4Сейчас в тюрьме: &#CA4E4E' + active
        );

        if (active > 0 && active <= 10) {
            const prisoners = db.all(
                "SELECT j.username, j.reason, j.jail_end FROM jail_records j WHERE j.is_active = 1"
            );
            for (const p of prisoners) {
                msg(bot, username, '&#CA4E4E' + p.username + ' — ' + p.reason + ' (до ' + utils.formatDate(p.jail_end) + ')');
            }
        }
        return;
    }

    if (sub === 'top') {
        const top = db.all(
            "SELECT username, COUNT(*) as c FROM fines GROUP BY username_lower ORDER BY c DESC LIMIT 10"
        );
        if (top.length === 0) return msg(bot, username, '&#D4D4D4Нет данных');

        msg(bot, username, '&#80C4C5🚔 Топ-10 нарушителей:');
        for (let i = 0; i < top.length; i++) {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
            msg(bot, username, medal + ' &#CA4E4E' + top[i].username + ' &#D4D4D4— ' + top[i].c + ' штрафов');
        }
        return;
    }

    // ALL
    const totalFines = db.all('SELECT COUNT(*) as c FROM fines')[0]?.c || 0;
    const pendingFines = db.all("SELECT COUNT(*) as c FROM fines WHERE status = 'pending'")[0]?.c || 0;
    const totalJail = db.all('SELECT COUNT(*) as c FROM jail_records')[0]?.c || 0;
    const activeJail = db.all('SELECT COUNT(*) as c FROM jail_records WHERE is_active = 1')[0]?.c || 0;
    const unpaidSum = db.all("SELECT SUM(amount) as t FROM fines WHERE status IN ('pending', 'rejected')")[0]?.t || 0;

    msg(bot, username,
        '&#80C4C5🚔 Криминальная статистика\n' +
        '&#D4D4D4Штрафов: &#FFB800' + totalFines + ' &#D4D4D4| Не оплачено: &#CA4E4E' + pendingFines + ' (' + utils.formatMoney(unpaidSum) + ')\n' +
        '&#D4D4D4Тюрьма: всего &#FFB800' + totalJail + ' &#D4D4D4| сейчас &#CA4E4E' + activeJail + '\n' +
        '&#D4D4D4Подробнее: &#FFB800/crime <fines|jail|top>'
    );
}

// ==================== /BONUS ====================
function bonusManage(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'minister')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр, мэр или администратор');
    }

    if (args.length < 2) {
        const allOrgs = db.orgBudgets.getAll();
        msg(bot, username, '&#80C4C5🎁 Бонусы к зарплатам:');
        for (const org of allOrgs) {
            msg(bot, username, '&#FFB800' + org.name + ': &#76C519' + ((org.bonus_percent || 0) * 100).toFixed(0) + '%');
        }
        msg(bot, username, '&#D4D4D4Установить: &#FFB800/bonus <ключ> <процент>');
        return;
    }

    const orgKey = args[0].toLowerCase();
    const percent = parseFloat(args[1]);

    if (isNaN(percent) || percent < 0 || percent > 100) {
        return msg(bot, username, '&#CA4E4E❌ Процент бонуса: 0-100');
    }

    const orgConfig = config.organizations[orgKey];
    if (!orgConfig) {
        return msg(bot, username, '&#CA4E4E❌ Неверная организация. ' + Object.keys(config.organizations).join(', '));
    }

    db.orgBudgets.setBonus(orgKey, percent / 100);
    logger.warn(username + ' установил бонус ' + percent + '% для ' + orgConfig.name);

    msg(bot, username, '&#76C519✅ Бонус ' + orgConfig.name + ': &#FFB800' + percent + '%');
    cc(bot, '&#FFB800🎁 Бонус к ЗП в ' + orgConfig.name + ': ' + percent + '%');
}

// ==================== /MATERIALS ====================
function materialsManage(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'minister')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр обороны, мэр или администратор');
    }

    if (args.length < 3) {
        if (args.length < 1) {
            const allOrgs = db.orgBudgets.getAll();
            msg(bot, username, '&#80C4C5📦 Материалы организаций:');
            for (const org of allOrgs) {
                msg(bot, username, '&#FFB800' + org.name + ': &#76C519' + org.materials);
            }
            msg(bot, username, '&#D4D4D4Изменить: &#FFB800/materials <ключ> <set|add|del> <количество>');
            return;
        }
        return msg(bot, username, '&#CA4E4E❌ /materials <ключ> <set|add|del> <количество>');
    }

    const orgKey = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    const amount = parseInt(args[2]);

    const orgConfig = config.organizations[orgKey];
    if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');
    if (isNaN(amount) || amount < 0) return msg(bot, username, '&#CA4E4E❌ Количество ≥ 0');

    if (action === 'set') {
        const current = db.orgBudgets.get(orgKey);
        const diff = amount - (current?.materials || 0);
        db.orgBudgets.updateMaterials(orgKey, diff);
        logger.warn(username + ' установил материалы ' + orgConfig.name + ': ' + amount);
        msg(bot, username, '&#76C519✅ Материалы ' + orgConfig.name + ': &#FFB800' + amount);
    } else if (action === 'add') {
        db.orgBudgets.updateMaterials(orgKey, amount);
        logger.info(username + ' добавил ' + amount + ' материалов в ' + orgConfig.name);
        msg(bot, username, '&#76C519✅ +' + amount + ' материалов → ' + orgConfig.name);
    } else if (action === 'del') {
        const current = db.orgBudgets.get(orgKey);
        if ((current?.materials || 0) < amount) {
            return msg(bot, username, '&#CA4E4E❌ Недостаточно материалов. Текущие: ' + (current?.materials || 0));
        }
        db.orgBudgets.updateMaterials(orgKey, -amount);
        logger.info(username + ' убрал ' + amount + ' материалов из ' + orgConfig.name);
        msg(bot, username, '&#76C519✅ -' + amount + ' материалов из ' + orgConfig.name);
    } else {
        msg(bot, username, '&#CA4E4E❌ /materials <ключ> <set|add|del>');
    }
}

// ==================== /FREEZEORG ====================
function freezeOrgManage(bot, username, args, source) {
    if (!permissions.isMayor(username, db) && !permissions.isAdmin(username, db)) {
        return msg(bot, username, '&#CA4E4E❌ Только мэр или администратор');
    }

    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ /freezeorg <ключ_организации> <on|off> [причина]');

    const orgKey = args[0].toLowerCase();
    const action = args[1].toLowerCase();
    const reason = args.slice(2).join(' ') || 'Не указана';

    const orgConfig = config.organizations[orgKey];
    if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');

    if (action === 'on') {
        db.orgBudgets.setFrozen(orgKey, true, reason);
        logger.warn(username + ' заморозил организацию ' + orgConfig.name + '. Причина: ' + reason);
        msg(bot, username, '&#76C519✅ ' + orgConfig.name + ' заморожена');
        cc(bot, '&#CA4E4E⚠ Организация ' + orgConfig.name + ' ЗАМОРОЖЕНА! Причина: ' + reason);
    } else if (action === 'off') {
        db.orgBudgets.setFrozen(orgKey, false);
        logger.warn(username + ' разморозил организацию ' + orgConfig.name);
        msg(bot, username, '&#76C519✅ ' + orgConfig.name + ' разморожена');
        cc(bot, '&#76C519✅ Организация ' + orgConfig.name + ' разморожена');
    } else {
        msg(bot, username, '&#CA4E4E❌ /freezeorg <ключ> <on|off>');
    }
}

// ==================== /CITYSTATS ====================
function cityStatsCommand(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'any')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр, мэр или администратор');
    }

    const rpMembers = db.rpMembers.getAll();
    const activeMembers = rpMembers.filter(m => m.is_in_city);
    const orgMembers = rpMembers.filter(m => m.organization);
    const jailed = rpMembers.filter(m => m.is_in_jail);
    const sick = rpMembers.filter(m => m.is_sick);

    const allOrgs = db.orgBudgets.getAll();
    const totalBudget = allOrgs.reduce((s, o) => s + o.budget, 0);
    const totalMaterials = allOrgs.reduce((s, o) => s + o.materials, 0);
    const totalPlayerMoney = rpMembers.reduce((s, m) => s + m.balance + (m.bank_balance || 0), 0);
    const totalProperties = db.properties.getAll().filter(p => p.is_owned).length;

    msg(bot, username,
        '&#80C4C5📊 Статистика Resistance\n' +
        '&#D4D4D4══════════════════════════════\n\n' +
        '&#FFB800👥 Население:\n' +
        '&#D4D4D4  Всего в RP: &#76C519' + rpMembers.length + '\n' +
        '&#D4D4D4  В городе: &#76C519' + activeMembers.length + '\n' +
        '&#D4D4D4  В организациях: &#76C519' + orgMembers.length + '\n' +
        '&#D4D4D4  В тюрьме: &#CA4E4E' + jailed.length + '\n' +
        '&#D4D4D4  Больны: &#FFB800' + sick.length
    );

    msg(bot, username,
        '&#FFB800💰 Экономика:\n' +
        '&#D4D4D4  Бюджет города: &#76C519' + utils.formatMoney(totalBudget) + '\n' +
        '&#D4D4D4  Деньги игроков: &#76C519' + utils.formatMoney(totalPlayerMoney) + '\n' +
        '&#D4D4D4  Всего в экономике: &#76C519' + utils.formatMoney(totalBudget + totalPlayerMoney) + '\n' +
        '&#D4D4D4  Материалы: &#76C519' + totalMaterials
    );

    msg(bot, username,
        '&#FFB800🏠 Недвижимость:\n' +
        '&#D4D4D4  Занято: &#76C519' + totalProperties
    );
}

// ==================== /ORGSTATUS ====================
function orgStatusCommand(bot, username, args, source) {
    if (!checkMinistryAccess(username, 'any')) {
        return msg(bot, username, '&#CA4E4E❌ Только министр, мэр или администратор');
    }

    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /orgstatus <ключ_организации>');

    const orgKey = args[0].toLowerCase();
    const orgConfig = config.organizations[orgKey];
    if (!orgConfig) return msg(bot, username, '&#CA4E4E❌ Неверная организация');

    const budget = db.orgBudgets.get(orgKey);
    const members = db.all(
        'SELECT username, rank FROM rp_members WHERE organization = ? AND is_active = 1 ORDER BY rank, username',
        [orgConfig.name]
    );
    const onDuty = db.all("SELECT username_lower FROM active_duties WHERE organization = ?", [orgConfig.name]);
    const onDutySet = new Set(onDuty.map(d => d.username_lower));

    msg(bot, username,
        '&#80C4C5📊 Статус: ' + orgConfig.name + '\n' +
        '&#D4D4D4══════════════════════\n' +
        '&#D4D4D4Бюджет: &#76C519' + utils.formatMoney(budget?.budget || 0) + '\n' +
        '&#D4D4D4Материалы: &#76C519' + (budget?.materials || 0) + '\n' +
        '&#D4D4D4Бонус: &#76C519' + ((budget?.bonus_percent || 0) * 100).toFixed(0) + '%\n' +
        '&#D4D4D4Статус: ' + (budget?.is_frozen ? '&#CA4E4EЗаморожена' : '&#76C519Активна') + '\n' +
        '&#D4D4D4Сотрудников: &#FFB800' + members.length + '\n' +
        '&#D4D4D4На дежурстве: &#76C519' + onDuty.length
    );

    if (members.length > 0 && members.length <= 15) {
        msg(bot, username, '&#FFB800Состав:');
        let currentRank = '';
        for (const m of members) {
            if (m.rank !== currentRank) {
                currentRank = m.rank;
                const rankCount = members.filter(x => x.rank === currentRank).length;
                msg(bot, username, '&#FFB800  ' + currentRank + ' (' + rankCount + '):');
            }
            const dutyIcon = onDutySet.has(m.username.toLowerCase()) ? '🟢' : '⚫';
            msg(bot, username, '&#D4D4D4    ' + dutyIcon + ' ' + m.username);
        }
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    taxManage,
    budgetManage,
    grantManage,
    crimeStats,
    bonusManage,
    materialsManage,
    freezeOrgManage,
    cityStatsCommand,
    orgStatusCommand,
};