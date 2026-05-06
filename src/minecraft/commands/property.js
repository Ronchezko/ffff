// src/minecraft/commands/property.js — Управление имуществом Resistance City v5.0.0
// /im — квартиры, дома, порты
// /biz — бизнесы
// /office, /of — офисы

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

function msg(bot, user, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/msg ' + user + ' ' + text); } catch(e) {}
}

const TYPE_NAMES = { apartment: 'Квартира', house: 'Дом', office: 'Офис', business: 'Бизнес', port: 'Порт' };
const TYPE_EMOJI = { apartment: '🏢', house: '🏠', office: '🏛️', business: '🏪', port: '🚢' };

// ==================== /IM ====================
function propertyManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /im <buy|sell|info|addm|dellm|flag|nalog|list|my|find|price>');

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // ==================== BUY ====================
    if (sub === 'buy') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /im buy <id>');
        const propertyId = subArgs[0];
        if (!utils.isValidPropertyId(propertyId)) return msg(bot, username, '&#CA4E4E❌ Неверный ID. /im list — список');

        const propertyConfig = config.getPropertyInfo(propertyId);
        const existing = db.properties.get(propertyId);
        if (existing && existing.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' занято (' + existing.owner + ')');

        const rpMember = db.rpMembers.get(username);
        if (!rpMember || rpMember.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Вы не в RP');
        if (rpMember.balance < propertyConfig.price) {
            return msg(bot, username, '&#CA4E4E❌ Недостаточно средств! Цена: &#76C519' + utils.formatMoney(propertyConfig.price) + ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(rpMember.balance));
        }

        if (propertyConfig.type === 'business' && !db.licenses.hasActive(username, 'business')) {
            return msg(bot, username, '&#CA4E4E❌ Нужна лицензия предпринимателя! /license buy business');
        }
        if (propertyConfig.type === 'office' && !db.licenses.hasActive(username, 'office')) {
            return msg(bot, username, '&#CA4E4E❌ Нужна лицензия на офис! /license buy office');
        }

        const currentProps = db.properties.getOwned(username);
        const ownedCount = currentProps.filter(p => p.owner_lower === username.toLowerCase()).length;
        if (ownedCount >= 5 && !permissions.isAdmin(username, db)) {
            return msg(bot, username, '&#CA4E4E❌ Лимит имущества (5). Продайте что-нибудь.');
        }

        db.rpMembers.updateBalance(username, -propertyConfig.price, 'property_buy', 'Покупка #' + propertyId, 'SYSTEM');
        db.properties.buy(propertyId, username, propertyConfig.price, propertyConfig.type);
        const regionName = config.clan.regionPrefix + propertyId;
        bot.chat('/rg addmember ' + regionName + ' ' + username);

        logger.info(username + ' купил #' + propertyId + ' (' + propertyConfig.type + ') за ' + utils.formatMoney(propertyConfig.price));

        msg(bot, username, '&#76C519✅ ' + (TYPE_NAMES[propertyConfig.type] || propertyConfig.type) + ' #' + propertyId + ' куплен за &#FFB800' + utils.formatMoney(propertyConfig.price));
        msg(bot, username, '&#D4D4D4Регион: &#76C519' + regionName + ' &#D4D4D4| Налог: /im nalog dep ' + propertyId + ' &#D4D4D4| Флаги: /im flag');
        return;
    }

    // ==================== SELL ====================
    if (sub === 'sell') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /im sell <id> [confirm]');
        const propertyId = subArgs[0];
        const confirm = subArgs[1]?.toLowerCase();
        const property = db.properties.get(propertyId);
        if (!property || !property.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');
        if (property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Вы не владелец');

        const sellPrice = property.price || config.getPropertyInfo(propertyId)?.price || 0;
        const refund = Math.floor(sellPrice * 0.5);

        if (confirm !== 'confirm' && confirm !== 'yes' && confirm !== 'да') {
            return msg(bot, username, '&#FFB800⚠ Продажа #' + propertyId + ' — возврат &#76C519' + utils.formatMoney(refund) + ' (50%). Для подтверждения: &#FFB800/im sell ' + propertyId + ' confirm');
        }

        const regionName = property.region_name || config.clan.regionPrefix + propertyId;
        if (property.owner) bot.chat('/rg removemember ' + regionName + ' ' + property.owner);
        if (property.co_owner_1) bot.chat('/rg removemember ' + regionName + ' ' + property.co_owner_1);
        if (property.co_owner_2) bot.chat('/rg removemember ' + regionName + ' ' + property.co_owner_2);

        db.rpMembers.updateBalance(username, refund, 'property_sell', 'Продажа #' + propertyId, 'SYSTEM');
        db.properties.remove(propertyId);

        logger.info(username + ' продал #' + propertyId + ' за ' + utils.formatMoney(refund));
        msg(bot, username, '&#76C519✅ Продано! Возврат: &#FFB800' + utils.formatMoney(refund));
        return;
    }

    // ==================== INFO ====================
    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /im info <id>');
        const propertyId = subArgs[0];
        const prop = db.properties.get(propertyId);
        const propConfig = config.getPropertyInfo(propertyId);
        if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Не найдено');

        if (prop && prop.is_owned) {
            msg(bot, username, '&#80C4C5🏠 #' + propertyId + ' ' + (TYPE_NAMES[propConfig.type] || propConfig.type) + ' &#D4D4D4| Владелец: &#76C519' + prop.owner);
            if (prop.co_owner_1 || prop.co_owner_2) msg(bot, username, '&#D4D4D4Сожители: ' + [prop.co_owner_1, prop.co_owner_2].filter(Boolean).join(', '));
            const taxExpired = !prop.tax_paid_until || new Date(prop.tax_paid_until) < new Date();
            msg(bot, username, '&#D4D4D4Налог: ' + (taxExpired ? '&#CA4E4EНе оплачен!' : '&#76C519Оплачен до ' + utils.formatDate(prop.tax_paid_until)) + ' &#D4D4D4| Регион: &#76C519' + (prop.region_name || config.clan.regionPrefix + propertyId));
        } else {
            msg(bot, username, '&#80C4C5🏠 #' + propertyId + ' ' + (TYPE_NAMES[propConfig.type] || propConfig.type) + ' &#76C519Свободно &#D4D4D4| Цена: &#76C519' + utils.formatMoney(propConfig.price));
        }
        return;
    }

    // ==================== ADDM ====================
    if (sub === 'addm') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /im addm <id> <ник>');
        const propertyId = subArgs[0];
        const target = subArgs[1];
        const property = db.properties.get(propertyId);
        if (!property || !property.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');
        if (property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Только владелец');
        if (property.property_type !== 'apartment' && property.property_type !== 'house') return msg(bot, username, '&#CA4E4E❌ Сожители только в квартиры/дома');
        if (target.toLowerCase() === username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Вы уже владелец');

        const tm = db.rpMembers.get(target);
        if (!tm || tm.is_active !== 1) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');
        if (tm.is_in_jail) return msg(bot, username, '&#CA4E4E❌ Игрок в тюрьме');
        if (property.co_owner_1_lower === target.toLowerCase() || property.co_owner_2_lower === target.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Уже сожитель');
        if (property.co_owner_1 && property.co_owner_2) return msg(bot, username, '&#CA4E4E❌ Нет мест (макс 2)');

        const result = db.properties.addCoOwner(propertyId, target);
        if (result.success) {
            const regionName = property.region_name || config.clan.regionPrefix + propertyId;
            bot.chat('/rg addmember ' + regionName + ' ' + target);
            msg(bot, username, '&#76C519✅ ' + target + ' добавлен как сожитель (слот ' + result.slot + ')');
            try { bot.chat('/msg ' + target + ' &#76C519✅ Вы добавлены как сожитель в имущество #' + propertyId); } catch(e) {}
        } else {
            msg(bot, username, '&#CA4E4E❌ ' + (result.reason === 'no_free_slots' ? 'Нет мест' : 'Ошибка'));
        }
        return;
    }

    // ==================== DELLM ====================
    if (sub === 'dellm') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /im dellm <id> <ник>');
        const propertyId = subArgs[0];
        const target = subArgs[1];
        const property = db.properties.get(propertyId);
        if (!property || !property.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');

        const isOwner = property.owner_lower === username.toLowerCase();
        const isSelf = target.toLowerCase() === username.toLowerCase();
        if (!isOwner && !isSelf) return msg(bot, username, '&#CA4E4E❌ Только владелец или вы сами');

        const result = db.properties.removeCoOwner(propertyId, target);
        if (result.success) {
            const regionName = property.region_name || config.clan.regionPrefix + propertyId;
            bot.chat('/rg removemember ' + regionName + ' ' + target);
            msg(bot, username, '&#76C519✅ ' + target + ' удалён из сожителей');
            try { bot.chat('/msg ' + target + ' &#CA4E4EВы удалены из сожителей имущества #' + propertyId); } catch(e) {}
        } else {
            msg(bot, username, '&#CA4E4E❌ Ошибка');
        }
        return;
    }

    // ==================== FLAG ====================
    if (sub === 'flag') {
        if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /im flag <id> <use|item-drop|pvp|chest-access|door> <allow|deny>');
        const propertyId = subArgs[0];
        const flag = subArgs[1].toLowerCase();
        const value = subArgs[2].toLowerCase();
        const validFlags = ['use', 'item-drop', 'pvp', 'chest-access', 'door'];

        if (!validFlags.includes(flag)) return msg(bot, username, '&#CA4E4E❌ Флаги: ' + validFlags.join(', '));
        if (!['allow', 'deny'].includes(value)) return msg(bot, username, '&#CA4E4E❌ allow или deny');

        const property = db.properties.get(propertyId);
        if (!property || !property.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');

        const isOwner = property.owner_lower === username.toLowerCase();
        const isCoOwner = property.co_owner_1_lower === username.toLowerCase() || property.co_owner_2_lower === username.toLowerCase();
        if (!isOwner && !isCoOwner) return msg(bot, username, '&#CA4E4E❌ Нет прав');
        if (!isOwner && ['build', 'break'].includes(flag)) return msg(bot, username, '&#CA4E4E❌ Только владелец');

        const regionName = property.region_name || config.clan.regionPrefix + propertyId;
        bot.chat('/rg flag ' + regionName + ' ' + flag + ' ' + value);
        msg(bot, username, '&#76C519✅ Флаг ' + flag + ' = ' + value);
        return;
    }

    // ==================== NALOG ====================
    if (sub === 'nalog') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /im nalog <info|dep> <id> [сумма]');
        const nalogAction = subArgs[0].toLowerCase();
        const propertyId = subArgs[1];
        const property = db.properties.get(propertyId);
        if (!property || !property.is_owned) return msg(bot, username, '&#CA4E4E❌ #' + propertyId + ' не занято');
        if (property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Только владелец');

        const propConfig = config.getPropertyInfo(propertyId);
        if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Конфигурация не найдена');

        const taxRate = config.economy.taxRate;
        const weeklyTax = Math.floor(propConfig.price * taxRate);

        if (nalogAction === 'info') {
            const isExpired = !property.tax_paid_until || new Date(property.tax_paid_until) < new Date();
            msg(bot, username, '&#80C4C5💰 Налог #' + propertyId + ' &#D4D4D4| Ставка: &#FFB800' + (taxRate * 100).toFixed(1) + '% &#D4D4D4| Сумма: &#76C519' + utils.formatMoney(weeklyTax) + '/нед');
            msg(bot, username, (isExpired ? '&#CA4E4E⚠ Налог не оплачен! ' : '&#76C519✅ Оплачен до ') + (property.tax_paid_until ? utils.formatDate(property.tax_paid_until) : '—') + ' &#D4D4D4| /im nalog dep ' + propertyId + ' ' + weeklyTax);
            return;
        }

        if (nalogAction === 'dep') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ Укажите сумму. Минимум: ' + utils.formatMoney(weeklyTax));
            const amount = parseFloat(subArgs[2]);
            if (isNaN(amount) || amount < weeklyTax) return msg(bot, username, '&#CA4E4E❌ Минимум: ' + utils.formatMoney(weeklyTax));

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.balance < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно средств');

            db.rpMembers.updateBalance(username, -amount, 'tax_payment', 'Налог #' + propertyId, 'SYSTEM');
            const newTaxDate = new Date();
            if (property.tax_paid_until && new Date(property.tax_paid_until) > new Date()) {
                newTaxDate.setTime(new Date(property.tax_paid_until).getTime());
            }
            newTaxDate.setDate(newTaxDate.getDate() + 7);
            db.properties.setTaxPaid(propertyId, newTaxDate.toISOString());

            msg(bot, username, '&#76C519✅ Налог оплачен! Сумма: &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4| До: ' + utils.formatDate(newTaxDate));
            return;
        }
        msg(bot, username, '&#CA4E4E❌ /im nalog <info|dep>');
        return;
    }

    // ==================== LIST ====================
    if (sub === 'list') {
        const allConfigs = Object.entries(config.propertyPrices);
        const allProps = db.properties.getAll();
        let freeList = allConfigs.filter(([id]) => !allProps.find(p => p.property_id === id && p.is_owned));
        freeList.sort((a, b) => a[1].price - b[1].price);
        const items = freeList.slice(0, 15).map(([id, info]) => '&#FFB800#' + id + ' &#D4D4D4' + (TYPE_NAMES[info.type] || info.type) + ' &#76C519' + utils.formatMoney(info.price)).join(' &#D4D4D4| ');

        msg(bot, username, '&#80C4C5🏠 Рынок недвижимости (' + freeList.length + ' свободно):');
        msg(bot, username, items || '&#D4D4D4Нет свободного имущества');
        msg(bot, username, '&#D4D4D4Просмотр: /idim <номер> | Поиск: /im find [тип] [макс_цена]');
        return;
    }

    // ==================== MY ====================
    if (sub === 'my') {
        const props = db.properties.getOwned(username);
        if (props.length === 0) return msg(bot, username, '&#D4D4D4У вас нет имущества. /im list — рынок');
        const owned = props.filter(p => p.owner_lower === username.toLowerCase());
        const coOwned = props.filter(p => p.owner_lower !== username.toLowerCase());

        msg(bot, username, '&#80C4C5🔑 Имущество (' + props.length + '):');
        if (owned.length > 0) {
            const list = owned.map(p => '&#FFB800#' + p.property_id + ' &#D4D4D4' + (TYPE_NAMES[p.property_type] || p.property_type)).join(' &#D4D4D4| ');
            msg(bot, username, list);
        }
        if (coOwned.length > 0) {
            const list = coOwned.map(p => '&#D4D4D4#' + p.property_id + ' ' + p.property_type + ' (владелец: &#76C519' + p.owner + '&#D4D4D4)').join(' &#D4D4D4| ');
            msg(bot, username, list);
        }
        return;
    }

    // ==================== FIND / PRICE ====================
    if (sub === 'find') {
        const searchType = subArgs[0]?.toLowerCase();
        const maxPrice = parseFloat(subArgs[1]) || Infinity;
        const allConfigs = Object.entries(config.propertyPrices);
        const allProps = db.properties.getAll();

        let filtered = allConfigs.filter(([id, info]) => {
            if (allProps.find(p => p.property_id === id && p.is_owned)) return false;
            if (searchType && searchType !== 'all' && info.type !== searchType) return false;
            if (info.price > maxPrice) return false;
            return true;
        });
        filtered.sort((a, b) => a[1].price - b[1].price);

        if (filtered.length === 0) return msg(bot, username, '&#D4D4D4Ничего не найдено');
        const list = filtered.slice(0, 10).map(([id, info]) => (TYPE_EMOJI[info.type] || '📍') + ' &#FFB800#' + id + ' &#D4D4D4' + (TYPE_NAMES[info.type] || info.type) + ' &#76C519' + utils.formatMoney(info.price)).join(' &#D4D4D4| ');
        msg(bot, username, '&#80C4C5🔍 Найдено (' + filtered.length + '): ' + list);
        return;
    }

    if (sub === 'price') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /im price <id>');
        const propConfig = config.getPropertyInfo(subArgs[0]);
        if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Не найдено');
        const weeklyTax = Math.floor(propConfig.price * config.economy.taxRate);
        msg(bot, username, '&#80C4C5💰 #' + subArgs[0] + ' ' + (TYPE_NAMES[propConfig.type] || propConfig.type) + ' &#D4D4D4| Цена: &#76C519' + utils.formatMoney(propConfig.price) + ' &#D4D4D4| Налог: &#76C519' + utils.formatMoney(weeklyTax) + '/нед');
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /im <buy|sell|info|addm|dellm|flag|nalog|list|my|find|price>');
}

// ==================== /BIZ ====================
function businessManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /biz <flag|nalog|fin|info>');

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    if (sub === 'flag') {
        if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ /biz flag <id> <use|item-drop|chest-access|door> <allow|deny>');
        const propertyId = subArgs[0];
        const flag = subArgs[1].toLowerCase();
        const value = subArgs[2].toLowerCase();

        if (!['use', 'item-drop', 'chest-access', 'door'].includes(flag)) return msg(bot, username, '&#CA4E4E❌ Флаги: use, item-drop, chest-access, door');
        if (!['allow', 'deny'].includes(value)) return msg(bot, username, '&#CA4E4E❌ allow или deny');

        const property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'business') return msg(bot, username, '&#CA4E4E❌ Не бизнес');
        if (property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Только владелец');

        const regionName = property.region_name || config.clan.regionPrefix + propertyId;
        bot.chat('/rg flag ' + regionName + ' ' + flag + ' ' + value);
        msg(bot, username, '&#76C519✅ Флаг ' + flag + ' = ' + value);
        return;
    }

    if (sub === 'nalog') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /biz nalog <info|dep> <id> [сумма]');
        const property = db.properties.get(subArgs[1]);
        if (!property || property.property_type !== 'business') return msg(bot, username, '&#CA4E4E❌ Не бизнес');

        const nalogAction = subArgs[0].toLowerCase();
        const propConfig = config.getPropertyInfo(subArgs[1]);
        if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Конфигурация не найдена');

        const taxRate = db.settings.getNumber('business_tax_rate') || 0.02;
        const weeklyTax = Math.floor(propConfig.price * taxRate);

        if (nalogAction === 'info') {
            const isExpired = !property.tax_paid_until || new Date(property.tax_paid_until) < new Date();
            msg(bot, username, '&#80C4C5💰 Налог бизнеса #' + subArgs[1] + ' &#D4D4D4| Ставка: &#FFB800' + (taxRate * 100).toFixed(1) + '% &#D4D4D4| Сумма: &#76C519' + utils.formatMoney(weeklyTax) + '/нед');
            msg(bot, username, (isExpired ? '&#CA4E4E⚠ Не оплачен! ' : '&#76C519✅ Оплачен ') + '/biz nalog dep ' + subArgs[1] + ' ' + weeklyTax);
            return;
        }
        if (nalogAction === 'dep') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ Укажите сумму');
            const amount = parseFloat(subArgs[2]);
            if (isNaN(amount) || amount < weeklyTax) return msg(bot, username, '&#CA4E4E❌ Минимум: ' + utils.formatMoney(weeklyTax));

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.balance < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно средств');

            db.rpMembers.updateBalance(username, -amount, 'tax_payment', 'Налог бизнес #' + subArgs[1], 'SYSTEM');
            const newTaxDate = new Date();
            if (property.tax_paid_until && new Date(property.tax_paid_until) > new Date()) {
                newTaxDate.setTime(new Date(property.tax_paid_until).getTime());
            }
            newTaxDate.setDate(newTaxDate.getDate() + 7);
            db.properties.setTaxPaid(subArgs[1], newTaxDate.toISOString());

            msg(bot, username, '&#76C519✅ Налог оплачен! &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4| До: ' + utils.formatDate(newTaxDate));
            return;
        }
        return;
    }

    if (sub === 'fin') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /biz fin <id> <1h|1d|1w|all>');
        const propertyId = subArgs[0];
        const period = subArgs[1]?.toLowerCase();
        if (!['1h', '1d', '1w', 'all'].includes(period)) return msg(bot, username, '&#CA4E4E❌ Период: 1h, 1d, 1w, all');

        const property = db.properties.get(propertyId);
        if (!property || property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Не ваш бизнес');

        const business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);
        if (!business) return msg(bot, username, '&#D4D4D4Нет данных');

        let earnings = 0, periodName = '';
        if (period === '1h') { earnings = (business.earnings_today || 0) / 24; periodName = 'за час'; }
        else if (period === '1d') { earnings = business.earnings_today || 0; periodName = 'за день'; }
        else if (period === '1w') { earnings = business.earnings_week || 0; periodName = 'за неделю'; }
        else { earnings = business.earnings_total || 0; periodName = 'за всё время'; }

        msg(bot, username, '&#80C4C5📊 Бизнес #' + propertyId + ' &#D4D4D4| Доход ' + periodName + ': &#76C519' + utils.formatMoney(earnings));
        return;
    }

    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /biz info <id>');
        const propertyId = subArgs[0];
        const property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'business') return msg(bot, username, '&#CA4E4E❌ Не бизнес');

        const business = db.get('SELECT * FROM businesses WHERE property_id = ?', [propertyId]);
        msg(bot, username, '&#80C4C5🏪 Бизнес #' + propertyId + ' &#D4D4D4| Владелец: &#76C519' + property.owner);
        if (business) {
            msg(bot, username, '&#D4D4D4Доход: сегодня &#76C519' + utils.formatMoney(business.earnings_today || 0) + ' &#D4D4D4| неделя &#76C519' + utils.formatMoney(business.earnings_week || 0) + ' &#D4D4D4| всего &#76C519' + utils.formatMoney(business.earnings_total || 0));
        }
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /biz <flag|nalog|fin|info>');
}

// ==================== /OFFICE (/OF) ====================
function officeManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /office <nalog|fin|info|type>');

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    if (sub === 'nalog') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /office nalog <info|dep> <id> [сумма]');
        const property = db.properties.get(subArgs[1]);
        if (!property || property.property_type !== 'office') return msg(bot, username, '&#CA4E4E❌ Не офис');

        const nalogAction = subArgs[0].toLowerCase();
        const propConfig = config.getPropertyInfo(subArgs[1]);
        if (!propConfig) return msg(bot, username, '&#CA4E4E❌ Конфигурация не найдена');

        const taxRate = config.economy.taxRate;
        const weeklyTax = Math.floor(propConfig.price * taxRate);

        if (nalogAction === 'info') {
            const isExpired = !property.tax_paid_until || new Date(property.tax_paid_until) < new Date();
            msg(bot, username, '&#80C4C5💰 Налог офиса #' + subArgs[1] + ' &#D4D4D4| Сумма: &#76C519' + utils.formatMoney(weeklyTax) + '/нед');
            msg(bot, username, (isExpired ? '&#CA4E4E⚠ Не оплачен! ' : '&#76C519✅ Оплачен ') + '/office nalog dep ' + subArgs[1] + ' ' + weeklyTax);
            return;
        }
        if (nalogAction === 'dep') {
            if (subArgs.length < 3) return msg(bot, username, '&#CA4E4E❌ Укажите сумму');
            const amount = parseFloat(subArgs[2]);
            if (isNaN(amount) || amount < weeklyTax) return msg(bot, username, '&#CA4E4E❌ Минимум: ' + utils.formatMoney(weeklyTax));

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.balance < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно средств');

            db.rpMembers.updateBalance(username, -amount, 'tax_payment', 'Налог офис #' + subArgs[1], 'SYSTEM');
            const newTaxDate = new Date();
            if (property.tax_paid_until && new Date(property.tax_paid_until) > new Date()) {
                newTaxDate.setTime(new Date(property.tax_paid_until).getTime());
            }
            newTaxDate.setDate(newTaxDate.getDate() + 7);
            db.properties.setTaxPaid(subArgs[1], newTaxDate.toISOString());

            msg(bot, username, '&#76C519✅ Налог оплачен! &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4| До: ' + utils.formatDate(newTaxDate));
            return;
        }
        return;
    }

    if (sub === 'fin') {
        if (subArgs.length < 2) return msg(bot, username, '&#CA4E4E❌ /office fin <id> <1h|1d|1w|all>');
        const propertyId = subArgs[0];
        const period = subArgs[1]?.toLowerCase();
        if (!['1h', '1d', '1w', 'all'].includes(period)) return msg(bot, username, '&#CA4E4E❌ 1h, 1d, 1w, all');

        const property = db.properties.get(propertyId);
        if (!property || property.owner_lower !== username.toLowerCase()) return msg(bot, username, '&#CA4E4E❌ Не ваш офис');

        const office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (!office) return msg(bot, username, '&#D4D4D4Нет данных');

        const baseEarnings = office.level * 500;
        let earnings = 0, periodName = '';
        if (period === '1h') { earnings = baseEarnings; periodName = 'за час'; }
        else if (period === '1d') { earnings = baseEarnings * 24; periodName = 'за день'; }
        else if (period === '1w') { earnings = baseEarnings * 24 * 7; periodName = 'за неделю'; }
        else { earnings = office.earnings_total || 0; periodName = 'за всё время'; }

        msg(bot, username, '&#80C4C5📊 Офис #' + propertyId + ' (ур.' + office.level + ') &#D4D4D4| Доход ' + periodName + ': &#76C519' + utils.formatMoney(earnings));
        return;
    }

    if (sub === 'info') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /office info <id>');
        const propertyId = subArgs[0];
        const property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'office') return msg(bot, username, '&#CA4E4E❌ Не офис');

        const office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (!office) return msg(bot, username, '&#D4D4D4Нет данных. Требуется настройка.');

        const nextLevel = office.level + 1;
        const questionsNeeded = nextLevel <= 10 ? nextLevel * 3 : 0;
        const correctNeeded = Math.ceil(questionsNeeded * 0.6);

        msg(bot, username, '&#80C4C5🏛️ Офис #' + propertyId + ' &#D4D4D4| Тип: &#FFB800' + (office.office_type || '—') + ' &#D4D4D4| Уровень: &#76C519' + office.level + '/10');
        if (office.level < 10) {
            msg(bot, username, '&#D4D4D4Для ур.' + nextLevel + ': ответов &#FFB800' + questionsNeeded + ' &#D4D4D4| правильно &#FFB800' + correctNeeded);
        }
        msg(bot, username, '&#D4D4D4Отвечено: &#76C519' + (office.questions_answered || 0) + ' &#D4D4D4| Правильно: &#76C519' + (office.correct_answers || 0));
        return;
    }

    if (sub === 'type') {
        const types = (config.officeTypes || []).map(t => '&#FFB800' + t.key + ' &#D4D4D4— ' + t.name).join(' | ');
        msg(bot, username, '&#80C4C5📋 Типы офисов: ' + types);
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /office <nalog|fin|info|type>');
}

// ==================== ЭКСПОРТ ====================
module.exports = { propertyManage, businessManage, officeManage };