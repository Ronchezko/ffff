// src/minecraft/commands/property.js
// Команды для управления имуществом

const utils = require('../../shared/utils');
const cleanNickname = global.cleanNick(nick);
function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// /im [buy/info/sell] [id] - Управление имуществом
// ============================================

// /im [buy/in/sell] [id] - Управление имуществом
async function im(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/im [buy/in/sell] [id]`);
        await sendMessage(bot, sender, `&7&l|&f Также: &e/imflag, /imm, /imnalog`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    
    switch(action) {
        case 'buy':
            await buyProperty(bot, sender, propertyId, db, addLog);
            break;
        case 'in':
            await propertyInfo(bot, sender, propertyId, db);
            break;
        case 'sell':
            await sellProperty(bot, sender, propertyId, db, addLog);
            break;
        default:
            await sendMessage(bot, sender, `&4&l|&c Неизвестное действие. Используйте: &ebuy, in, sell`);
    }
}

async function buyProperty(bot, sender, propertyId, db, addLog) {
    if (!propertyId) {
        sendMessage(bot, sender, `&4&l|&c Укажите ID имущества! Используйте &e/idim`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
        return;
    }
    
    if (!property.is_available) {
        sendMessage(bot, sender, `&4&l|&c Имущество #&e${propertyId} &cуже занято`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        sendMessage(bot, sender, `&4&l|&c Сначала зарегистрируйтесь в RolePlay через &e/rp`);
        return;
    }
    
    // Проверка лицензии для бизнеса/офиса
    if (property.type === 'business') {
        const license = await db.get(`SELECT * FROM licenses WHERE owner_nick = ? AND type = 'business' AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`, [sender]);
        if (!license) {
            sendMessage(bot, sender, `&4&l|&c Для покупки бизнеса нужна лицензия! Оформите в Discord`);
            return;
        }
    }
    
    if (property.type === 'office') {
        const license = await db.get(`SELECT * FROM licenses WHERE owner_nick = ? AND type = 'office' AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`, [sender]);
        if (!license) {
            sendMessage(bot, sender, `&4&l|&c Для покупки офиса нужна лицензия! Оформите в Discord`);
            return;
        }
    }
    
    if (profile.money < property.price) {
        sendMessage(bot, sender, `&4&l|&c Недостаточно средств! Нужно &e${property.price.toLocaleString()}₽`);
        return;
    }
    
    const result = await db.buyProperty(propertyId, sender);
    
    if (result.success) {
        const regionName = `TRTR${propertyId}`;
        bot.chat(`/rg addmember ${regionName} ${sender}`);
        
        sendMessage(bot, sender, `&a&l|&f Вы приобрели ${property.type} #&e${propertyId} &aза &e${property.price.toLocaleString()}₽`);
        bot.chat(`/cc &a🏠 ${sender} приобрёл ${property.type} #${propertyId}`);
        if (addLog) addLog(`🏠 ${sender} купил ${property.type} #${propertyId} за ${property.price}`, 'success');
    } else {
        sendMessage(bot, sender, `&4&l|&c Ошибка покупки: ${result.reason}`);
    }
}

async function propertyInfo(bot, sender, propertyId, db) {
    if (!propertyId) {
        sendMessage(bot, sender, `&4&l|&c Укажите ID имущества`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
        return;
    }
    
    const taxRate = await db.getSetting('property_tax_rate') || 0.01;
    const monthlyTax = property.price * taxRate / 12;
    
    sendMessage(bot, sender, `&a&l|&f Имущество #&e${property.id} &7| ${property.type}`);
    sendMessage(bot, sender, `&7&l|&f Цена: &e${property.price.toLocaleString()}₽ &7| Налог: &e${monthlyTax.toLocaleString()}₽/мес`);
    sendMessage(bot, sender, `&7&l|&f Владелец: &e${property.owner_nick || 'Свободно'}`);
}

async function sellProperty(bot, sender, propertyId, db, addLog) {
    if (!propertyId) {
        sendMessage(bot, sender, `&4&l|&c Укажите ID имущества`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property || property.owner_nick !== sender) {
        sendMessage(bot, sender, `&4&l|&c Вы не являетесь владельцем этого имущества`);
        return;
    }
    
    const refund = Math.floor(property.price * 0.7);
    await db.updateMoney(sender, refund, 'property_sell', `Продажа имущества #${propertyId}`, 'system');
    await db.run(`UPDATE property SET owner_nick = NULL, is_available = 1, co_owner1 = NULL, co_owner2 = NULL WHERE id = ?`, [propertyId]);
    
    const regionName = `TRTR${propertyId}`;
    bot.chat(`/rg removemember ${regionName} ${sender}`);
    
    sendMessage(bot, sender, `&a&l|&f Вы продали ${property.type} #&e${propertyId} &aза &e${refund.toLocaleString()}₽`);
    bot.chat(`/cc &a🏠 ${sender} продал ${property.type} #${propertyId}`);
    if (addLog) addLog(`🏠 ${sender} продал ${property.type} #${propertyId} за ${refund}`, 'info');
}

// ============================================
// /imflag [флаг] [on/off] - Управление флагами
// ============================================

async function imflag(bot, sender, args, db) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/imflag [флаг] [on/off]`);
        sendMessage(bot, sender, `&7&l|&f Доступные флаги: &euse, item-drop`);
        return;
    }
    
    const properties = await db.getPlayerProperties(sender);
    if (!properties || properties.length === 0) {
        sendMessage(bot, sender, `&4&l|&c У вас нет имущества`);
        return;
    }
    
    const property = properties[0];
    const regionName = `TRTR${property.id}`;
    const flag = args[0].toLowerCase();
    const state = args[1].toLowerCase();
    const allowDeny = state === 'on' ? 'allow' : 'deny';
    
    if (flag === 'use' || flag === 'item-drop') {
        bot.chat(`/rg f ${regionName} ${flag} ${allowDeny}`);
        sendMessage(bot, sender, `&a&l|&f Флаг &e${flag} &aустановлен в &e${state.toUpperCase()}`);
    } else {
        sendMessage(bot, sender, `&4&l|&c Неизвестный флаг. Доступно: &euse, item-drop`);
    }
}

// ============================================
// /imm [add/del] [id] [ник] - Сожители
// ============================================

async function imm(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/imm [add/del] [id] [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    const target = args[2];
    
    const property = await db.getProperty(propertyId);
    if (!property || property.owner_nick !== sender) {
        sendMessage(bot, sender, `&4&l|&c Вы не являетесь владельцем этого имущества`);
        return;
    }
    
    if (property.type !== 'apartment' && property.type !== 'house') {
        sendMessage(bot, sender, `&4&l|&c Сожителей можно добавлять только в квартиры и дома`);
        return;
    }
    
    if (action === 'add') {
        const clanMember = await db.getClanMember(target);
        const rpProfile = await db.getRPProfile(target);
        
        if (!clanMember) {
            sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в клане`);
            return;
        }
        if (!rpProfile) {
            sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay`);
            return;
        }
        
        const residents = await db.all(`SELECT resident_nick FROM property_residents WHERE property_id = ?`, [propertyId]);
        if (residents.length >= 2) {
            sendMessage(bot, sender, `&4&l|&c Нельзя добавить более 2 сожителей`);
            return;
        }
        
        await db.run(`INSERT OR REPLACE INTO property_residents (property_id, resident_nick, added_by, is_active) VALUES (?, ?, ?, 1)`, [propertyId, target, sender]);
        bot.chat(`/rg addmember TRTR${propertyId} ${target}`);
        
        sendMessage(bot, sender, `&a&l|&f ${target} &aдобавлен как сожитель в имущество #&e${propertyId}`);
        sendMessage(bot, target, `&a&l|&f ${sender} добавил вас как сожителя в имущество #&e${propertyId}`);
        if (addLog) addLog(`🏠 ${sender} добавил сожителя ${target} в #${propertyId}`, 'info');
        
    } else if (action === 'del') {
        await db.run(`DELETE FROM property_residents WHERE property_id = ? AND resident_nick = ?`, [propertyId, target]);
        bot.chat(`/rg removemember TRTR${propertyId} ${target}`);
        
        sendMessage(bot, sender, `&a&l|&f ${target} &aудалён из сожителей имущества #&e${propertyId}`);
        sendMessage(bot, target, `&c&l|&f ${sender} удалил вас из сожителей имущества #&e${propertyId}`);
        if (addLog) addLog(`🏠 ${sender} удалил сожителя ${target} из #${propertyId}`, 'info');
    }
}

// ============================================
// /imnalog [info/dep] [id] [сумма] - Налог
// ============================================

async function imnalog(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/imnalog [info/dep] [id] [сумма]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    const amount = parseFloat(args[2]);
    
    const property = await db.getProperty(propertyId);
    if (!property || property.owner_nick !== sender) {
        sendMessage(bot, sender, `&4&l|&c Вы не являетесь владельцем этого имущества`);
        return;
    }
    
    const taxRate = await db.getSetting('property_tax_rate') || 0.01;
    const monthlyTax = property.price * taxRate / 12;
    
    if (action === 'info') {
        sendMessage(bot, sender, `&a&l|&f Налог на имущество #&e${propertyId}`);
        sendMessage(bot, sender, `&7&l|&f Ставка: &e${(taxRate * 100)}% &7| Налог в месяц: &e${monthlyTax.toLocaleString()}₽`);
        sendMessage(bot, sender, `&7&l|&f Долг: &e${(property.tax_accumulated || 0).toLocaleString()}₽`);
    } else if (action === 'dep') {
        if (isNaN(amount) || amount <= 0) {
            sendMessage(bot, sender, `&4&l|&c Укажите сумму для оплаты`);
            return;
        }
        
        const profile = await db.getRPProfile(sender);
        if (!profile || profile.money < amount) {
            sendMessage(bot, sender, `&4&l|&c Недостаточно средств`);
            return;
        }
        
        await db.updateMoney(sender, -amount, 'tax', `Оплата налога за имущество #${propertyId}`, 'system');
        
        const currentDebt = property.tax_accumulated || 0;
        const newDebt = Math.max(0, currentDebt - amount);
        await db.run(`UPDATE property SET tax_accumulated = ?, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?`, [newDebt, propertyId]);
        
        sendMessage(bot, sender, `&a&l|&f Оплачено &e${amount.toLocaleString()}₽ &aв счёт налога за имущество #&e${propertyId}`);
        if (newDebt === 0) sendMessage(bot, sender, `&a&l|&f Налог полностью погашен`);
        if (addLog) addLog(`💰 ${sender} оплатил налог ${amount} за #${propertyId}`, 'info');
    }
}

// ============================================
// /biz - Команды для бизнеса
// ============================================

async function biz(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/biz [flag/nalog/fin] [параметры]`);
        return;
    }
    
    const properties = await db.getPlayerProperties(sender);
    const business = properties?.find(p => p.type === 'business');
    
    if (!business) {
        sendMessage(bot, sender, `&4&l|&c У вас нет бизнеса`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'flag') {
        if (args.length < 3) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/biz flag [флаг] [on/off]`);
            return;
        }
        const flag = args[1];
        const state = args[2];
        const regionName = `TRTR${business.id}`;
        const allowDeny = state === 'on' ? 'allow' : 'deny';
        bot.chat(`/rg f ${regionName} ${flag} ${allowDeny}`);
        sendMessage(bot, sender, `&a&l|&f Флаг &e${flag} &aустановлен в &e${state.toUpperCase()}`);
        
    } else if (action === 'nalog') {
        if (args.length < 2) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/biz nalog [info/dep] [сумма]`);
            return;
        }
        const subAction = args[1];
        const amount = parseFloat(args[2]);
        
        if (subAction === 'info') {
            const taxRate = await db.getSetting('business_tax_rate') || 0.02;
            const monthlyTax = business.price * taxRate / 12;
            sendMessage(bot, sender, `&a&l|&f Налог на бизнес #&e${business.id}`);
            sendMessage(bot, sender, `&7&l|&f Ставка: &e${(taxRate * 100)}% &7| Налог в месяц: &e${monthlyTax.toLocaleString()}₽`);
        } else if (subAction === 'dep' && !isNaN(amount)) {
            await db.updateMoney(sender, -amount, 'tax', `Оплата налога за бизнес #${business.id}`, 'system');
            sendMessage(bot, sender, `&a&l|&f Оплачено &e${amount.toLocaleString()}₽ &aналога за бизнес`);
        }
        
    } else if (action === 'fin') {
        if (args.length < 3) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/biz fin [id] [время]`);
            sendMessage(bot, sender, `&7&l|&f Время: &e1h, 1d, 1w, all`);
            return;
        }
        const bizId = args[1];
        const period = args[2];
        
        const businessData = await db.get(`SELECT total_income FROM businesses WHERE property_id = ?`, [bizId]);
        sendMessage(bot, sender, `&a&l|&f Финансы бизнеса #&e${bizId} &7(${period})`);
        sendMessage(bot, sender, `&7&l|&f Доход: &e${businessData?.total_income?.toLocaleString() || 0}₽`);
    }
}

// ============================================
// /office - Команды для офисов
// ============================================

async function office(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/office [nalog/fin/info] [параметры]`);
        return;
    }
    
    const properties = await db.getPlayerProperties(sender);
    const officeProp = properties?.find(p => p.type === 'office');
    
    if (!officeProp) {
        sendMessage(bot, sender, `&4&l|&c У вас нет офиса`);
        return;
    }
    
    const officeData = await db.get(`SELECT * FROM offices WHERE property_id = ?`, [officeProp.id]);
    const action = args[0].toLowerCase();
    
    if (action === 'nalog') {
        if (args.length < 2) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/office nalog [info/dep] [сумма]`);
            return;
        }
        const subAction = args[1];
        const amount = parseFloat(args[2]);
        
        if (subAction === 'info') {
            const taxRate = await db.getSetting('office_tax_rate') || 0.015;
            const monthlyTax = officeProp.price * taxRate / 12;
            sendMessage(bot, sender, `&a&l|&f Налог на офис #&e${officeProp.id}`);
            sendMessage(bot, sender, `&7&l|&f Ставка: &e${(taxRate * 100)}% &7| Налог в месяц: &e${monthlyTax.toLocaleString()}₽`);
        } else if (subAction === 'dep' && !isNaN(amount)) {
            await db.updateMoney(sender, -amount, 'tax', `Оплата налога за офис #${officeProp.id}`, 'system');
            sendMessage(bot, sender, `&a&l|&f Оплачено &e${amount.toLocaleString()}₽ &aналога за офис`);
        }
        
    } else if (action === 'fin') {
        if (args.length < 3) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/office fin [id] [время]`);
            return;
        }
        const officeId = args[1];
        const period = args[2];
        
        sendMessage(bot, sender, `&a&l|&f Финансы офиса #&e${officeId} &7(${period})`);
        sendMessage(bot, sender, `&7&l|&f Доход: &e${officeData?.total_income?.toLocaleString() || 0}₽`);
        sendMessage(bot, sender, `&7&l|&f Уровень: &e${officeData?.level || 4}/10`);
        
    } else if (action === 'info') {
        sendMessage(bot, sender, `&a&l|&f Офис #&e${officeProp.id}`);
        sendMessage(bot, sender, `&7&l|&f Тип: &e${officeData?.office_type || 'Не выбран'} &7| Уровень: &e${officeData?.level || 4}/10`);
        sendMessage(bot, sender, `&7&l|&f Доход всего: &e${officeData?.total_income?.toLocaleString() || 0}₽`);
        
        const nextLevel = (officeData?.level || 4) + 1;
        const questionsNeeded = nextLevel * 5;
        sendMessage(bot, sender, `&7&l|&f Для повышения до ${nextLevel} уровня нужно: &e${questionsNeeded} &7правильных ответов`);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    im,
    imflag,
    imm,
    imnalog,
    biz,
    office
};