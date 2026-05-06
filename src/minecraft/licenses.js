// src/minecraft/licenses.js — Модуль управления лицензиями Resistance City v5.0.0
// Покупка, проверка, продление лицензий всех типов
// Интеграция с экономикой и Discord-уведомлениями

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;

// ==================== ТИПЫ ЛИЦЕНЗИЙ ====================
const LICENSE_TYPES = {
    business: {
        name: 'Предпринимательская лицензия',
        description: 'Необходима для покупки и владения бизнесом. Без неё полиция выписывает крупные штрафы.',
        price: config.licenses.business.price,
        durationDays: config.licenses.business.durationDays,
        renewWarningDays: config.licenses.business.renewWarningDays,
        emoji: '🏪',
        requirements: ['Быть участником RP', 'Не иметь активной лицензии этого типа'],
    },
    office: {
        name: 'Лицензия на офис',
        description: 'Необходима для покупки и владения офисом.',
        price: config.licenses.office.price,
        durationDays: config.licenses.office.durationDays,
        renewWarningDays: config.licenses.office.renewWarningDays,
        emoji: '🏛️',
        requirements: ['Быть участником RP'],
    },
    medbook: {
        name: 'Медицинская книжка',
        description: 'Обязательна для работы в государственных структурах.',
        price: config.licenses.medicalBook.price,
        durationDays: config.licenses.medicalBook.validityDays,
        renewWarningDays: 7,
        emoji: '📋',
        requirements: ['Быть участником RP'],
        specialConditions: 'Врачи больницы получают медкнижку бесплатно при выдаче через /medbook',
    },
    education_advanced: {
        name: 'Дополнительное образование',
        description: 'Даёт преимущество при трудоустройстве (начальный ранг на 1 выше).',
        price: config.licenses.educationAdvanced.price,
        durationDays: 365,
        renewWarningDays: 30,
        emoji: '🎓',
        requirements: ['Быть участником RP', 'Иметь базовое образование'],
    },
};

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
}

// ==================== ПОКУПКА ЛИЦЕНЗИИ ====================

/**
 * Купить лицензию указанного типа
 */
function buyLicense(bot, username, licenseType) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) {
        return { success: false, reason: 'bot_not_connected', message: '&cБот не подключён к серверу' };
    }

    var info = LICENSE_TYPES[licenseType];
    if (!info) {
        var validTypes = Object.keys(LICENSE_TYPES).join(', ');
        return {
            success: false,
            reason: 'invalid_type',
            message: utils.formatError(username, 'Неверный тип лицензии. Доступные: ' + validTypes),
        };
    }

    // Проверка RP-статуса
    var rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.is_active !== 1) {
        return {
            success: false,
            reason: 'not_rp_member',
            message: utils.formatError(username, 'Вы не зарегистрированы в RP! Используйте /rp'),
        };
    }

    // Проверка существующей лицензии
    var hasActive = db.licenses.hasActive(username, licenseType);
    if (hasActive) {
        var activeLicenses = db.licenses.getActive(username);
        var existing = null;
        for (var i = 0; i < activeLicenses.length; i++) {
            if (activeLicenses[i].license_type === licenseType) {
                existing = activeLicenses[i];
                break;
            }
        }

        var remaining = existing ? utils.timeUntil(existing.expires_at) : 'неизвестно';

        return {
            success: false,
            reason: 'already_active',
            message: utils.formatError(username,
                'У вас уже есть активная лицензия: ' + info.name + '\n' +
                'Истекает: ' + (existing ? utils.formatDate(existing.expires_at) : '—') + '\n' +
                'Осталось: ' + remaining + '\n' +
                'Для продления используйте /license renew ' + licenseType
            ),
        };
    }

    // Проверка требований
    var requirementsCheck = checkLicenseRequirements(username, licenseType);
    if (!requirementsCheck.passed) {
        return {
            success: false,
            reason: 'requirements_not_met',
            message: utils.formatError(username, requirementsCheck.message),
        };
    }

    // Расчёт цены (специальные условия)
    var finalPrice = info.price;

    if (licenseType === 'medbook') {
        var inHospital = permissions.isInOrganization(username, 'hospital', db);
        if (inHospital) {
            var rank = rpMember.rank || '';
            if (rank === 'Врач' || rank === 'Главный врач' || rank === 'Фельдшер') {
                finalPrice = 0;
            }
        }
    }

    // Проверка баланса
    if (rpMember.balance < finalPrice) {
        return {
            success: false,
            reason: 'insufficient_funds',
            message: utils.formatError(username,
                'Недостаточно средств!\n' +
                'Цена: ' + utils.formatMoney(finalPrice) + '\n' +
                'Ваш баланс: ' + utils.formatMoney(rpMember.balance) + '\n' +
                'Не хватает: ' + utils.formatMoney(finalPrice - rpMember.balance)
            ),
        };
    }

    // Списываем деньги
    var buyResult = db.rpMembers.updateBalance(username, -finalPrice,
        'license_buy', 'Покупка лицензии: ' + info.name, 'SYSTEM');

    if (!buyResult.success) {
        return {
            success: false,
            reason: 'transaction_failed',
            message: utils.formatError(username, 'Ошибка списания средств'),
        };
    }

    // Создаём лицензию
    var createResult = db.licenses.create(username, licenseType, info.durationDays, finalPrice);

    // Дополнительные действия
    if (licenseType === 'medbook') {
        db.medicalBooks.issue(username, 'SYSTEM', info.durationDays);
    }

    if (licenseType === 'education_advanced') {
        db.education.setAdvanced(username, true);
    }

    var expiryDate = new Date(Date.now() + info.durationDays * 86400000);

    logger.info(username + ' купил лицензию ' + info.name + ' за ' + utils.formatMoney(finalPrice) + ' (' + info.durationDays + ' дн)');

    // Уведомление в ЛС
    try {
        bot.chat('/msg ' + username + ' ' + info.emoji + ' &a✅ Лицензия приобретена!');
        bot.chat('/msg ' + username + ' &f' + info.name);
        bot.chat('/msg ' + username + ' &fСтоимость: &a' + utils.formatMoney(finalPrice));
        bot.chat('/msg ' + username + ' &fСрок действия: &e' + info.durationDays + ' дн');
        bot.chat('/msg ' + username + ' &fИстекает: &e' + utils.formatDate(expiryDate));
    } catch (e) {
        logger.error('Ошибка отправки ЛС: ' + e.message);
    }

    return {
        success: true,
        message: utils.formatSuccess(username,
            info.emoji + ' ' + info.name + ' приобретена!\n' +
            'Стоимость: ' + utils.formatMoney(finalPrice) + '\n' +
            'Срок: ' + info.durationDays + ' дн (до ' + utils.formatDate(expiryDate) + ')'
        ),
        licenseType: licenseType,
        price: finalPrice,
        expiresAt: expiryDate.toISOString(),
    };
}

// ==================== ПРОДЛЕНИЕ ЛИЦЕНЗИИ ====================

function renewLicense(bot, username, licenseType) {
    if (!bot && botInstance) bot = botInstance;

    var info = LICENSE_TYPES[licenseType];
    if (!info) {
        return {
            success: false,
            message: utils.formatError(username, 'Неверный тип лицензии'),
        };
    }

    // Проверка существующей лицензии
    var activeLicenses = db.licenses.getActive(username);
    var existing = null;
    for (var i = 0; i < activeLicenses.length; i++) {
        if (activeLicenses[i].license_type === licenseType) {
            existing = activeLicenses[i];
            break;
        }
    }

    if (!existing) {
        return {
            success: false,
            message: utils.formatError(username,
                'У вас нет активной лицензии этого типа.\n' +
                'Используйте /license buy ' + licenseType + ' для покупки.'
            ),
        };
    }

    // Проверка периода продления
    var expiryDate = new Date(existing.expires_at);
    var renewWindow = info.renewWarningDays * 86400000;
    var canRenewNow = (expiryDate - Date.now()) <= renewWindow;

    if (!canRenewNow && !permissions.isAdmin(username, db)) {
        return {
            success: false,
            message: utils.formatError(username,
                'Продлевать лицензию можно за ' + info.renewWarningDays + ' дн до истечения.\n' +
                'Текущая дата истечения: ' + utils.formatDate(expiryDate)
            ),
        };
    }

    // Проверка баланса
    var rpMember = db.rpMembers.get(username);
    var finalPrice = info.price;

    if (licenseType === 'medbook') {
        var inHospital = permissions.isInOrganization(username, 'hospital', db);
        if (inHospital) {
            var rank = rpMember.rank || '';
            if (rank === 'Врач' || rank === 'Главный врач' || rank === 'Фельдшер') {
                finalPrice = 0;
            }
        }
    }

    if (rpMember && rpMember.balance < finalPrice) {
        return {
            success: false,
            message: utils.formatError(username, 'Недостаточно средств! Цена: ' + utils.formatMoney(finalPrice)),
        };
    }

    // Списываем деньги
    db.rpMembers.updateBalance(username, -finalPrice, 'license_renew',
        'Продление лицензии: ' + info.name, 'SYSTEM');

    // Деактивируем старую
    db.run('UPDATE licenses SET is_active = 0 WHERE id = ?', [existing.id]);

    // Создаём новую
    var startDate = new Date(Math.max(Date.now(), expiryDate.getTime()));
    var newExpiryDate = new Date(startDate.getTime() + info.durationDays * 86400000);
    db.licenses.create(username, licenseType, info.durationDays, finalPrice);

    if (licenseType === 'medbook') {
        db.medicalBooks.issue(username, 'SYSTEM', info.durationDays);
    }

    logger.info(username + ' продлил лицензию ' + info.name + ' за ' + utils.formatMoney(finalPrice));

    return {
        success: true,
        message: utils.formatSuccess(username,
            info.emoji + ' Лицензия продлена!\n' +
            'Новый срок: до ' + utils.formatDate(newExpiryDate) + '\n' +
            'Стоимость: ' + utils.formatMoney(finalPrice)
        ),
    };
}

// ==================== ПРОВЕРКА ЛИЦЕНЗИЙ ====================

function checkLicenses(bot, username, licenseType) {
    if (licenseType) {
        return checkSpecificLicense(username, licenseType);
    }
    return checkAllLicenses(username);
}

function checkAllLicenses(username) {
    var activeLicenses = db.licenses.getActive(username);

    if (activeLicenses.length === 0) {
        return {
            success: true,
            message: utils.formatInfo(username,
                '📋 У вас нет активных лицензий\n\n' +
                'Доступные для покупки:\n' +
                Object.keys(LICENSE_TYPES).map(function(t) {
                    return '  ' + LICENSE_TYPES[t].emoji + ' ' + t + ' — ' + utils.formatMoney(LICENSE_TYPES[t].price);
                }).join('\n') + '\n\n' +
                'Купить: /license buy <тип>'
            ),
            licenses: [],
        };
    }

    // Сортируем: сначала истекающие
    activeLicenses.sort(function(a, b) {
        var aExpiring = isLicenseExpiringSoon(a) ? 0 : 1;
        var bExpiring = isLicenseExpiringSoon(b) ? 0 : 1;
        if (aExpiring !== bExpiring) return aExpiring - bExpiring;
        return new Date(a.expires_at) - new Date(b.expires_at);
    });

    var msg = '📋 Ваши лицензии (' + activeLicenses.length + '):\n\n';

    for (var i = 0; i < activeLicenses.length; i++) {
        var lic = activeLicenses[i];
        var info = LICENSE_TYPES[lic.license_type];
        var name = info ? info.name : lic.license_type;
        var emoji = info ? info.emoji : '📄';
        var remaining = utils.timeUntil(lic.expires_at);
        var isExpiring = isLicenseExpiringSoon(lic);

        msg += emoji + ' ' + (isExpiring ? '⚠ ' : '') + name + '\n';
        msg += '  Истекает: ' + utils.formatDate(lic.expires_at) + ' (' + remaining + ')\n';
        if (isExpiring) {
            msg += '  ⚠ Требуется продление! /license renew ' + lic.license_type + '\n';
        }
        msg += '\n';
    }

    msg += 'Управление: /license <buy|renew|check> [тип]';

    return {
        success: true,
        message: utils.formatInfo(username, msg),
        licenses: activeLicenses,
    };
}

function checkSpecificLicense(username, licenseType) {
    var info = LICENSE_TYPES[licenseType];
    if (!info) {
        return { success: false, message: utils.formatError(username, 'Неверный тип лицензии') };
    }

    var hasActive = db.licenses.hasActive(username, licenseType);

    if (hasActive) {
        var activeLicenses = db.licenses.getActive(username);
        var license = null;
        for (var i = 0; i < activeLicenses.length; i++) {
            if (activeLicenses[i].license_type === licenseType) {
                license = activeLicenses[i];
                break;
            }
        }

        if (license) {
            var remaining = utils.timeUntil(license.expires_at);
            var isExpiring = isLicenseExpiringSoon(license);

            var msg = info.emoji + ' ' + info.name + ': АКТИВНА\n';
            msg += 'Истекает: ' + utils.formatDate(license.expires_at) + '\n';
            msg += 'Осталось: ' + remaining + '\n';

            if (isExpiring) {
                msg += '⚠ Требуется продление! /license renew ' + licenseType + '\n';
            }

            return {
                success: true,
                message: utils.formatInfo(username, msg),
                license: license,
            };
        }
    }

    return {
        success: true,
        message: utils.formatInfo(username,
            info.emoji + ' ' + info.name + ': ОТСУТСТВУЕТ\n\n' +
            info.description + '\n\n' +
            'Цена: ' + utils.formatMoney(info.price) + '\n' +
            'Срок: ' + info.durationDays + ' дн\n\n' +
            'Купить: /license buy ' + licenseType
        ),
    };
}

// ==================== ПРОВЕРКА ИСТЕКАЮЩИХ ЛИЦЕНЗИЙ ====================

function checkExpiringLicenses(bot) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) return;

    try {
        var maxWarningDays = Math.max(
            config.licenses.business.renewWarningDays || 2,
            config.licenses.office.renewWarningDays || 2,
            7
        );

        var expiringLicenses = db.licenses.getExpiringSoon(maxWarningDays);

        for (var i = 0; i < expiringLicenses.length; i++) {
            var license = expiringLicenses[i];
            var info = LICENSE_TYPES[license.license_type];
            if (!info) continue;

            var remaining = utils.timeUntil(license.expires_at);
            var isExpired = new Date(license.expires_at) < new Date();

            var member = db.members.get(license.username);
            if (member && member.discord_id && member.discord_verified) {
                if (process.send) {
                    process.send({
                        type: 'discord_log',
                        channel: 'economy',
                        data: {
                            type: 'license_expiring',
                            username: license.username,
                            licenseType: license.license_type,
                            expiresAt: license.expires_at,
                            remaining: remaining,
                        },
                    });
                }
            }

            // Уведомление в игре
            try {
                var msg = '&e⚠ ' + info.emoji + ' ' + info.name + ' ';
                msg += isExpired ? '&cИСТЕКЛА!' : 'истекает через ' + remaining;
                msg += ' &fПродлите: /license renew ' + license.license_type;

                bot.chat('/msg ' + license.username + ' ' + msg);
            } catch (e) {
                logger.error('Ошибка уведомления о лицензии: ' + e.message);
            }

            logger.debug('Лицензия ' + license.license_type + ' у ' + license.username + ': ' + remaining);
        }
    } catch (error) {
        logger.error('Ошибка проверки лицензий: ' + error.message);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function checkLicenseRequirements(username, licenseType) {
    var failed = [];

    if (licenseType === 'education_advanced') {
        if (!permissions.hasEducation(username, db)) {
            failed.push('❌ Отсутствует базовое образование (получите в Академии)');
        }
    }

    if (failed.length > 0) {
        return {
            passed: false,
            message: 'Не выполнены требования:\n' + failed.join('\n'),
        };
    }

    return { passed: true };
}

function isLicenseExpiringSoon(license) {
    if (!license || !license.expires_at) return false;
    var info = LICENSE_TYPES[license.license_type];
    if (!info) return false;
    var expiry = new Date(license.expires_at);
    var renewWindow = info.renewWarningDays * 86400000;
    return (expiry - Date.now()) <= renewWindow;
}

function getLicenseInfo(licenseType) {
    return LICENSE_TYPES[licenseType] || null;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    buyLicense,
    renewLicense,
    checkLicenses,
    checkAllLicenses,
    checkSpecificLicense,
    checkExpiringLicenses,
    checkLicenseRequirements,
    isLicenseExpiringSoon,
    getLicenseInfo,
    LICENSE_TYPES,
};