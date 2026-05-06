// src/minecraft/businesses.js — Модуль управления бизнесами Resistance City v5.0.0
// Покупка, управление флагами, налоги, финансовая статистика бизнесов

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
}

// ==================== РЕГИСТРАЦИЯ БИЗНЕСА ====================

/**
 * Зарегистрировать бизнес после покупки имущества типа business
 */
function registerBusiness(username, propertyId) {
    try {
        var property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'business') {
            return { success: false, reason: 'not_a_business' };
        }

        if (property.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        // Проверка лицензии
        var hasLicense = db.licenses.hasActive(username, 'business');
        if (!hasLicense) {
            return { success: false, reason: 'no_license' };
        }

        // Создание записи бизнеса
        var existing = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);
        if (existing) {
            return { success: true, alreadyExists: true };
        }

        var licenseExpires = null;
        var activeLicenses = db.licenses.getActive(username);
        for (var i = 0; i < activeLicenses.length; i++) {
            if (activeLicenses[i].license_type === 'business') {
                licenseExpires = activeLicenses[i].expires_at;
                break;
            }
        }

        db.run(
            'INSERT INTO businesses (property_id, owner, owner_lower, license_expires) VALUES (?, ?, ?, ?)',
            [propertyId, username, username.toLowerCase(), licenseExpires]
        );

        logger.info('Бизнес #' + propertyId + ' зарегистрирован на ' + username);

        return { success: true };
    } catch (error) {
        logger.error('Ошибка регистрации бизнеса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== ПОЛУЧЕНИЕ ИНФОРМАЦИИ О БИЗНЕСЕ ====================

function getBusinessInfo(propertyId) {
    try {
        var business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);
        if (!business) return null;

        var property = db.properties.get(propertyId);

        return {
            propertyId: propertyId,
            owner: business.owner,
            licenseExpires: business.license_expires,
            earningsTotal: business.earnings_total || 0,
            earningsToday: business.earnings_today || 0,
            earningsWeek: business.earnings_week || 0,
            property: property,
        };
    } catch (error) {
        logger.error('Ошибка получения информации о бизнесе: ' + error.message);
        return null;
    }
}

// ==================== УПРАВЛЕНИЕ ФЛАГАМИ ====================

function setBusinessFlag(bot, username, propertyId, flag, value) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) {
        return { success: false, reason: 'bot_not_connected' };
    }

    var validFlags = ['use', 'item-drop', 'chest-access', 'door'];
    if (validFlags.indexOf(flag) === -1) {
        return {
            success: false,
            reason: 'invalid_flag',
            message: utils.formatError(username, 'Неверный флаг. Доступные: ' + validFlags.join(', ')),
        };
    }

    if (value !== 'allow' && value !== 'deny') {
        return {
            success: false,
            reason: 'invalid_value',
            message: utils.formatError(username, 'Значение должно быть allow или deny'),
        };
    }

    var property = db.properties.get(propertyId);
    if (!property || property.property_type !== 'business') {
        return {
            success: false,
            reason: 'not_found',
            message: utils.formatError(username, 'Бизнес #' + propertyId + ' не найден'),
        };
    }

    if (property.owner_lower !== username.toLowerCase()) {
        return {
            success: false,
            reason: 'not_owner',
            message: utils.formatError(username, 'Только владелец может управлять флагами'),
        };
    }

    var regionName = property.region_name || config.clan.regionPrefix + propertyId;
    bot.chat('/rg flag ' + regionName + ' ' + flag + ' ' + value);

    logger.info(username + ' установил флаг бизнеса #' + propertyId + ': ' + flag + '=' + value);

    return {
        success: true,
        message: utils.formatSuccess(username, 'Флаг ' + flag + ' установлен: ' + value),
    };
}

// ==================== НАЛОГИ ====================

function getBusinessTaxInfo(username, propertyId) {
    try {
        var property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'business') {
            return { success: false, reason: 'not_found' };
        }

        if (property.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        var propConfig = config.getPropertyInfo(propertyId);
        if (!propConfig) {
            return { success: false, reason: 'config_not_found' };
        }

        var taxRate = db.settings.getNumber('business_tax_rate') || 0.02;
        var weeklyTax = Math.floor(propConfig.price * taxRate);
        var isExpired = !property.tax_paid_until || new Date(property.tax_paid_until) < new Date();

        return {
            success: true,
            propertyId: propertyId,
            propertyPrice: propConfig.price,
            taxRate: taxRate,
            weeklyTax: weeklyTax,
            taxPaidUntil: property.tax_paid_until,
            isExpired: isExpired,
        };
    } catch (error) {
        logger.error('Ошибка получения налогов бизнеса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

function payBusinessTax(bot, username, propertyId, amount) {
    try {
        var taxInfo = getBusinessTaxInfo(username, propertyId);
        if (!taxInfo.success) {
            return taxInfo;
        }

        if (amount < taxInfo.weeklyTax) {
            return {
                success: false,
                reason: 'insufficient_amount',
                message: utils.formatError(username,
                    'Минимальная сумма: ' + utils.formatMoney(taxInfo.weeklyTax) + '\n' +
                    'Вы указали: ' + utils.formatMoney(amount)
                ),
            };
        }

        var rpMember = db.rpMembers.get(username);
        if (!rpMember || rpMember.balance < amount) {
            return {
                success: false,
                reason: 'insufficient_funds',
                message: utils.formatError(username, 'Недостаточно средств!'),
            };
        }

        // Оплата
        db.rpMembers.updateBalance(username, -amount, 'tax_payment',
            'Оплата налога за бизнес #' + propertyId, 'SYSTEM');

        var newTaxDate = new Date();
        if (taxInfo.taxPaidUntil && new Date(taxInfo.taxPaidUntil) > new Date()) {
            newTaxDate = new Date(taxInfo.taxPaidUntil);
        }
        newTaxDate.setDate(newTaxDate.getDate() + 7);
        db.properties.setTaxPaid(propertyId, newTaxDate.toISOString());

        logger.info(username + ' оплатил налог за бизнес #' + propertyId + ': ' + utils.formatMoney(amount));

        return {
            success: true,
            message: utils.formatSuccess(username,
                'Налог оплачен!\n' +
                'Сумма: ' + utils.formatMoney(amount) + '\n' +
                'Оплачен до: ' + utils.formatDate(newTaxDate)
            ),
        };
    } catch (error) {
        logger.error('Ошибка оплаты налога: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== ФИНАНСОВАЯ СТАТИСТИКА ====================

function getBusinessFinance(username, propertyId, period) {
    try {
        var property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'business') {
            return { success: false, reason: 'not_found' };
        }

        if (property.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        var business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);
        if (!business) {
            return {
                success: true,
                message: utils.formatInfo(username, 'Бизнес #' + propertyId + ': пока нет финансовых данных.'),
            };
        }

        var earnings = 0;
        var periodName = '';

        switch (period) {
            case '1h':
                earnings = (business.earnings_today || 0) / 24;
                periodName = 'за последний час (примерно)';
                break;
            case '1d':
                earnings = business.earnings_today || 0;
                periodName = 'за сегодня';
                break;
            case '1w':
                earnings = business.earnings_week || 0;
                periodName = 'за неделю';
                break;
            case 'all':
                earnings = business.earnings_total || 0;
                periodName = 'за всё время';
                break;
            default:
                return { success: false, reason: 'invalid_period' };
        }

        return {
            success: true,
            message: utils.formatInfo(username,
                '📊 Бизнес #' + propertyId + '\n' +
                'Доход ' + periodName + ': &a' + utils.formatMoney(earnings)
            ),
            earnings: earnings,
            period: period,
        };
    } catch (error) {
        logger.error('Ошибка получения финансов бизнеса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== НАЧИСЛЕНИЕ ДОХОДА БИЗНЕСАМ ====================

function processBusinessEarnings() {
    try {
        var businesses = db.all('SELECT * FROM businesses');
        var updatedCount = 0;

        for (var i = 0; i < businesses.length; i++) {
            var business = businesses[i];

            // Проверка лицензии
            var hasLicense = db.licenses.hasActive(business.owner, 'business');
            if (!hasLicense) continue;

            // Базовый доход в час (зависит от стоимости имущества)
            var property = db.properties.get(business.property_id);
            if (!property) continue;

            var propConfig = config.getPropertyInfo(business.property_id);
            if (!propConfig) continue;

            var hourlyIncome = Math.floor(propConfig.price * 0.0001); // 0.01% в час от стоимости
            if (hourlyIncome < 100) hourlyIncome = 100;

            // Обновление
            db.run(
                'UPDATE businesses SET earnings_total = earnings_total + ?, earnings_today = earnings_today + ?, last_earning_update = CURRENT_TIMESTAMP WHERE id = ?',
                [hourlyIncome, hourlyIncome, business.id]
            );

            updatedCount++;
        }

        if (updatedCount > 0) {
            logger.debug('Начислен доход ' + updatedCount + ' бизнесам');
        }
    } catch (error) {
        logger.error('Ошибка начисления дохода бизнесам: ' + error.message);
    }
}

// ==================== СБРОС ДНЕВНОЙ СТАТИСТИКИ ====================

function resetDailyBusinessStats() {
    try {
        db.run('UPDATE businesses SET earnings_today = 0');
        logger.debug('Дневная статистика бизнесов сброшена');
    } catch (error) {
        logger.error('Ошибка сброса статистики бизнесов: ' + error.message);
    }
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================

function startPeriodicTasks() {
    // Начисление дохода каждый час
    setInterval(function() {
        processBusinessEarnings();
    }, 3600000);

    // Сброс дневной статистики в полночь
    setInterval(function() {
        var now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            resetDailyBusinessStats();
        }
    }, 60000);

    logger.info('Периодические задачи бизнесов запущены');
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    registerBusiness,
    getBusinessInfo,
    setBusinessFlag,
    getBusinessTaxInfo,
    payBusinessTax,
    getBusinessFinance,
    processBusinessEarnings,
    resetDailyBusinessStats,
    startPeriodicTasks,
};