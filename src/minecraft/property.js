// src/minecraft/commands/property.js — Команды управления имуществом Resistance City v5.0.0
// /im — квартиры, дома, порты
// /biz — бизнесы
// /office, /of — офисы
// Полная система: покупка, продажа, сожители, флаги, налоги, финансы

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== КОНСТАНТЫ ====================
const TYPE_NAMES = {
    'apartment': 'Квартира',
    'house': 'Дом',
    'office': 'Офис',
    'business': 'Бизнес',
    'port': 'Порт',
};

const TYPE_EMOJI = {
    'apartment': '🏢',
    'house': '🏠',
    'office': '🏛️',
    'business': '🏪',
    'port': '🚢',
};

const VALID_FLAGS = ['use', 'item-drop', 'pvp', 'chest-access', 'door', 'build', 'break'];
const VALID_FLAG_VALUES = ['allow', 'deny', 'none'];

// ==================== /IM (ИМУЩЕСТВО: квартиры, дома, порты) ====================

function propertyManage(bot, username, args, source) {
    if (args.length < 1) {
        return utils.formatUsageError(username,
            '/im <buy|sell|info|addm|dellm|flag|nalog|list|my|find|price> [аргументы]');
    }

    const subCommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subCommand) {

        // ==================== BUY ====================
        case 'buy': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/im buy <id_имущества>');
            }

            const propertyId = subArgs[0];

            // Проверка ID
            if (!utils.isValidPropertyId(propertyId)) {
                const suggestions = findNearbyPropertyIds(propertyId);
                let msg = `&#CA4E4EИмущество #${propertyId} не найдено.\n`;
                if (suggestions.length > 0) {
                    msg += `&#D4D4D4Возможно, вы имели в виду: ${suggestions.map(s => `#${s}`).join(', ')}\n`;
                }
                msg += `&#D4D4D4Используйте /im list для просмотра доступного имущества`;
                return utils.formatError(username, msg);
            }

            const propertyConfig = config.getPropertyInfo(propertyId);

            // Проверка, не занято ли
            const existing = db.properties.get(propertyId);
            if (existing && existing.is_owned) {
                return utils.formatError(username,
                    `&#CA4E4EИмущество #${propertyId} уже занято!\n` +
                    `&#D4D4D4Владелец: &#76C519${existing.owner}\n` +
                    `&#D4D4D4Используйте /idim ${propertyId} для подробностей`
                );
            }

            // Проверка, не в тюрьме ли
            const accessCheck = permissions.checkCommandAccess(username, '/im buy', db);
            if (!accessCheck.allowed) {
                return utils.formatError(username, accessCheck.message?.replace(/&[0-9a-fk-or]/gi, '') || 'Недоступно');
            }

            // Проверка RP-статуса
            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.is_active !== 1) {
                return utils.formatError(username, '&#CA4E4EВы не зарегистрированы в RP! Используйте /rp');
            }

            // Проверка баланса
            if (rpMember.balance < propertyConfig.price) {
                const shortage = propertyConfig.price - rpMember.balance;
                return utils.formatError(username,
                    `&#CA4E4EНедостаточно средств!\n` +
                    `&#D4D4D4Цена: &#76C519${utils.formatMoney(propertyConfig.price)}\n` +
                    `&#D4D4D4Ваш баланс: &#76C519${utils.formatMoney(rpMember.balance)}\n` +
                    `&#D4D4D4Не хватает: &#CA4E4E${utils.formatMoney(shortage)}\n\n` +
                    `&#D4D4D4Заработайте деньги или используйте /pay для перевода`
                );
            }

            // Для бизнесов нужна лицензия предпринимателя
            if (propertyConfig.type === 'business') {
                const hasLicense = db.licenses.hasActive(username, 'business');
                if (!hasLicense) {
                    return utils.formatError(username,
                        `&#CA4E4EДля покупки бизнеса нужна предпринимательская лицензия!\n\n` +
                        `&#D4D4D4Купите лицензию: &#FFB800/license buy business\n` +
                        `&#D4D4D4Цена лицензии: ${utils.formatMoney(config.licenses.business.price)}\n` +
                        `&#D4D4D4Срок действия: ${config.licenses.business.durationDays} дн`
                    );
                }
            }

            // Для офисов нужна лицензия на офис
            if (propertyConfig.type === 'office') {
                const hasLicense = db.licenses.hasActive(username, 'office');
                if (!hasLicense) {
                    return utils.formatError(username,
                        `&#CA4E4EДля покупки офиса нужна лицензия!\n\n` +
                        `&#D4D4D4Купите лицензию: &#FFB800/license buy office\n` +
                        `&#D4D4D4Цена лицензии: ${utils.formatMoney(config.licenses.office.price)}\n` +
                        `&#D4D4D4Срок действия: ${config.licenses.office.durationDays} дн`
                    );
                }
            }

            // Проверка лимита имущества (максимум 5 объектов)
            const currentProperties = db.properties.getOwned(username);
            const ownedCount = currentProperties.filter(p => p.owner_lower === username.toLowerCase()).length;
            if (ownedCount >= 5 && !permissions.isAdmin(username, db)) {
                return utils.formatError(username,
                    `&#CA4E4EДостигнут лимит имущества (5 объектов)!\n` +
                    `&#D4D4D4Продайте что-нибудь перед покупкой нового.`
                );
            }

            // Подтверждение покупки (для дорогих объектов)
            if (propertyConfig.price >= 5000000 && source !== 'private_message') {
                return utils.formatInfo(username,
                    `&#FFB800⚠ Подтверждение покупки:\n\n` +
                    `&#D4D4D4Вы собираетесь купить ${TYPE_NAMES[propertyConfig.type] || propertyConfig.type} #${propertyId}\n` +
                    `&#D4D4D4Цена: &#76C519${utils.formatMoney(propertyConfig.price)}\n\n` +
                    `&#D4D4D4Для подтверждения отправьте боту в ЛС: &#FFB800/confirm_buy ${propertyId}\n` +
                    `&#D4D4D4Для отмены просто игнорируйте это сообщение (таймаут 60с)`
                );
                // Сохраняем ожидание подтверждения
                if (!bot._pendingConfirmations) bot._pendingConfirmations = new Map();
                bot._pendingConfirmations.set(`${username.toLowerCase()}_buy_${propertyId}`, {
                    username,
                    propertyId,
                    timestamp: Date.now(),
                    timeout: 60000,
                });
                // Авто-очистка
                setTimeout(() => {
                    bot._pendingConfirmations?.delete(`${username.toLowerCase()}_buy_${propertyId}`);
                }, 60000);
                return;
            }

            // Выполнение покупки
            return executeBuyProperty(bot, username, propertyId, propertyConfig, source);
        }

        // ==================== CONFIRM_BUY (подтверждение в ЛС) ====================
        case 'confirm_buy': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/confirm_buy <id_имущества>');
            }

            const propertyId = subArgs[0];

            if (!bot._pendingConfirmations) {
                return utils.formatError(username, 'Нет ожидающих подтверждений');
            }

            const key = `${username.toLowerCase()}_buy_${propertyId}`;
            const pending = bot._pendingConfirmations.get(key);

            if (!pending) {
                return utils.formatError(username,
                    'Нет ожидающего подтверждения для этого имущества. Используйте /im buy');
            }

            if (Date.now() - pending.timestamp > pending.timeout) {
                bot._pendingConfirmations.delete(key);
                return utils.formatError(username, 'Время подтверждения истекло. Используйте /im buy снова.');
            }

            bot._pendingConfirmations.delete(key);

            const propertyConfig = config.getPropertyInfo(propertyId);
            if (!propertyConfig) {
                return utils.formatError(username, 'Имущество не найдено');
            }

            return executeBuyProperty(bot, username, propertyId, propertyConfig, source);
        }

        // ==================== SELL ====================
        case 'sell': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/im sell <id_имущества> [подтверждение]');
            }

            const propertyId = subArgs[0];
            const confirm = subArgs[1]?.toLowerCase();

            const property = db.properties.get(propertyId);
            if (!property || !property.is_owned) {
                return utils.formatError(username, `Имущество #${propertyId} не занято или не существует`);
            }

            // Проверка владельца
            if (property.owner_lower !== username.toLowerCase()) {
                if (property.co_owner_1_lower === username.toLowerCase() ||
                    property.co_owner_2_lower === username.toLowerCase()) {
                    return utils.formatError(username,
                        'Только владелец может продать имущество. Вы — сожитель.\n' +
                        'Используйте /im dellm чтобы выселиться.'
                    );
                }
                return utils.formatError(username, 'Вы не являетесь владельцем этого имущества');
            }

            // Возврат 50% стоимости
            const sellPrice = property.price || config.getPropertyInfo(propertyId)?.price || 0;
            const refundAmount = Math.floor(sellPrice * 0.5);

            // Подтверждение
            if (confirm !== 'confirm' && confirm !== 'yes' && confirm !== 'да') {
                return utils.formatInfo(username,
                    `&#FFB800⚠ Подтверждение продажи:\n\n` +
                    `&#D4D4D4Имущество: ${TYPE_NAMES[property.property_type] || property.property_type} #${propertyId}\n` +
                    `&#D4D4D4Возврат: &#76C519${utils.formatMoney(refundAmount)} (50% от стоимости)\n\n` +
                    `&#CA4E4E⚠ Сожители также потеряют доступ!\n\n` +
                    `&#D4D4D4Для подтверждения: &#FFB800/im sell ${propertyId} confirm`
                );
            }

            // Выполнение продажи
            // Удаление сожителей из региона
            const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;
            if (property.owner) bot.chat(`/rg removemember ${regionName} ${property.owner}`);
            if (property.co_owner_1) bot.chat(`/rg removemember ${regionName} ${property.co_owner_1}`);
            if (property.co_owner_2) bot.chat(`/rg removemember ${regionName} ${property.co_owner_2}`);

            // Возврат денег
            db.rpMembers.updateBalance(username, refundAmount,
                'property_sell', `Продажа имущества #${propertyId} (возврат 50%)`, 'SYSTEM');

            // Удаление из БД
            db.properties.remove(propertyId);

            // Удаление связанных записей (бизнес/офис)
            if (property.property_type === 'business') {
                db.run('DELETE FROM businesses WHERE property_id = ?', [propertyId]);
            }
            if (property.property_type === 'office') {
                db.run('DELETE FROM offices WHERE property_id = ?', [propertyId]);
            }

            // Уведомление сожителям
            if (property.co_owner_1) {
                try { bot.chat(`/msg ${property.co_owner_1} &#CA4E4EИмущество #${propertyId} продано владельцем. Вы выселены.`); } catch (e) {}
            }
            if (property.co_owner_2) {
                try { bot.chat(`/msg ${property.co_owner_2} &#CA4E4EИмущество #${propertyId} продано владельцем. Вы выселены.`); } catch (e) {}
            }

            logger.info(`${username} продал имущество #${propertyId} за ${utils.formatMoney(refundAmount)}`);

            return utils.formatSuccess(username,
                `&#76C519✅ Имущество #${propertyId} продано!\n` +
                `&#D4D4D4Возврат: &#76C519${utils.formatMoney(refundAmount)}`
            );
        }

        // ==================== INFO ====================
        case 'info': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/im info <id_имущества>');
            }

            const propertyId = subArgs[0];
            return showPropertyInfo(bot, username, propertyId, source);
        }

        // ==================== ADDM (добавить сожителя) ====================
        case 'addm': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username, '/im addm <id_имущества> <ник>');
            }

            const propertyId = subArgs[0];
            const target = subArgs[1];

            const property = db.properties.get(propertyId);
            if (!property || !property.is_owned) {
                return utils.formatError(username, `Имущество #${propertyId} не занято`);
            }

            // Проверка владельца
            if (property.owner_lower !== username.toLowerCase()) {
                return utils.formatError(username, 'Только владелец может добавлять сожителей');
            }

            // Проверка типа (только квартиры и дома)
            if (property.property_type !== 'apartment' && property.property_type !== 'house') {
                return utils.formatError(username,
                    `Сожителей можно добавлять только в квартиры и дома.\n` +
                    `Тип этого имущества: ${TYPE_NAMES[property.property_type] || property.property_type}`
                );
            }

            // Нельзя добавить себя
            if (target.toLowerCase() === username.toLowerCase()) {
                return utils.formatError(username, 'Вы уже являетесь владельцем');
            }

            // Проверка цели
            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                return utils.formatError(username,
                    `Игрок ${target} не зарегистрирован в RP. Попросите его использовать /rp`);
            }

            const targetClanMember = db.members.get(target);
            if (!targetClanMember || targetClanMember.is_in_clan !== 1) {
                return utils.formatError(username,
                    `Игрок ${target} не состоит в клане Resistance`);
            }

            // Проверка, не в тюрьме ли цель
            if (targetMember.is_in_jail) {
                return utils.formatError(username,
                    `Игрок ${target} находится в тюрьме`);
            }

            // Проверка, не сожитель ли уже
            if (property.co_owner_1_lower === target.toLowerCase() ||
                property.co_owner_2_lower === target.toLowerCase()) {
                return utils.formatError(username, `${target} уже является сожителем`);
            }

            // Проверка свободных слотов
            if (property.co_owner_1 && property.co_owner_2) {
                return utils.formatError(username,
                    'Нет свободных слотов для сожителей (максимум 2)\n' +
                    `Сожитель 1: ${property.co_owner_1}\n` +
                    `Сожитель 2: ${property.co_owner_2}`
                );
            }

            // Добавление
            const result = db.properties.addCoOwner(propertyId, target);

            if (result.success) {
                const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;
                bot.chat(`/rg addmember ${regionName} ${target}`);

                logger.info(`${username} добавил ${target} как сожителя #${propertyId} (слот ${result.slot})`);

                // Уведомление цели
                try {
                    bot.chat(`/msg ${target} &#76C519✅ ${username} добавил вас как сожителя в имущество #${propertyId}!`);
                    bot.chat(`/msg ${target} &#D4D4D4Используйте /im my для просмотра`);
                } catch (e) {}

                return utils.formatSuccess(username,
                    `&#76C519✅ ${target} добавлен как сожитель (слот ${result.slot})\n` +
                    `&#D4D4D4Имущество: #${propertyId}`
                );
            }

            return utils.formatError(username,
                result.reason === 'no_free_slots' ? 'Нет свободных слотов' :
                result.reason === 'is_owner' ? 'Нельзя добавить владельца' :
                'Ошибка добавления');
        }

        // ==================== DELLM (удалить сожителя) ====================
        case 'dellm': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username, '/im dellm <id_имущества> <ник>');
            }

            const propertyId = subArgs[0];
            const target = subArgs[1];

            const property = db.properties.get(propertyId);
            if (!property || !property.is_owned) {
                return utils.formatError(username, `Имущество #${propertyId} не занято`);
            }

            // Проверка прав: владелец может удалить любого, сожитель — только себя
            const isOwner = property.owner_lower === username.toLowerCase();
            const isSelf = target.toLowerCase() === username.toLowerCase();

            if (!isOwner && !isSelf) {
                return utils.formatError(username, 'Только владелец может удалять других сожителей');
            }

            if (!isOwner && isSelf) {
                // Сожитель выселяется сам
            }

            if (isOwner && property.co_owner_1_lower !== target.toLowerCase() &&
                property.co_owner_2_lower !== target.toLowerCase()) {
                return utils.formatError(username, `${target} не является сожителем этого имущества`);
            }

            const result = db.properties.removeCoOwner(propertyId, target);

            if (result.success) {
                const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;
                bot.chat(`/rg removemember ${regionName} ${target}`);

                logger.info(`${username} удалил ${target} из сожителей #${propertyId}`);

                try {
                    bot.chat(`/msg ${target} &#CA4E4EВы удалены из сожителей имущества #${propertyId}`);
                } catch (e) {}

                return utils.formatSuccess(username,
                    `&#76C519${target} удалён из сожителей`);
            }

            return utils.formatError(username, 'Ошибка удаления');
        }

        // ==================== FLAG ====================
        case 'flag': {
            if (subArgs.length < 3) {
                return utils.formatUsageError(username,
                    '/im flag <id_имущества> <флаг> <allow|deny>\n' +
                    `Доступные флаги: ${VALID_FLAGS.join(', ')}`);
            }

            const propertyId = subArgs[0];
            const flag = subArgs[1].toLowerCase();
            const value = subArgs[2].toLowerCase();

            if (!VALID_FLAGS.includes(flag)) {
                return utils.formatError(username,
                    `Неверный флаг. Доступные: ${VALID_FLAGS.join(', ')}`);
            }

            if (!VALID_FLAG_VALUES.includes(value)) {
                return utils.formatError(username,
                    `Неверное значение. Доступные: ${VALID_FLAG_VALUES.join(', ')}`);
            }

            const property = db.properties.get(propertyId);
            if (!property || !property.is_owned) {
                return utils.formatError(username, `Имущество #${propertyId} не занято`);
            }

            // Проверка прав (владелец или сожитель)
            const isOwner = property.owner_lower === username.toLowerCase();
            const isCoOwner = property.co_owner_1_lower === username.toLowerCase() ||
                              property.co_owner_2_lower === username.toLowerCase();

            if (!isOwner && !isCoOwner) {
                return utils.formatError(username, 'Вы не имеете прав на это имущество');
            }

            // Сожители не могут менять некоторые флаги
            if (!isOwner && ['build', 'break'].includes(flag)) {
                return utils.formatError(username,
                    'Только владелец может менять флаги строительства');
            }

            // Выполнение
            const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;
            bot.chat(`/rg flag ${regionName} ${flag} ${value}`);

            logger.info(`${username} установил флаг ${flag}=${value} на #${propertyId}`);

            return utils.formatSuccess(username,
                `&#76C519Флаг ${flag} установлен: &#FFB800${value}\n` +
                `&#D4D4D4Регион: ${regionName}`
            );
        }

        // ==================== NALOG ====================
        case 'nalog': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username,
                    '/im nalog <info|dep> <id_имущества> [сумма]');
            }

            return handlePropertyTax(bot, username, subArgs, source);
        }

        // ==================== LIST ====================
        case 'list': {
            return showAllProperties(bot, username, subArgs, source);
        }

        // ==================== MY ====================
        case 'my': {
            const properties = db.properties.getOwned(username);

            if (properties.length === 0) {
                return utils.formatInfo(username,
                    `&#80C4C5🔑 У вас нет имущества\n\n` +
                    `&#D4D4D4Купите недвижимость: &#FFB800/im list\n` +
                    `&#D4D4D4Просмотр: &#FFB800/idim <номер>`
                );
            }

            const owned = properties.filter(p => p.owner_lower === username.toLowerCase());
            const coOwned = properties.filter(p => p.owner_lower !== username.toLowerCase());

            let msg = `&#80C4C5🔑 Ваше имущество (${properties.length}):\n`;
            msg += `&#D4D4D4══════════════════════════════\n\n`;

            if (owned.length > 0) {
                msg += `&#FFB800Владения (${owned.length}):\n`;
                for (const prop of owned) {
                    const emoji = TYPE_EMOJI[prop.property_type] || '📍';
                    const typeName = TYPE_NAMES[prop.property_type] || prop.property_type;
                    msg += `${emoji} &#FFB800#${prop.property_id} &#D4D4D4${typeName}`;

                    const taxPaidUntil = prop.tax_paid_until;
                    const taxExpired = !taxPaidUntil || new Date(taxPaidUntil) < new Date();
                    if (taxExpired) {
                        msg += ` &#CA4E4E[Налог!]`;
                    }
                    msg += `\n`;

                    if (prop.co_owner_1 || prop.co_owner_2) {
                        msg += `&#D4D4D4  Сожители: `;
                        const coowners = [];
                        if (prop.co_owner_1) coowners.push(prop.co_owner_1);
                        if (prop.co_owner_2) coowners.push(prop.co_owner_2);
                        msg += coowners.join(', ');
                        msg += `\n`;
                    }
                }
            }

            if (coOwned.length > 0) {
                msg += `\n&#FFB800Сожительство (${coOwned.length}):\n`;
                for (const prop of coOwned) {
                    const emoji = TYPE_EMOJI[prop.property_type] || '📍';
                    const typeName = TYPE_NAMES[prop.property_type] || prop.property_type;
                    msg += `${emoji} &#D4D4D4#${prop.property_id} ${typeName} (владелец: &#76C519${prop.owner}&#D4D4D4)\n`;
                }
            }

            msg += `\n&#D4D4D4Управление: &#FFB800/im flag|addm|dellm|nalog`;

            return utils.formatInfo(username, msg);
        }

        // ==================== FIND ====================
        case 'find': {
            let searchType = subArgs[0]?.toLowerCase();
            let maxPrice = subArgs[1] ? utils.safeParseNumber(subArgs[1]) : Infinity;

            const allProperties = db.properties.getAll();
            const allConfigs = Object.entries(config.propertyPrices);

            let filtered = allConfigs.filter(([id, info]) => {
                const prop = allProperties.find(p => p.property_id === id);
                if (prop && prop.is_owned) return false;

                if (searchType && searchType !== 'all') {
                    if (info.type !== searchType) return false;
                }

                if (info.price > maxPrice) return false;

                return true;
            });

            if (filtered.length === 0) {
                return utils.formatInfo(username,
                    `&#D4D4D4Нет свободного имущества по заданным критериям.\n` +
                    `&#D4D4D4Попробуйте другие параметры: /im find [тип] [макс_цена]`
                );
            }

            // Сортировка по цене
            filtered.sort((a, b) => a[1].price - b[1].price);

            let msg = `&#80C4C5🔍 Поиск имущества`;
            if (searchType) msg += ` (тип: ${TYPE_NAMES[searchType] || searchType})`;
            if (maxPrice < Infinity) msg += ` (до ${utils.formatMoney(maxPrice)})`;
            msg += `:\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Найдено: &#76C519${filtered.length}\n\n`;

            for (const [id, info] of filtered.slice(0, 10)) {
                msg += `${TYPE_EMOJI[info.type] || '📍'} &#FFB800#${id} &#D4D4D4${TYPE_NAMES[info.type] || info.type} — &#76C519${utils.formatMoney(info.price)}\n`;
            }

            if (filtered.length > 10) {
                msg += `\n&#D4D4D4... и ещё ${filtered.length - 10}. Уточните параметры поиска.`;
            }

            return utils.formatInfo(username, msg);
        }

        // ==================== PRICE ====================
        case 'price': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/im price <id_имущества>');
            }

            const propertyId = subArgs[0];
            const propConfig = config.getPropertyInfo(propertyId);

            if (!propConfig) {
                return utils.formatError(username, `Имущество #${propertyId} не найдено`);
            }

            const taxRate = config.economy.taxRate;
            const weeklyTax = Math.floor(propConfig.price * taxRate);
            const property = db.properties.get(propertyId);
            const isOccupied = property && property.is_owned;

            let msg = `&#80C4C5💰 Цена имущества #${propertyId}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Тип: &#FFB800${TYPE_NAMES[propConfig.type] || propConfig.type}\n`;
            msg += `&#D4D4D4Цена: &#76C519${utils.formatMoney(propConfig.price)}\n`;
            msg += `&#D4D4D4Налог: &#76C519${utils.formatMoney(weeklyTax)}/неделя (${(taxRate * 100).toFixed(1)}%)\n`;
            msg += `&#D4D4D4Статус: ${isOccupied ? '&#CA4E4EЗанято' : '&#76C519Свободно'}\n`;

            if (!isOccupied) {
                msg += `\n&#D4D4D4Купить: &#FFB800/im buy ${propertyId}`;
            }

            return utils.formatInfo(username, msg);
        }

        default:
            return utils.formatUsageError(username,
                '/im <buy|sell|info|addm|dellm|flag|nalog|list|my|find|price>');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function executeBuyProperty(bot, username, propertyId, propertyConfig, source) {
    // Списываем деньги
    const buyResult = db.rpMembers.updateBalance(username, -propertyConfig.price,
        'property_buy', `Покупка имущества #${propertyId}`, 'SYSTEM');

    if (!buyResult.success) {
        return utils.formatError(username, 'Ошибка списания средств. Попробуйте позже.');
    }

    // Регистрируем в БД
    db.properties.buy(propertyId, username, propertyConfig.price, propertyConfig.type);

    // Добавляем в регион
    const regionName = `${config.clan.regionPrefix}${propertyId}`;
    bot.chat(`/rg addmember ${regionName} ${username}`);

    logger.info(`${username} купил имущество #${propertyId} (${propertyConfig.type}) за ${utils.formatMoney(propertyConfig.price)}`);

    const typeName = TYPE_NAMES[propertyConfig.type] || propertyConfig.type;
    const emoji = TYPE_EMOJI[propertyConfig.type] || '📍';

    return utils.formatSuccess(username,
        `${emoji} &#76C519✅ Поздравляем с покупкой!\n\n` +
        `&#D4D4D4${typeName} #${propertyId} приобритён за &#76C519${utils.formatMoney(propertyConfig.price)}\n` +
        `&#D4D4D4Регион: &#76C519${regionName}\n\n` +
        `&#FFB800📌 Не забудьте:\n` +
        `&#D4D4D4• Оплатить налог: /im nalog dep ${propertyId}\n` +
        `&#D4D4D4• Настроить флаги: /im flag ${propertyId} <флаг> allow|deny\n` +
        `&#D4D4D4• Добавить сожителей: /im addm ${propertyId} <ник>`
    );
}

function showPropertyInfo(bot, username, propertyId, source) {
    const prop = db.properties.get(propertyId);
    const propConfig = config.getPropertyInfo(propertyId);

    if (!propConfig) {
        return utils.formatError(username, `Имущество #${propertyId} не найдено в конфигурации`);
    }

    const typeName = TYPE_NAMES[propConfig.type] || propConfig.type;

    let msg = `&#80C4C5${TYPE_EMOJI[propConfig.type] || '📍'} ${typeName} #${propertyId}\n`;
    msg += `&#D4D4D4══════════════════════════════\n\n`;

    msg += `&#FFB800Основное:\n`;
    msg += `&#D4D4D4  Тип: ${typeName}\n`;
    msg += `&#D4D4D4  Цена: &#76C519${utils.formatMoney(propConfig.price)}\n`;

    if (prop && prop.is_owned) {
        msg += `\n&#FFB800Владение:\n`;
        msg += `&#D4D4D4  Владелец: &#76C519${prop.owner}\n`;
        msg += `&#D4D4D4  Куплено: &#76C519${utils.formatDate(prop.purchased_at)}\n`;

        if (prop.granted_by) {
            msg += `&#D4D4D4  Выдано админом: &#76C519${prop.granted_by}\n`;
        }

        if (prop.co_owner_1) {
            msg += `&#D4D4D4  Сожитель 1: &#76C519${prop.co_owner_1}\n`;
        }
        if (prop.co_owner_2) {
            msg += `&#D4D4D4  Сожитель 2: &#76C519${prop.co_owner_2}\n`;
        }

        msg += `\n&#FFB800Налоги:\n`;
        if (prop.tax_paid_until) {
            const taxExpired = new Date(prop.tax_paid_until) < new Date();
            msg += `&#D4D4D4  Статус: ${taxExpired ? '&#CA4E4EНе оплачен!' : '&#76C519Оплачен'}\n`;
            msg += `&#D4D4D4  Оплачен до: &#76C519${utils.formatDate(prop.tax_paid_until)}\n`;
            if (taxExpired) {
                const taxAmount = Math.floor(propConfig.price * config.economy.taxRate);
                msg += `&#D4D4D4  Сумма к оплате: &#76C519${utils.formatMoney(taxAmount)}\n`;
            }
        } else {
            msg += `&#D4D4D4  Статус: &#CA4E4EНе оплачен!\n`;
            const taxAmount = Math.floor(propConfig.price * config.economy.taxRate);
            msg += `&#D4D4D4  Сумма к оплате: &#76C519${utils.formatMoney(taxAmount)}\n`;
        }

        msg += `\n&#FFB800Регион:\n`;
        msg += `&#D4D4D4  Название: &#76C519${prop.region_name || `${config.clan.regionPrefix}${propertyId}`}\n`;
    } else {
        msg += `\n&#FFB800Статус:\n`;
        msg += `&#D4D4D4  &#76C519Свободно для покупки\n`;
        msg += `\n&#D4D4D4Для покупки: &#FFB800/im buy ${propertyId}`;
    }

    return utils.formatInfo(username, msg);
}

function handlePropertyTax(bot, username, args, source) {
    const nalogAction = args[0].toLowerCase();
    const propertyId = args[1];

    const property = db.properties.get(propertyId);
    if (!property || !property.is_owned) {
        return utils.formatError(username, `Имущество #${propertyId} не занято`);
    }

    const isOwner = property.owner_lower === username.toLowerCase();
    if (!isOwner) {
        return utils.formatError(username, 'Только владелец может управлять налогами');
    }

    const propConfig = config.getPropertyInfo(propertyId);
    if (!propConfig) {
        return utils.formatError(username, 'Конфигурация имущества не найдена');
    }

    const taxRate = config.economy.taxRate;
    const weeklyTax = Math.floor(propConfig.price * taxRate);

    if (nalogAction === 'info') {
        const paidUntil = property.tax_paid_until;
        const isExpired = !paidUntil || new Date(paidUntil) < new Date();

        let msg = `&#80C4C5💰 Налог на имущество #${propertyId}\n`;
        msg += `&#D4D4D4══════════════════════\n`;
        msg += `&#D4D4D4Тип: ${TYPE_NAMES[propConfig.type] || propConfig.type}\n`;
        msg += `&#D4D4D4Стоимость: &#76C519${utils.formatMoney(propConfig.price)}\n`;
        msg += `&#D4D4D4Ставка: &#76C519${(taxRate * 100).toFixed(1)}% в неделю\n`;
        msg += `&#D4D4D4Сумма: &#76C519${utils.formatMoney(weeklyTax)}/нед\n\n`;

        if (isExpired) {
            msg += `&#CA4E4E⚠ Налог просрочен!\n`;
            if (paidUntil) {
                msg += `&#D4D4D4Был оплачен до: ${utils.formatDate(paidUntil)}\n`;
            }
            msg += `\n&#D4D4D4Оплатить сейчас: &#FFB800/im nalog dep ${propertyId} ${weeklyTax}`;
        } else {
            msg += `&#76C519✅ Налог оплачен\n`;
            msg += `&#D4D4D4Оплачен до: &#76C519${utils.formatDate(paidUntil)}\n`;
            const remaining = utils.timeUntil(paidUntil);
            msg += `&#D4D4D4Осталось: &#76C519${remaining}`;
        }

        // Штраф за просрочку
        if (isExpired && paidUntil) {
            const overdueDays = Math.floor((Date.now() - new Date(paidUntil).getTime()) / 86400000);
            if (overdueDays > 0) {
                const penalty = Math.floor(weeklyTax * 0.1 * overdueDays);
                msg += `\n\n&#CA4E4E⚠ Пеня за просрочку: ${utils.formatMoney(penalty)} (${overdueDays} дн)`;
            }
        }

        return utils.formatInfo(username, msg);
    }

    if (nalogAction === 'dep') {
        if (args.length < 3) {
            return utils.formatUsageError(username,
                `/im nalog dep ${propertyId} <сумма>`);
        }

        const amount = utils.safeParseNumber(args[2], 0);
        if (amount < weeklyTax) {
            return utils.formatError(username,
                `Минимальная сумма: ${utils.formatMoney(weeklyTax)}\n` +
                `Вы указали: ${utils.formatMoney(amount)}`
            );
        }

        const rpMember = db.rpMembers.get(username);
        if (!rpMember || rpMember.balance < amount) {
            return utils.formatError(username,
                `Недостаточно средств!\n` +
                `Баланс: ${utils.formatMoney(rpMember?.balance || 0)}\n` +
                `Требуется: ${utils.formatMoney(amount)}`
            );
        }

        // Оплата
        db.rpMembers.updateBalance(username, -amount, 'tax_payment',
            `Оплата налога #${propertyId}`, 'SYSTEM');

        const newTaxDate = new Date();
        // Если налог был оплачен — продлеваем от даты оплаты
        if (property.tax_paid_until && new Date(property.tax_paid_until) > new Date()) {
            newTaxDate.setTime(new Date(property.tax_paid_until).getTime());
        }
        newTaxDate.setDate(newTaxDate.getDate() + 7);
        db.properties.setTaxPaid(propertyId, newTaxDate.toISOString());

        logger.info(`${username} оплатил налог ${utils.formatMoney(amount)} за #${propertyId}`);

        return utils.formatSuccess(username,
            `&#76C519✅ Налог оплачен!\n` +
            `&#D4D4D4Сумма: ${utils.formatMoney(amount)}\n` +
            `&#D4D4D4Оплачен до: ${utils.formatDate(newTaxDate)}\n` +
            `&#D4D4D4Следующий платёж через 7 дней`
        );
    }

    return utils.formatUsageError(username, '/im nalog <info|dep> <id> [сумма]');
}

function showAllProperties(bot, username, args, source) {
    let filterType = args[0]?.toLowerCase();
    let page = utils.safeParseInt(args[1], 1);
    const perPage = 15;

    const allProperties = db.properties.getAll();
    const allConfigs = Object.entries(config.propertyPrices);

    // Собираем полную информацию
    let fullList = allConfigs.map(([id, info]) => {
        const prop = allProperties.find(p => p.property_id === id);
        return {
            id,
            type: info.type,
            price: info.price,
            isOwned: prop?.is_owned || false,
            owner: prop?.owner || null,
        };
    });

    // Фильтрация
    if (filterType && filterType !== 'all') {
        if (filterType === 'free') {
            fullList = fullList.filter(p => !p.isOwned);
        } else if (filterType === 'owned') {
            fullList = fullList.filter(p => p.isOwned);
        } else if (Object.keys(TYPE_NAMES).includes(filterType)) {
            fullList = fullList.filter(p => p.type === filterType);
        } else {
            // Неизвестный фильтр — показываем всё
        }
    }

    const totalPages = Math.ceil(fullList.length / perPage);
    const currentPage = Math.min(page, Math.max(1, totalPages));
    const start = (currentPage - 1) * perPage;
    const pageItems = fullList.slice(start, start + perPage);

    let msg = `&#80C4C5🏠 Рынок недвижимости Resistance\n`;
    msg += `&#D4D4D4══════════════════════════════\n`;
    msg += `&#D4D4D4Всего: ${fullList.length} | Свободно: ${fullList.filter(p => !p.isOwned).length} | Занято: ${fullList.filter(p => p.isOwned).length}\n`;
    if (filterType) msg += `&#D4D4D4Фильтр: ${filterType}\n`;
    msg += `\n`;

    // Легенда
    msg += `&#D4D4D4🏢 Квартира | 🏠 Дом | 🏛️ Офис | 🏪 Бизнес | 🚢 Порт\n`;
    msg += `&#76C519● Свободно &#CA4E4E● Занято\n\n`;

    for (const item of pageItems) {
        const emoji = TYPE_EMOJI[item.type] || '📍';
        const statusColor = item.isOwned ? '&#CA4E4E' : '&#76C519';
        const statusText = item.isOwned ? `(${item.owner})` : 'Свободно';

        msg += `${emoji} &#FFB800#${item.id} ${statusColor}${utils.formatMoney(item.price)} &#D4D4D4${statusText}\n`;
    }

    msg += `\n&#D4D4D4Стр. ${currentPage}/${totalPages}`;
    if (totalPages > 1) {
        msg += ` | /im list ${filterType || 'all'} <стр>`;
    }

    msg += `\n&#D4D4D4Просмотр: &#FFB800/idim <номер>`;
    msg += ` | Поиск: &#FFB800/im find [тип] [макс_цена]`;

    return utils.formatInfo(username, msg);
}

function findNearbyPropertyIds(id) {
    const allIds = Object.keys(config.propertyPrices);
    const nearby = allIds.filter(k => k.includes(id) || id.includes(k)).slice(0, 5);
    return nearby.length > 0 ? nearby : allIds.slice(0, 3);
}

// ==================== /BIZ (БИЗНЕСЫ) ====================

function businessManage(bot, username, args, source) {
    if (args.length < 1) {
        return utils.formatUsageError(username,
            '/biz <flag|nalog|fin|info|stats> [аргументы]');
    }

    const subCommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subCommand) {

        case 'flag': {
            if (subArgs.length < 3) {
                return utils.formatUsageError(username,
                    '/biz flag <id_бизнеса> <use|item-drop|chest-access|door> <allow|deny>');
            }

            const propertyId = subArgs[0];
            const flag = subArgs[1].toLowerCase();
            const value = subArgs[2].toLowerCase();

            if (!['use', 'item-drop', 'chest-access', 'door'].includes(flag)) {
                return utils.formatError(username,
                    'Для бизнесов доступны флаги: use, item-drop, chest-access, door');
            }

            if (!['allow', 'deny'].includes(value)) {
                return utils.formatError(username, 'Значение: allow или deny');
            }

            const property = db.properties.get(propertyId);
            if (!property || !property.is_owned) {
                return utils.formatError(username, `Бизнес #${propertyId} не найден`);
            }

            if (property.property_type !== 'business') {
                return utils.formatError(username, `#${propertyId} не является бизнесом`);
            }

            if (property.owner_lower !== username.toLowerCase()) {
                return utils.formatError(username, 'Только владелец может управлять флагами');
            }

            const regionName = property.region_name || `${config.clan.regionPrefix}${propertyId}`;
            bot.chat(`/rg flag ${regionName} ${flag} ${value}`);

            logger.info(`${username} установил флаг бизнеса #${propertyId}: ${flag}=${value}`);

            return utils.formatSuccess(username,
                `&#76C519Флаг ${flag} = ${value} для бизнеса #${propertyId}`);
        }

        case 'nalog': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username,
                    '/biz nalog <info|dep> <id_бизнеса> [сумма]');
            }

            const property = db.properties.get(subArgs[1]);
            if (!property || property.property_type !== 'business') {
                return utils.formatError(username, `Бизнес #${subArgs[1]} не найден`);
            }

            return handlePropertyTax(bot, username, subArgs, source);
        }

        case 'fin': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username,
                    '/biz fin <id_бизнеса> <1h|1d|1w|all>');
            }

            const propertyId = subArgs[0];
            const period = subArgs[1]?.toLowerCase();

            if (!['1h', '1d', '1w', 'all'].includes(period)) {
                return utils.formatUsageError(username,
                    '/biz fin <id> <1h|1d|1w|all>');
            }

            const property = db.properties.get(propertyId);
            if (!property || property.owner_lower !== username.toLowerCase()) {
                return utils.formatError(username, 'Вы не владелец этого бизнеса');
            }

            const business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);

            if (!business) {
                return utils.formatInfo(username,
                    `Бизнес #${propertyId}: пока нет финансовых данных.\n` +
                    `Статистика начнёт заполняться после первого часа владения.`
                );
            }

            let earnings = 0;
            let periodName = '';

            switch (period) {
                case '1h':
                    earnings = (business.earnings_today || 0) / 24;
                    periodName = 'за час (примерно)';
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
            }

            let msg = `&#80C4C5📊 Бизнес #${propertyId}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Доход ${periodName}: &#76C519${utils.formatMoney(earnings)}\n`;

            if (business.license_expires) {
                const remaining = utils.timeUntil(business.license_expires);
                const expired = new Date(business.license_expires) < new Date();
                msg += `\n&#D4D4D4Лицензия: ${expired ? '&#CA4E4EИстекла!' : '&#76C519Активна'}\n`;
                msg += `&#D4D4D4До: ${utils.formatDate(business.license_expires)} (${remaining})\n`;
            }

            return utils.formatInfo(username, msg);
        }

        case 'info':
        case 'stats': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/biz info <id_бизнеса>');
            }

            const propertyId = subArgs[0];
            const property = db.properties.get(propertyId);

            if (!property || property.property_type !== 'business') {
                return utils.formatError(username, `Бизнес #${propertyId} не найден`);
            }

            const isOwner = property.owner_lower === username.toLowerCase();
            if (!isOwner && !permissions.isStaff(username, db)) {
                return utils.formatError(username, 'Вы не владелец этого бизнеса');
            }

            const business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);

            let msg = `&#80C4C5🏪 Бизнес #${propertyId}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Владелец: &#76C519${property.owner}\n`;
            msg += `&#D4D4D4Куплен: &#76C519${utils.formatDate(property.purchased_at)}\n`;

            if (business) {
                msg += `\n&#FFB800Финансы:\n`;
                msg += `&#D4D4D4  За сегодня: &#76C519${utils.formatMoney(business.earnings_today || 0)}\n`;
                msg += `&#D4D4D4  За неделю: &#76C519${utils.formatMoney(business.earnings_week || 0)}\n`;
                msg += `&#D4D4D4  За всё время: &#76C519${utils.formatMoney(business.earnings_total || 0)}\n`;

                if (business.license_expires) {
                    const remaining = utils.timeUntil(business.license_expires);
                    msg += `\n&#D4D4D4Лицензия до: &#76C519${utils.formatDate(business.license_expires)} (${remaining})\n`;
                }
            } else {
                msg += `\n&#D4D4D4Финансовые данные появятся после первого часа работы.\n`;
            }

            msg += `\n&#D4D4D4Регион: &#76C519${property.region_name || `${config.clan.regionPrefix}${propertyId}`}`;

            return utils.formatInfo(username, msg);
        }

        default:
            return utils.formatUsageError(username,
                '/biz <flag|nalog|fin|info> [аргументы]');
    }
}

// ==================== /OFFICE (/OF) ====================

function officeManage(bot, username, args, source) {
    if (args.length < 1) {
        return utils.formatUsageError(username,
            '/office <nalog|fin|info|type|question> [аргументы]');
    }

    const subCommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subCommand) {

        case 'nalog': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username,
                    '/office nalog <info|dep> <id_офиса> [сумма]');
            }

            const property = db.properties.get(subArgs[1]);
            if (!property || property.property_type !== 'office') {
                return utils.formatError(username, `Офис #${subArgs[1]} не найден`);
            }

            return handlePropertyTax(bot, username, subArgs, source);
        }

        case 'fin': {
            if (subArgs.length < 2) {
                return utils.formatUsageError(username,
                    '/office fin <id_офиса> <1h|1d|1w|all>');
            }

            const propertyId = subArgs[0];
            const period = subArgs[1]?.toLowerCase();

            if (!['1h', '1d', '1w', 'all'].includes(period)) {
                return utils.formatUsageError(username, '/office fin <id> <1h|1d|1w|all>');
            }

            const property = db.properties.get(propertyId);
            if (!property || property.owner_lower !== username.toLowerCase()) {
                return utils.formatError(username, 'Вы не владелец этого офиса');
            }

            const office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);

            if (!office) {
                return utils.formatInfo(username,
                    `Офис #${propertyId}: данные не найдены. Обратитесь к администратору.`);
            }

            // Расчёт дохода на основе уровня
            const baseEarnings = office.level * 500;
            let earnings = 0;
            let periodName = '';

            switch (period) {
                case '1h': earnings = baseEarnings; periodName = 'за час'; break;
                case '1d': earnings = baseEarnings * 24; periodName = 'за день'; break;
                case '1w': earnings = baseEarnings * 24 * 7; periodName = 'за неделю'; break;
                case 'all': earnings = office.earnings_total || 0; periodName = 'за всё время'; break;
            }

            let msg = `&#80C4C5📊 Офис #${propertyId}\n`;
            msg += `&#D4D4D4══════════════════════\n`;
            msg += `&#D4D4D4Тип: &#FFB800${office.office_type || 'Не указан'}\n`;
            msg += `&#D4D4D4Уровень: &#76C519${office.level}/10\n`;
            msg += `&#D4D4D4Доход ${periodName}: &#76C519${utils.formatMoney(earnings)}\n`;
            msg += `&#D4D4D4Всего заработано: &#76C519${utils.formatMoney(office.earnings_total || 0)}\n`;

            return utils.formatInfo(username, msg);
        }

        case 'info': {
            if (subArgs.length < 1) {
                return utils.formatUsageError(username, '/office info <id_офиса>');
            }

            const propertyId = subArgs[0];
            const property = db.properties.get(propertyId);

            if (!property || property.property_type !== 'office') {
                return utils.formatError(username, `Офис #${propertyId} не найден`);
            }

            const isOwner = property.owner_lower === username.toLowerCase();
            if (!isOwner && !permissions.isStaff(username, db)) {
                return utils.formatError(username, 'Вы не владелец этого офиса');
            }

            const office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);

            if (!office) {
                return utils.formatInfo(username,
                    `Офис #${propertyId}: информация не найдена.\n` +
                    `Возможно, требуется настройка офиса. Обратитесь к администратору.`
                );
            }

            const nextLevel = office.level + 1;
            const questionsNeeded = nextLevel <= 10 ? nextLevel * 3 : 0;
            const correctNeeded = Math.ceil(questionsNeeded * 0.6);

            let msg = `&#80C4C5🏛️ Офис #${propertyId}\n`;
            msg += `&#D4D4D4══════════════════════════════\n\n`;

            msg += `&#FFB800Основное:\n`;
            msg += `&#D4D4D4  Владелец: &#76C519${property.owner}\n`;
            msg += `&#D4D4D4  Тип: &#FFB800${office.office_type || 'Не указан'}\n`;
            msg += `&#D4D4D4  Уровень: &#76C519${office.level}/10\n`;
            msg += `&#D4D4D4  Доход: &#76C519${utils.formatMoney(office.earnings_total || 0)}\n\n`;

            msg += `&#FFB800Прогресс:\n`;
            msg += `&#D4D4D4  Отвечено вопросов: &#76C519${office.questions_answered || 0}\n`;
            msg += `&#D4D4D4  Правильных: &#76C519${office.correct_answers || 0}\n`;

            if (office.level < 10) {
                msg += `\n&#FFB800Для уровня ${nextLevel}:\n`;
                msg += `&#D4D4D4  Нужно вопросов: &#76C519${questionsNeeded}\n`;
                msg += `&#D4D4D4  Правильных: &#76C519${correctNeeded}\n\n`;
                msg += `&#D4D4D4Отвечайте на вопросы через Discord бота для прокачки!`;
            } else {
                msg += `\n&#76C519🌟 МАКСИМАЛЬНЫЙ УРОВЕНЬ!`;
            }

            return utils.formatInfo(username, msg);
        }

        case 'type': {
            if (subArgs.length < 1) {
                const types = config.officeTypes.map(t =>
                    `&#FFB800${t.name}&#D4D4D4 — ${t.description} (ключ: ${t.key})`
                ).join('\n');

                return utils.formatInfo(username,
                    `&#80C4C5Доступные типы офисов:\n` +
                    `&#D4D4D4══════════════════════\n${types}\n\n` +
                    `&#D4D4D4Выбор типа происходит при первой настройке офиса.`);
            }
            return utils.formatUsageError(username, '/office type — показать доступные типы');
        }

        default:
            return utils.formatUsageError(username,
                '/office <nalog|fin|info|type> [аргументы]');
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    propertyManage,
    businessManage,
    officeManage,
    showPropertyInfo,
    executeBuyProperty,
};
