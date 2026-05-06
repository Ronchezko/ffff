// src/minecraft/commands/license.js — Управление лицензиями Resistance City v5.0.0
// /license, /lic — покупка, проверка, продление, информация, список
// Полный код с проверками требований, специальными ценами, уведомлениями

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

// ==================== ТИПЫ ЛИЦЕНЗИЙ ====================
const LICENSE_TYPES = {
    business: {
        name: 'Предпринимательская лицензия',
        description: 'Необходима для покупки и владения бизнесом. Без неё полиция выписывает крупные штрафы.',
        price: config.licenses.business.price,
        durationDays: config.licenses.business.durationDays,
        renewWarningDays: config.licenses.business.renewWarningDays || 2,
        emoji: '🏪',
        requirements: ['Быть участником RP'],
        commands: ['/biz'],
    },
    office: {
        name: 'Лицензия на офис',
        description: 'Необходима для покупки и владения офисом с возможностью прокачки.',
        price: config.licenses.office.price,
        durationDays: config.licenses.office.durationDays,
        renewWarningDays: config.licenses.office.renewWarningDays || 2,
        emoji: '🏛️',
        requirements: ['Быть участником RP'],
        commands: ['/office'],
    },
    medbook: {
        name: 'Медицинская книжка',
        description: 'Обязательна для работы в государственных структурах. Врачи больницы получают бесплатно.',
        price: config.licenses.medicalBook.price,
        durationDays: config.licenses.medicalBook.validityDays,
        renewWarningDays: 7,
        emoji: '📋',
        requirements: ['Быть участником RP'],
        specialNote: 'Врачи, Главный врач и Фельдшер получают медкнижку бесплатно при выдаче через больницу.',
    },
    education_advanced: {
        name: 'Дополнительное образование',
        description: 'Даёт преимущество при трудоустройстве — начальный ранг на 1 выше. Требуется базовое образование.',
        price: config.licenses.educationAdvanced.price,
        durationDays: 365,
        renewWarningDays: 30,
        emoji: '🎓',
        requirements: ['Быть участником RP', 'Иметь базовое образование'],
    },
};

// ==================== /LICENSE (/LIC) ====================
function licenseManage(bot, username, args, source) {
    // Без аргументов — показать меню
    if (args.length < 1) {
        return showLicenseMenu(bot, username);
    }

    const subCommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subCommand) {
        case 'buy': return buyLicense(bot, username, subArgs);
        case 'check': return checkLicenses(bot, username, subArgs);
        case 'renew': return renewLicense(bot, username, subArgs);
        case 'info': return showLicenseInfo(bot, username, subArgs);
        case 'list': return showLicenseList(bot, username);
        case 'price': return showLicensePrice(bot, username, subArgs);
        default:
            return msg(bot, username, '&#CA4E4E❌ /license <buy|check|renew|info|list|price> [тип]');
    }
}

// ==================== МЕНЮ ЛИЦЕНЗИЙ ====================
function showLicenseMenu(bot, username) {
    const activeLicenses = db.licenses.getActive(username);
    const rpMember = db.rpMembers.get(username);

    if (!rpMember || rpMember.is_active !== 1) {
        return msg(bot, username, '&#CA4E4E❌ Вы не в RP. Используйте &#FFB800/rp &#CA4E4Eдля регистрации.');
    }

    // Активные лицензии
    if (activeLicenses.length > 0) {
        msg(bot, username, '&#80C4C5📋 Ваши лицензии (' + activeLicenses.length + '):');
        for (const lic of activeLicenses) {
            const info = LICENSE_TYPES[lic.license_type];
            const remaining = utils.timeUntil(lic.expires_at);
            const isExpiring = (new Date(lic.expires_at) - Date.now()) < (info?.renewWarningDays || 2) * 86400000;

            let line = (info?.emoji || '📄') + ' ';
            line += isExpiring ? '&#FFB800⚠ ' : '&#76C519';
            line += (info?.name || lic.license_type) + ' &#D4D4D4| До: ' + utils.formatDate(lic.expires_at) + ' &#D4D4D4| ' + remaining;
            msg(bot, username, line);
        }
    } else {
        msg(bot, username, '&#D4D4D4У вас нет активных лицензий.');
    }

    // Доступные для покупки
    msg(bot, username, '&#80C4C5🛒 Доступные лицензии:');
    for (const [key, info] of Object.entries(LICENSE_TYPES)) {
        const hasActive = activeLicenses.some(l => l.license_type === key);
        const status = hasActive ? '&#76C519(активна)' : '&#D4D4D4(доступна)';
        msg(bot, username,
            info.emoji + ' &#FFB800' + key + ' &#D4D4D4— ' + utils.formatMoney(info.price) +
            ' &#D4D4D4| ' + info.durationDays + 'дн ' + status
        );
    }

    msg(bot, username, '&#D4D4D4Купить: &#FFB800/license buy <тип> &#D4D4D4| Проверить: &#FFB800/license check');
}

// ==================== ПОКУПКА ЛИЦЕНЗИИ ====================
function buyLicense(bot, username, args) {
    if (args.length < 1) {
        return msg(bot, username, '&#CA4E4E❌ Укажите тип: /license buy <business|office|medbook|education_advanced>');
    }

    const licenseType = args[0].toLowerCase();
    const info = LICENSE_TYPES[licenseType];

    if (!info) {
        const validTypes = Object.keys(LICENSE_TYPES).join(', ');
        return msg(bot, username, '&#CA4E4E❌ Неверный тип. Доступные: ' + validTypes);
    }

    // Проверка RP-статуса
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.is_active !== 1) {
        return msg(bot, username, '&#CA4E4E❌ Вы не в RP. Используйте /rp для регистрации.');
    }

    // Проверка существующей лицензии
    const hasActive = db.licenses.hasActive(username, licenseType);
    if (hasActive) {
        const activeLicenses = db.licenses.getActive(username);
        const existing = activeLicenses.find(l => l.license_type === licenseType);

        let msg2 = '&#FFB800⚠ У вас уже есть активная лицензия: ' + info.name + '\n';
        msg2 += '&#D4D4D4Истекает: ' + utils.formatDate(existing?.expires_at) + '\n';
        msg2 += '&#D4D4D4Осталось: ' + utils.timeUntil(existing?.expires_at) + '\n';
        msg2 += '&#D4D4D4Для продления: /license renew ' + licenseType;
        return msg(bot, username, msg2);
    }

    // Проверка требований
    if (licenseType === 'education_advanced') {
        const hasEducation = permissions.hasEducation(username, db);
        if (!hasEducation) {
            return msg(bot, username, '&#CA4E4E❌ Требуется базовое образование! Получите его в Академии.');
        }
    }

    // Расчёт цены со специальными условиями
    let finalPrice = info.price;

    if (licenseType === 'medbook') {
        const inHospital = permissions.isInOrganization(username, 'hospital', db);
        const rank = rpMember.rank || '';
        if (inHospital && (rank === 'Врач' || rank === 'Главный врач' || rank === 'Фельдшер')) {
            finalPrice = 0;
        }
    }

    // Проверка баланса
    if (rpMember.balance < finalPrice) {
        return msg(bot, username,
            '&#CA4E4E❌ Недостаточно средств!\n' +
            '&#D4D4D4Цена: &#76C519' + utils.formatMoney(finalPrice) + '\n' +
            '&#D4D4D4Баланс: &#76C519' + utils.formatMoney(rpMember.balance) + '\n' +
            '&#D4D4D4Не хватает: &#CA4E4E' + utils.formatMoney(finalPrice - rpMember.balance)
        );
    }

    // Списываем деньги
    const buyResult = db.rpMembers.updateBalance(username, -finalPrice, 'license_buy',
        'Покупка лицензии: ' + info.name, 'SYSTEM');

    if (!buyResult.success) {
        return msg(bot, username, '&#CA4E4E❌ Ошибка списания средств. Попробуйте позже.');
    }

    // Создаём лицензию
    db.licenses.create(username, licenseType, info.durationDays, finalPrice);

    // Дополнительные действия
    if (licenseType === 'medbook') {
        db.medicalBooks.issue(username, 'SYSTEM', info.durationDays);
    }
    if (licenseType === 'education_advanced') {
        db.education.setAdvanced(username, true);
    }

    const expiryDate = new Date(Date.now() + info.durationDays * 86400000);

    logger.info(username + ' купил лицензию ' + info.name + ' за ' + utils.formatMoney(finalPrice) + ' (' + info.durationDays + ' дн)');

    // Уведомление об успехе
    msg(bot, username,
        info.emoji + ' &#76C519✅ Лицензия приобретена!\n' +
        '&#FFB800' + info.name + '\n' +
        '&#D4D4D4Стоимость: &#76C519' + utils.formatMoney(finalPrice) + '\n' +
        '&#D4D4D4Срок: &#76C519' + info.durationDays + ' дн\n' +
        '&#D4D4D4Истекает: &#76C519' + utils.formatDate(expiryDate)
    );

    if (info.commands && info.commands.length > 0) {
        msg(bot, username, '&#D4D4D4Доступные команды: &#FFB800' + info.commands.join(', '));
    }
}

// ==================== ПРОВЕРКА ЛИЦЕНЗИЙ ====================
function checkLicenses(bot, username, args) {
    const checkType = args[0]?.toLowerCase();

    // Проверка конкретной лицензии
    if (checkType && LICENSE_TYPES[checkType]) {
        return checkSpecificLicense(bot, username, checkType);
    }

    // Проверка всех лицензий
    const activeLicenses = db.licenses.getActive(username);

    if (activeLicenses.length === 0) {
        return msg(bot, username,
            '&#D4D4D4У вас нет активных лицензий.\n' +
            '&#D4D4D4Доступные: /license buy <business|office|medbook|education_advanced>'
        );
    }

    // Сортируем: сначала истекающие
    const sorted = [...activeLicenses].sort((a, b) => {
        const aExp = (new Date(a.expires_at) - Date.now()) < 3 * 86400000 ? 0 : 1;
        const bExp = (new Date(b.expires_at) - Date.now()) < 3 * 86400000 ? 0 : 1;
        if (aExp !== bExp) return aExp - bExp;
        return new Date(a.expires_at) - new Date(b.expires_at);
    });

    msg(bot, username, '&#80C4C5📋 Ваши лицензии (' + sorted.length + '):');

    for (const lic of sorted) {
        const info = LICENSE_TYPES[lic.license_type];
        const remaining = utils.timeUntil(lic.expires_at);
        const isExpiring = (new Date(lic.expires_at) - Date.now()) < (info?.renewWarningDays || 2) * 86400000;

        msg(bot, username,
            (info?.emoji || '📄') + ' ' +
            (isExpiring ? '&#FFB800⚠ ' : '&#76C519') +
            (info?.name || lic.license_type) +
            ' &#D4D4D4| До: ' + utils.formatDate(lic.expires_at) +
            ' &#D4D4D4| Осталось: ' + remaining
        );

        if (isExpiring) {
            msg(bot, username, '&#FFB800  ⚠ Требуется продление! /license renew ' + lic.license_type);
        }
    }

    // Неактивные типы
    const activeTypes = activeLicenses.map(l => l.license_type);
    const missingTypes = Object.keys(LICENSE_TYPES).filter(t => !activeTypes.includes(t));

    if (missingTypes.length > 0) {
        let missingText = '&#D4D4D4Отсутствуют: ';
        missingText += missingTypes.map(t => LICENSE_TYPES[t].emoji + ' &#FFB800' + t).join(' &#D4D4D4| ');
        msg(bot, username, missingText);
    }
}

function checkSpecificLicense(bot, username, licenseType) {
    const info = LICENSE_TYPES[licenseType];
    const hasActive = db.licenses.hasActive(username, licenseType);

    if (hasActive) {
        const activeLicenses = db.licenses.getActive(username);
        const license = activeLicenses.find(l => l.license_type === licenseType);

        if (license) {
            const remaining = utils.timeUntil(license.expires_at);
            const isExpiring = (new Date(license.expires_at) - Date.now()) < (info.renewWarningDays || 2) * 86400000;

            msg(bot, username,
                info.emoji + ' &#76C519✅ ' + info.name + ': АКТИВНА\n' +
                '&#D4D4D4Куплена: &#76C519' + utils.formatDate(license.issued_at) + '\n' +
                '&#D4D4D4Цена: &#76C519' + utils.formatMoney(license.price) + '\n' +
                '&#D4D4D4Истекает: ' + (isExpiring ? '&#FFB800' : '&#76C519') + utils.formatDate(license.expires_at) + '\n' +
                '&#D4D4D4Осталось: ' + (isExpiring ? '&#FFB800' : '&#76C519') + remaining +
                (isExpiring ? '\n&#FFB800⚠ Продлите: /license renew ' + licenseType : '')
            );
        }
    } else {
        msg(bot, username,
            info.emoji + ' &#CA4E4E❌ ' + info.name + ': ОТСУТСТВУЕТ\n\n' +
            '&#D4D4D4' + info.description + '\n\n' +
            '&#D4D4D4Цена: &#76C519' + utils.formatMoney(info.price) + '\n' +
            '&#D4D4D4Срок: &#76C519' + info.durationDays + ' дн\n\n' +
            '&#D4D4D4Купить: &#FFB800/license buy ' + licenseType
        );
    }
}

// ==================== ПРОДЛЕНИЕ ЛИЦЕНЗИИ ====================
function renewLicense(bot, username, args) {
    if (args.length < 1) {
        // Показать лицензии доступные для продления
        const activeLicenses = db.licenses.getActive(username);
        const expiring = activeLicenses.filter(l => {
            const info = LICENSE_TYPES[l.license_type];
            if (!info) return false;
            return (new Date(l.expires_at) - Date.now()) < (info.renewWarningDays || 3) * 86400000;
        });

        if (expiring.length === 0) {
            return msg(bot, username, '&#D4D4D4Нет лицензий для продления. Используйте /license check.');
        }

        msg(bot, username, '&#80C4C5🔄 Можно продлить (' + expiring.length + '):');
        for (const lic of expiring) {
            const info = LICENSE_TYPES[lic.license_type];
            msg(bot, username,
                '&#FFB800' + (info?.name || lic.license_type) +
                ' &#D4D4D4| До: ' + utils.formatDate(lic.expires_at) +
                ' &#D4D4D4| Цена: &#76C519' + utils.formatMoney(info?.price || 0) +
                ' &#D4D4D4| /license renew ' + lic.license_type
            );
        }
        return;
    }

    const licenseType = args[0].toLowerCase();
    const info = LICENSE_TYPES[licenseType];

    if (!info) {
        return msg(bot, username, '&#CA4E4E❌ Неверный тип. Доступные: ' + Object.keys(LICENSE_TYPES).join(', '));
    }

    // Проверка существующей лицензии
    const activeLicenses = db.licenses.getActive(username);
    const existing = activeLicenses.find(l => l.license_type === licenseType);

    if (!existing) {
        return msg(bot, username,
            '&#CA4E4E❌ У вас нет активной лицензии этого типа.\n' +
            '&#D4D4D4Купите новую: /license buy ' + licenseType
        );
    }

    // Проверка периода продления
    const expiryDate = new Date(existing.expires_at);
    const renewWindow = (info.renewWarningDays || 2) * 86400000;
    const canRenewNow = (expiryDate - Date.now()) <= renewWindow;

    if (!canRenewNow && !permissions.isAdmin(username, db)) {
        const remaining = utils.timeUntil(new Date(expiryDate - renewWindow));
        return msg(bot, username,
            '&#CA4E4E❌ Продлевать можно за ' + (info.renewWarningDays || 2) + ' дн до истечения.\n' +
            '&#D4D4D4До начала периода продления: ' + remaining + '\n' +
            '&#D4D4D4Дата истечения: ' + utils.formatDate(expiryDate)
        );
    }

    // Проверка баланса
    const rpMember = db.rpMembers.get(username);
    let finalPrice = info.price;

    if (licenseType === 'medbook') {
        const inHospital = permissions.isInOrganization(username, 'hospital', db);
        const rank = rpMember?.rank || '';
        if (inHospital && (rank === 'Врач' || rank === 'Главный врач' || rank === 'Фельдшер')) {
            finalPrice = 0;
        }
    }

    if (!rpMember || rpMember.balance < finalPrice) {
        return msg(bot, username,
            '&#CA4E4E❌ Недостаточно средств!\n' +
            '&#D4D4D4Цена: &#76C519' + utils.formatMoney(finalPrice) + '\n' +
            '&#D4D4D4Баланс: &#76C519' + utils.formatMoney(rpMember?.balance || 0)
        );
    }

    // Списываем деньги
    db.rpMembers.updateBalance(username, -finalPrice, 'license_renew',
        'Продление лицензии: ' + info.name, 'SYSTEM');

    // Деактивируем старую
    db.run('UPDATE licenses SET is_active = 0 WHERE id = ?', [existing.id]);

    // Создаём новую
    const startDate = new Date(Math.max(Date.now(), expiryDate.getTime()));
    const newExpiryDate = new Date(startDate.getTime() + info.durationDays * 86400000);
    db.licenses.create(username, licenseType, info.durationDays, finalPrice);

    if (licenseType === 'medbook') {
        db.medicalBooks.issue(username, 'SYSTEM', info.durationDays);
    }

    logger.info(username + ' продлил лицензию ' + info.name + ' за ' + utils.formatMoney(finalPrice));

    msg(bot, username,
        info.emoji + ' &#76C519✅ Лицензия продлена!\n' +
        '&#FFB800' + info.name + '\n' +
        '&#D4D4D4Стоимость: &#76C519' + utils.formatMoney(finalPrice) + '\n' +
        '&#D4D4D4Новый срок: до &#76C519' + utils.formatDate(newExpiryDate) + '\n' +
        '&#D4D4D4Продлена на: &#76C519' + info.durationDays + ' дн'
    );
}

// ==================== ИНФОРМАЦИЯ О ЛИЦЕНЗИИ ====================
function showLicenseInfo(bot, username, args) {
    if (args.length < 1) {
        return msg(bot, username, '&#CA4E4E❌ /license info <business|office|medbook|education_advanced>');
    }

    const infoType = args[0].toLowerCase();
    const info = LICENSE_TYPES[infoType];

    if (!info) {
        return msg(bot, username, '&#CA4E4E❌ Неверный тип. Доступные: ' + Object.keys(LICENSE_TYPES).join(', '));
    }

    // Проверка требований для пользователя
    let reqStatus = '';
    const rpMember = db.rpMembers.get(username);

    if (infoType === 'education_advanced') {
        const hasBasic = rpMember && permissions.hasEducation(username, db);
        reqStatus = hasBasic ? '&#76C519✅ Базовое образование: есть' : '&#CA4E4E❌ Базовое образование: отсутствует';
    }

    if (infoType === 'medbook') {
        const inHospital = rpMember && permissions.isInOrganization(username, 'hospital', db);
        const rank = rpMember?.rank || '';
        if (inHospital && (rank === 'Врач' || rank === 'Главный врач' || rank === 'Фельдшер')) {
            reqStatus = '&#76C519✅ Вы врач — медкнижка бесплатно!';
        }
    }

    const hasActive = db.licenses.hasActive(username, infoType);

    msg(bot, username,
        info.emoji + ' &#80C4C5' + info.name + '\n' +
        '&#D4D4D4' + info.description + '\n\n' +
        '&#FFB800Стоимость: &#76C519' + utils.formatMoney(info.price) + '\n' +
        '&#FFB800Срок: &#76C519' + info.durationDays + ' дн\n' +
        '&#FFB800Статус: ' + (hasActive ? '&#76C519Активна' : '&#CA4E4EНе куплена')
    );

    if (reqStatus) {
        msg(bot, username, reqStatus);
    }

    if (info.specialNote) {
        msg(bot, username, '&#80C4C5💡 ' + info.specialNote);
    }
}

// ==================== СПИСОК ВСЕХ ЛИЦЕНЗИЙ ====================
function showLicenseList(bot, username) {
    const rpMember = db.rpMembers.get(username);
    const balance = rpMember?.balance || 0;

    msg(bot, username,
        '&#80C4C5📋 Все лицензии Resistance\n' +
        '&#D4D4D4Ваш баланс: &#76C519' + utils.formatMoney(balance)
    );

    for (const [key, info] of Object.entries(LICENSE_TYPES)) {
        const hasActive = db.licenses.hasActive(username, key);
        const canAfford = balance >= info.price;

        msg(bot, username,
            info.emoji + ' &#FFB800' + info.name + ' (' + key + ')\n' +
            '&#D4D4D4  ' + info.description + '\n' +
            '&#D4D4D4  Цена: ' + (canAfford ? '&#76C519' : '&#CA4E4E') + utils.formatMoney(info.price) +
            ' &#D4D4D4| Срок: ' + info.durationDays + ' дн' +
            ' &#D4D4D4| ' + (hasActive ? '&#76C519Активна' : '&#D4D4D4Не куплена')
        );
    }

    msg(bot, username,
        '&#D4D4D4Купить: &#FFB800/license buy <тип>\n' +
        '&#D4D4D4Проверить: &#FFB800/license check\n' +
        '&#D4D4D4Продлить: &#FFB800/license renew <тип>'
    );
}

// ==================== ЦЕНА ЛИЦЕНЗИИ ====================
function showLicensePrice(bot, username, args) {
    if (args.length < 1) {
        let prices = '&#80C4C5💰 Цены на лицензии:\n';
        for (const [key, info] of Object.entries(LICENSE_TYPES)) {
            prices += '&#FFB800' + key + ' &#D4D4D4— ' + utils.formatMoney(info.price) + ' (' + info.durationDays + ' дн)\n';
        }
        return msg(bot, username, prices);
    }

    const priceType = args[0].toLowerCase();
    const info = LICENSE_TYPES[priceType];

    if (!info) {
        return msg(bot, username, '&#CA4E4E❌ Неверный тип. ' + Object.keys(LICENSE_TYPES).join(', '));
    }

    msg(bot, username,
        info.emoji + ' &#FFB800' + info.name + '\n' +
        '&#D4D4D4Цена: &#76C519' + utils.formatMoney(info.price) + '\n' +
        '&#D4D4D4Срок: &#76C519' + info.durationDays + ' дн\n' +
        '&#D4D4D4Купить: /license buy ' + priceType
    );
}

// ==================== ЭКСПОРТ ====================
module.exports = { licenseManage };