// src/minecraft/commands/property.js
const database = require('../../database');
const utils = require('../../shared/utils');

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0', dark_blue: '&1', dark_green: '&2', dark_aqua: '&3',
    dark_red: '&4', dark_purple: '&5', gold: '&6', gray: '&7',
    dark_gray: '&8', blue: '&9', green: '&a', aqua: '&b',
    red: '&c', light_purple: '&d', yellow: '&e', white: '&f',
    bold: '&l', reset: '&r'
};

// Функция для красивого форматирования сообщений
function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${color}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

// Функция для создания рамки
function createFrame(title, lines) {
    let frame = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    frame += `${colors.gold}║ ${colors.light_purple}${colors.bold}${title}${colors.reset}`;
    frame += ' '.repeat(32 - title.length - 2) + `${colors.gold}║${colors.reset}\n`;
    frame += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    for (const line of lines) {
        frame += `${colors.gold}║ ${line}`;
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        frame += ' '.repeat(32 - cleanLine.length - 2) + `${colors.gold}║${colors.reset}\n`;
    }
    frame += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    return frame;
}

// Типы имущества и их названия
const PROPERTY_TYPES = {
    apartment: 'Квартира',
    house: 'Дом',
    business: 'Бизнес',
    office: 'Офис',
    port: 'Порт'
};

const PROPERTY_EMOJIS = {
    apartment: '🏠',
    house: '🏡',
    business: '🏪',
    office: '🏢',
    port: '⚓'
};

// Префикс региона (можно менять в настройках)
const REGION_PREFIX = 'TRTR';

/**
 * Проверка активной лицензии на бизнес/офис
 */
async function checkLicense(playerId, type) {
    const db = database.getDb();
    const license = db.prepare(`
        SELECT * FROM properties 
        WHERE owner = ? AND license_type = ? AND license_expires > datetime('now')
    `).get(playerId, type);
    return !!license;
}

/**
 * Получение информации об имуществе
 */
async function getPropertyInfo(propertyId) {
    const property = await database.getProperty(propertyId);
    if (!property) return null;
    
    const typeName = PROPERTY_TYPES[property.type] || property.type;
    const typeEmoji = PROPERTY_EMOJIS[property.type] || '📦';
    const status = property.owner ? `${colors.green}Занято${colors.reset}` : `${colors.green}Свободно${colors.reset}`;
    const owner = property.owner || 'Нет владельца';
    const coOwners = property.co_owners ? JSON.parse(property.co_owners) : [];
    const coOwnersList = coOwners.length > 0 ? coOwners.join(', ') : 'нет';
    const lastTaxPaid = property.last_tax_paid ? new Date(property.last_tax_paid).toLocaleDateString('ru-RU') : 'никогда';
    
    const taxRate = parseFloat(database.getSetting('tax_property') || '1');
    const weeklyTax = Math.floor(property.price * taxRate / 100);
    
    return {
        id: property.id,
        type: property.type,
        typeName,
        typeEmoji,
        price: property.price,
        status,
        owner,
        coOwners,
        coOwnersList,
        lastTaxPaid,
        weeklyTax,
        regionName: `${REGION_PREFIX}${property.id}`,
        level: property.level || 1,
        licenseExpires: property.license_expires
    };
}

/**
 * Покупка имущества
 */
async function buyProperty(bot, playerNickname, propertyId, sendPrivate, sendClan) {
    const player = await database.getPlayerByNickname(playerNickname);
    if (!player) {
        return { success: false, message: formatMessage('❌', 'Вы не зарегистрированы в клане.', colors.red) };
    }
    
    const rp = await database.getRPPlayer(playerNickname);
    if (!rp) {
        return { success: false, message: formatMessage('❌', 'Вы не в RolePlay. Используйте &e/rp&r для регистрации.', colors.red) };
    }
    
    const property = await database.getProperty(propertyId);
    if (!property) {
        return { success: false, message: formatMessage('❌', `Имущество #${propertyId} не найдено.`, colors.red) };
    }
    
    if (property.owner) {
        return { success: false, message: formatMessage('❌', `Имущество #${propertyId} уже занято владельцем &e${property.owner}`, colors.red) };
    }
    
    // Проверка наличия лицензии для бизнеса/офиса
    if (property.type === 'business' || property.type === 'office') {
        const hasLicense = await checkLicense(player.id, property.type);
        if (!hasLicense) {
            const typeName = PROPERTY_TYPES[property.type];
            return { 
                success: false, 
                message: formatMessage('❌', `Для покупки ${typeName} нужна лицензия. Оформите в Discord: &e/buylicense ${property.type}`, colors.red) 
            };
        }
    }
    
    if (rp.money < property.price) {
        const needed = property.price - rp.money;
        return { 
            success: false, 
            message: formatMessage('❌', `Недостаточно средств. Нужно ещё &e${needed.toLocaleString('ru-RU')}&r ₽. Стоимость: &e${property.price.toLocaleString('ru-RU')}&r ₽`, colors.red) 
        };
    }
    
    // Формируем название региона
    const regionName = `${REGION_PREFIX}${property.id}`;
    
    // Покупка
    try {
        await database.updatePlayerMoney(playerNickname, -property.price, `Покупка имущества #${propertyId}`, 'system');
        database.getDb().prepare('UPDATE properties SET owner = ?, purchased_at = datetime("now"), last_tax_paid = datetime("now") WHERE id = ?').run(playerNickname, propertyId);
        
        // Добавляем игрока в регион
        bot.chat(`/rg addmember ${regionName} ${playerNickname}`);
        
        const typeName = PROPERTY_TYPES[property.type] || property.type;
        const typeEmoji = PROPERTY_EMOJIS[property.type] || '📦';
        
        const lines = [
            `${colors.white}${typeEmoji} &e${typeName} #${propertyId}&r успешно приобретена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Цена: ${colors.green}${property.price.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Владелец: ${colors.yellow}${playerNickname}`,
            `${colors.white}Регион: ${colors.aqua}${regionName}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Налог: ${colors.yellow}${property.weeklyTax || Math.floor(property.price * 0.01)} ₽/неделя`,
            `${colors.white}Для управления используйте &e/im`, 
            `${colors.white}Для добавления сожителей: &e/im addm [id] [ник]`
        ];
        
        const frame = createFrame(`🏠 ПОКУПКА ИМУЩЕСТВА`, lines);
        sendPrivate(playerNickname, frame);
        
        const clanLines = [
            `${colors.white}${typeEmoji} Игрок &e${playerNickname}&r приобрёл ${typeName} #${propertyId}!`,
            `${colors.white}Цена: ${colors.green}${property.price.toLocaleString('ru-RU')} ₽`
        ];
        const clanFrame = createFrame(`🏠 НОВАЯ СОБСТВЕННОСТЬ`, clanLines);
        sendClan(clanFrame);
        
        if (logCallback) logCallback(`🏠 ${playerNickname} купил ${property.type} #${propertyId} за ${property.price}₽`, 'success');
        
        return { success: true, message: `Вы успешно купили ${typeName} #${propertyId} за ${property.price.toLocaleString('ru-RU')} ₽` };
        
    } catch (err) {
        logger.error('Ошибка при покупке имущества:', err);
        return { success: false, message: formatMessage('❌', 'Ошибка при покупке. Попробуйте позже.', colors.red) };
    }
}

/**
 * Добавление/удаление сожителя
 */
async function manageCohabitant(bot, ownerNickname, propertyId, targetNickname, action, sendPrivate, sendClan) {
    const owner = await database.getPlayerByNickname(ownerNickname);
    const target = await database.getPlayerByNickname(targetNickname);
    
    if (!owner || !target) {
        return { success: false, message: formatMessage('❌', 'Игрок не найден.', colors.red) };
    }
    
    const property = await database.getProperty(propertyId);
    if (!property || property.owner !== ownerNickname) {
        return { success: false, message: formatMessage('❌', 'У вас нет такого имущества.', colors.red) };
    }
    
    if (property.type !== 'apartment' && property.type !== 'house') {
        return { success: false, message: formatMessage('❌', 'Сожителей можно добавлять только в квартиры и дома.', colors.red) };
    }
    
    const targetRp = await database.getRPPlayer(targetNickname);
    if (!targetRp) {
        return { success: false, message: formatMessage('❌', `Игрок &e${targetNickname}&r не в RolePlay.`, colors.red) };
    }
    
    let coOwners = JSON.parse(property.co_owners || '[]');
    const regionName = `${REGION_PREFIX}${property.id}`;
    const typeName = PROPERTY_TYPES[property.type] || property.type;
    const typeEmoji = PROPERTY_EMOJIS[property.type] || '🏠';
    
    if (action === 'add') {
        if (coOwners.length >= 2) {
            return { success: false, message: formatMessage('❌', 'Максимум 2 сожителя.', colors.red) };
        }
        if (coOwners.includes(targetNickname)) {
            return { success: false, message: formatMessage('⚠️', `&e${targetNickname}&r уже является сожителем.`, colors.yellow) };
        }
        
        coOwners.push(targetNickname);
        database.getDb().prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propertyId);
        bot.chat(`/rg addmember ${regionName} ${targetNickname}`);
        
        const lines = [
            `${colors.white}${typeEmoji} &e${targetNickname}&r добавлен как сожитель!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Имущество: ${colors.green}${typeName} #${propertyId}`,
            `${colors.white}Владелец: ${colors.yellow}${ownerNickname}`,
            `${colors.white}Всего сожителей: ${colors.green}${coOwners.length}/2`
        ];
        const frame = createFrame(`👥 ДОБАВЛЕНИЕ СОЖИТЕЛЯ`, lines);
        sendPrivate(ownerNickname, frame);
        
        setTimeout(() => {
            const targetLines = [
                `${colors.white}Вы добавлены как сожитель!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Имущество: ${colors.green}${typeName} #${propertyId}`,
                `${colors.white}Владелец: ${colors.yellow}${ownerNickname}`
            ];
            const targetFrame = createFrame(`🏠 НОВЫЙ СОЖИТЕЛЬ`, targetLines);
            sendPrivate(targetNickname, targetFrame);
        }, 500);
        
        if (logCallback) logCallback(`👥 ${ownerNickname} добавил ${targetNickname} как сожителя в #${propertyId}`, 'info');
        
        return { success: true, message: `Сожитель ${targetNickname} добавлен.` };
        
    } else if (action === 'remove') {
        if (!coOwners.includes(targetNickname)) {
            return { success: false, message: formatMessage('⚠️', `&e${targetNickname}&r не является сожителем.`, colors.yellow) };
        }
        
        coOwners = coOwners.filter(n => n !== targetNickname);
        database.getDb().prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propertyId);
        bot.chat(`/rg removemember ${regionName} ${targetNickname}`);
        
        const lines = [
            `${colors.white}${typeEmoji} &e${targetNickname}&r удалён из сожителей!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Имущество: ${colors.green}${typeName} #${propertyId}`,
            `${colors.white}Владелец: ${colors.yellow}${ownerNickname}`,
            `${colors.white}Осталось сожителей: ${colors.green}${coOwners.length}/2`
        ];
        const frame = createFrame(`👥 УДАЛЕНИЕ СОЖИТЕЛЯ`, lines);
        sendPrivate(ownerNickname, frame);
        
        setTimeout(() => {
            sendPrivate(targetNickname, formatMessage('⚠️', `Вы удалены из сожителей имущества #${propertyId}`, colors.yellow));
        }, 500);
        
        if (logCallback) logCallback(`👥 ${ownerNickname} удалил ${targetNickname} из сожителей #${propertyId}`, 'info');
        
        return { success: true, message: `Сожитель ${targetNickname} удалён.` };
    }
}

/**
 * Оплата налога на имущество
 */
async function payPropertyTax(bot, playerNickname, propertyId, amount, sendPrivate) {
    const player = await database.getPlayerByNickname(playerNickname);
    if (!player) {
        return { success: false, message: formatMessage('❌', 'Вы не найдены в базе данных.', colors.red) };
    }
    
    const property = await database.getProperty(propertyId);
    if (!property || property.owner !== playerNickname) {
        return { success: false, message: formatMessage('❌', 'У вас нет такого имущества.', colors.red) };
    }
    
    const taxRate = parseFloat(database.getSetting('tax_property') || '1');
    const taxDue = Math.floor(property.price * taxRate / 100);
    
    if (amount < taxDue) {
        return { 
            success: false, 
            message: formatMessage('❌', `Недостаточно для оплаты налога. Нужно &e${taxDue.toLocaleString('ru-RU')}&r ₽`, colors.red) 
        };
    }
    
    const rpPlayer = await database.getRPPlayer(playerNickname);
    if (!rpPlayer || rpPlayer.money < amount) {
        return { success: false, message: formatMessage('❌', 'Недостаточно средств.', colors.red) };
    }
    
    await database.updatePlayerMoney(playerNickname, -amount, `Налог на имущество #${propertyId}`, 'system');
    database.getDb().prepare('UPDATE properties SET last_tax_paid = datetime("now") WHERE id = ?').run(propertyId);
    
    const typeName = PROPERTY_TYPES[property.type] || property.type;
    const typeEmoji = PROPERTY_EMOJIS[property.type] || '🏠';
    
    const lines = [
        `${colors.white}${typeEmoji} Налог на &e${typeName} #${propertyId}&r оплачен!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Сумма: ${colors.green}${amount.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Требуемый налог: ${colors.yellow}${taxDue.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Следующая оплата: через &e7 дней`,
        `${colors.gold}────────────────────`,
        `${colors.white}Дата оплаты: ${colors.green}${new Date().toLocaleString('ru-RU')}`
    ];
    const frame = createFrame(`💰 ОПЛАТА НАЛОГА`, lines);
    sendPrivate(playerNickname, frame);
    
    if (logCallback) logCallback(`💰 ${playerNickname} оплатил налог ${amount}₽ за #${propertyId}`, 'info');
    
    return { success: true, message: `Налог ${amount.toLocaleString('ru-RU')} ₽ оплачен.` };
}

/**
 * Просмотр информации об имуществе
 */
async function viewPropertyInfo(bot, playerNickname, propertyId, sendPrivate) {
    const info = await getPropertyInfo(propertyId);
    if (!info) {
        return { success: false, message: formatMessage('❌', `Имущество #${propertyId} не найдено.`, colors.red) };
    }
    
    const lines = [
        `${colors.white}${info.typeEmoji} &l${info.typeName} #${info.id}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Цена: ${colors.green}${info.price.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Статус: ${info.status}`,
        `${colors.white}Владелец: ${colors.yellow}${info.owner}`,
        `${colors.white}Сожители: ${colors.white}${info.coOwnersList}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Еженедельный налог: ${colors.yellow}${info.weeklyTax.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Последняя оплата: ${colors.gray}${info.lastTaxPaid}`,
        `${colors.white}Регион: ${colors.aqua}${info.regionName}`
    ];
    
    if (info.type === 'office') {
        lines.push(`${colors.gold}────────────────────`);
        lines.push(`${colors.white}Уровень офиса: ${colors.green}${info.level}/10`);
    }
    
    if (info.licenseExpires) {
        const expiresDate = new Date(info.licenseExpires).toLocaleDateString('ru-RU');
        lines.push(`${colors.gold}────────────────────`);
        lines.push(`${colors.white}Лицензия до: ${colors.yellow}${expiresDate}`);
    }
    
    const frame = createFrame(`📋 ИНФОРМАЦИЯ ОБ ИМУЩЕСТВЕ`, lines);
    sendPrivate(playerNickname, frame);
    
    return { success: true };
}

/**
 * Список имущества игрока
 */
async function listPlayerProperties(bot, playerNickname, sendPrivate) {
    const properties = database.getDb().prepare(`
        SELECT id, type FROM properties WHERE owner = ? OR co_owners LIKE ?
    `).all(playerNickname, `%${playerNickname}%`);
    
    if (properties.length === 0) {
        sendPrivate(playerNickname, formatMessage('🏠', 'У вас нет имущества.', colors.yellow));
        return;
    }
    
    const lines = [
        `${colors.white}Имущество игрока &e${playerNickname}&r:`,
        `${colors.gold}────────────────────`
    ];
    
    for (const prop of properties) {
        const typeName = PROPERTY_TYPES[prop.type] || prop.type;
        const typeEmoji = PROPERTY_EMOJIS[prop.type] || '📦';
        lines.push(`${colors.white}• ${typeEmoji} #${prop.id} - ${colors.green}${typeName}`);
    }
    
    const frame = createFrame(`🔑 ВАШЕ ИМУЩЕСТВО`, lines);
    sendPrivate(playerNickname, frame);
}

module.exports = {
    buyProperty,
    manageCohabitant,
    payPropertyTax,
    viewPropertyInfo,
    listPlayerProperties,
    getPropertyInfo,
    checkLicense,
    PROPERTY_TYPES,
    PROPERTY_EMOJIS,
    REGION_PREFIX
};