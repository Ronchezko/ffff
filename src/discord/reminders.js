// src/discord/reminders.js — Модуль напоминаний Resistance City v5.0.0
// Напоминания о лицензиях, налогах, событиях
// Автоматическая отправка уведомлений в Discord

'use strict';

const { EmbedBuilder } = require('discord.js');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const utils = require('../shared/utils');

const remindLogger = createLogger('Reminders');

// ==================== КЭШ ОТПРАВЛЕННЫХ НАПОМИНАНИЙ ====================
const sentReminders = new Map();

// ==================== НАПОМИНАНИЯ О ЛИЦЕНЗИЯХ ====================

/**
 * Проверить истекающие лицензии и отправить уведомления
 */
async function checkLicenseReminders(client, db) {
    try {
        const daysThreshold = Math.max(
            config.licenses.business?.renewWarningDays || 2,
            config.licenses.office?.renewWarningDays || 2,
            2
        );

        const expiringLicenses = db.licenses.getExpiringSoon(daysThreshold);

        if (expiringLicenses.length === 0) return;

        remindLogger.info(`Найдено ${expiringLicenses.length} истекающих лицензий`);

        for (const license of expiringLicenses) {
            const reminderKey = `license_${license.username_lower}_${license.license_type}_${license.id}`;

            // Проверка, не отправляли ли уже сегодня
            const lastSent = sentReminders.get(reminderKey);
            const today = new Date().toDateString();
            if (lastSent === today) continue;

            // Поиск Discord пользователя
            const member = db.members.get(license.username);
            if (!member || !member.discord_id || !member.discord_verified) continue;

            try {
                const user = await client.users.fetch(member.discord_id);
                if (!user) continue;

                const licenseNames = {
                    'business': 'Предпринимательская лицензия',
                    'office': 'Лицензия на офис',
                    'medbook': 'Медицинская книжка',
                    'education_advanced': 'Доп. образование',
                };

                const licenseName = licenseNames[license.license_type] || license.license_type;
                const remaining = utils.timeUntil(license.expires_at);
                const isExpired = new Date(license.expires_at) < new Date();

                const embed = new EmbedBuilder()
                    .setColor(isExpired ? '#CA4E4E' : '#FFB800')
                    .setTitle(isExpired ? '⚠ Лицензия истекла!' : '⚠ Лицензия истекает')
                    .setDescription(
                        `**${licenseName}**\n\n` +
                        `${isExpired ? 'Истекла:' : 'Истекает:'} **${utils.formatDate(license.expires_at)}**\n` +
                        `Осталось: **${remaining}**\n\n` +
                        `Продлите в игре: \`/license renew ${license.license_type}\`\n` +
                        `Цена продления: **${utils.formatMoney(getLicensePrice(license.license_type))}**`
                    )
                    .setFooter({ text: 'Resistance City' });

                await user.send({ embeds: [embed] });
                sentReminders.set(reminderKey, today);

                remindLogger.debug(`Напоминание о лицензии отправлено ${license.username} (${license.license_type})`);
            } catch (error) {
                remindLogger.debug(`Не удалось отправить напоминание ${license.username}: ${error.message}`);
            }
        }

        // Очистка старых записей (старше 7 дней)
        const weekAgo = new Date(Date.now() - 7 * 86400000).toDateString();
        for (const [key, date] of sentReminders) {
            if (date < weekAgo) {
                sentReminders.delete(key);
            }
        }
    } catch (error) {
        remindLogger.error(`Ошибка проверки лицензий: ${error.message}`);
    }
}

/**
 * Получить цену лицензии
 */
function getLicensePrice(licenseType) {
    const prices = {
        'business': config.licenses.business?.price || 800000,
        'office': config.licenses.office?.price || 900000,
        'medbook': config.licenses.medicalBook?.price || 5000,
        'education_advanced': config.licenses.educationAdvanced?.price || 50000,
    };
    return prices[licenseType] || 0;
}

// ==================== НАПОМИНАНИЯ О НАЛОГАХ ====================

async function checkTaxReminders(client, db) {
    try {
        const properties = db.properties.getAll();
        const now = new Date();

        for (const prop of properties) {
            if (!prop.is_owned || !prop.owner) continue;
            if (!prop.tax_paid_until) continue;

            const taxDate = new Date(prop.tax_paid_until);
            const daysUntilExpiry = Math.ceil((taxDate - now) / 86400000);

            // Уведомление за 2 дня до истечения
            if (daysUntilExpiry <= 2 && daysUntilExpiry >= 0) {
                const reminderKey = `tax_${prop.owner_lower}_${prop.property_id}_${taxDate.toDateString()}`;
                const lastSent = sentReminders.get(reminderKey);
                const today = now.toDateString();
                if (lastSent === today) continue;

                const member = db.members.get(prop.owner);
                if (!member || !member.discord_id || !member.discord_verified) continue;

                try {
                    const user = await client.users.fetch(member.discord_id);
                    if (!user) continue;

                    const propConfig = config.getPropertyInfo(prop.property_id);
                    const weeklyTax = propConfig ? Math.floor(propConfig.price * (config.economy.taxRate || 0.01)) : 0;

                    const embed = new EmbedBuilder()
                        .setColor(daysUntilExpiry === 0 ? '#CA4E4E' : '#FFB800')
                        .setTitle(daysUntilExpiry === 0 ? '⚠ Налог истекает сегодня!' : '⚠ Скоро налог')
                        .setDescription(
                            `Имущество: **#${prop.property_id}**\n\n` +
                            `Налог оплачен до: **${utils.formatDate(prop.tax_paid_until)}**\n` +
                            `Осталось дней: **${daysUntilExpiry}**\n` +
                            `Сумма налога: **${utils.formatMoney(weeklyTax)}**/нед\n\n` +
                            `Оплатите в игре: \`/im nalog dep ${prop.property_id} ${weeklyTax}\``
                        );

                    await user.send({ embeds: [embed] });
                    sentReminders.set(reminderKey, today);
                } catch (error) {}
            }

            // Если налог истёк — уведомление раз в 3 дня
            if (daysUntilExpiry < 0) {
                const reminderKey = `tax_expired_${prop.owner_lower}_${prop.property_id}`;
                const lastSent = sentReminders.get(reminderKey);
                const threeDaysAgo = new Date(now - 3 * 86400000).toDateString();
                if (lastSent && lastSent > threeDaysAgo) continue;

                const member = db.members.get(prop.owner);
                if (!member || !member.discord_id) continue;

                try {
                    const user = await client.users.fetch(member.discord_id);
                    if (!user) continue;

                    const embed = new EmbedBuilder()
                        .setColor('#CA4E4E')
                        .setTitle('🚫 Налог просрочен!')
                        .setDescription(
                            `Имущество: **#${prop.property_id}**\n` +
                            `Налог не оплачен уже **${Math.abs(daysUntilExpiry)}** дней!\n\n` +
                            'Срочно оплатите налог, чтобы избежать проблем!'
                        );

                    await user.send({ embeds: [embed] });
                    sentReminders.set(reminderKey, now.toDateString());
                } catch (error) {}
            }
        }
    } catch (error) {
        remindLogger.error(`Ошибка проверки налогов: ${error.message}`);
    }
}

// ==================== НАПОМИНАНИЯ О КРЕДИТАХ ====================

async function checkCreditReminders(client, db) {
    try {
        const bankAccounts = db.all(
            'SELECT * FROM bank_accounts WHERE credit_amount > 0 AND is_active = 1'
        );

        for (const account of bankAccounts) {
            if (!account.credit_due_date) continue;

            const dueDate = new Date(account.credit_due_date);
            const daysUntilDue = Math.ceil((dueDate - Date.now()) / 86400000);

            if (daysUntilDue <= 5 && daysUntilDue >= 0) {
                const reminderKey = `credit_${account.username_lower}_${dueDate.toDateString()}`;
                const today = new Date().toDateString();
                const lastSent = sentReminders.get(reminderKey);
                if (lastSent === today) continue;

                const member = db.members.get(account.username);
                if (!member || !member.discord_id) continue;

                try {
                    const user = await client.users.fetch(member.discord_id);
                    if (!user) continue;

                    const embed = new EmbedBuilder()
                        .setColor(daysUntilDue <= 1 ? '#CA4E4E' : '#FFB800')
                        .setTitle(daysUntilDue <= 1 ? '⚠ Кредит нужно погасить!' : 'Напоминание о кредите')
                        .setDescription(
                            `Сумма кредита: **${utils.formatMoney(account.credit_amount)}**\n` +
                            `Дата погашения: **${utils.formatDate(account.credit_due_date)}**\n` +
                            `Осталось дней: **${daysUntilDue}**`
                        );

                    await user.send({ embeds: [embed] });
                    sentReminders.set(reminderKey, today);
                } catch (error) {}
            }
        }
    } catch (error) {
        remindLogger.error(`Ошибка проверки кредитов: ${error.message}`);
    }
}

// ==================== ЗАПУСК ПЕРИОДИЧЕСКИХ ЗАДАЧ ====================

let intervals = [];

function startPeriodicReminders(client, db) {
    remindLogger.info('Запуск системы напоминаний...');

    // Проверка каждые 30 минут
    const interval = setInterval(async () => {
        await checkLicenseReminders(client, db);
        await checkTaxReminders(client, db);
        await checkCreditReminders(client, db);
    }, 1800000); // 30 минут

    intervals.push(interval);

    // Первая проверка через 1 минуту после запуска
    setTimeout(async () => {
        await checkLicenseReminders(client, db);
        await checkTaxReminders(client, db);
        await checkCreditReminders(client, db);
    }, 60000);

    remindLogger.success('Система напоминаний запущена');
}

function stopPeriodicReminders() {
    for (const interval of intervals) {
        clearInterval(interval);
    }
    intervals = [];
    remindLogger.info('Система напоминаний остановлена');
}

// ==================== РУЧНАЯ ОТПРАВКА ====================

async function sendCustomReminder(client, db, username, message, type = 'info') {
    const member = db.members.get(username);
    if (!member || !member.discord_id || !member.discord_verified) {
        return { success: false, reason: 'no_discord' };
    }

    try {
        const user = await client.users.fetch(member.discord_id);
        if (!user) return { success: false, reason: 'user_not_found' };

        const colors = {
            'info': '#80C4C5',
            'warning': '#FFB800',
            'danger': '#CA4E4E',
            'success': '#76C519',
        };

        const embed = new EmbedBuilder()
            .setColor(colors[type] || colors.info)
            .setTitle('📢 Уведомление Resistance')
            .setDescription(message)
            .setTimestamp();

        await user.send({ embeds: [embed] });
        return { success: true };
    } catch (error) {
        return { success: false, reason: error.message };
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    checkLicenseReminders,
    checkTaxReminders,
    checkCreditReminders,
    startPeriodicReminders,
    stopPeriodicReminders,
    sendCustomReminder,
};