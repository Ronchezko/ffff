// src/minecraft/commands/property.js
// Команды для управления имуществом (покупка, продажа, налоги, сожители)

const utils = require('../../shared/utils');

// ============================================
// /im [buy/info/sell] [id] - Управление имуществом
// ============================================
async function im(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /im [buy/info/sell] [id]`);
        bot.chat(`/msg ${sender} &7Также: /imflag, /imm, /imnalog`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    
    switch(action) {
        case 'buy':
            await buyProperty(bot, sender, propertyId, db, addLog);
            break;
        case 'info':
            await propertyInfo(bot, sender, propertyId, db);
            break;
        case 'sell':
            await sellProperty(bot, sender, propertyId, db, addLog);
            break;
        default:
            bot.chat(`/msg ${sender} &cНеизвестное действие. Используйте: buy, info, sell`);
    }
}

// Покупка имущества
async function buyProperty(bot, sender, propertyId, db, addLog) {
    if (!propertyId) {
        bot.chat(`/msg ${sender} &cУкажите ID имущества! Используйте /idim для просмотра.`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    if (!property.is_available) {
        bot.chat(`/msg ${sender} &cИмущество #${propertyId} уже занято!`);
        return;
    }
    
    // Проверяем, зарегистрирован ли в RP
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        bot.chat(`/msg ${sender} &cСначала зарегистрируйтесь в RolePlay через /rp!`);
        return;
    }
    
    // Проверка для бизнеса/офиса (нужна лицензия)
    if (property.type === 'business') {
        const hasLicense = await db.hasActiveLicense(sender, 'business');
        if (!hasLicense) {
            bot.chat(`/msg ${sender} &cДля покупки бизнеса нужна лицензия! Оформите в Discord.`);
            return;
        }
    }
    
    if (property.type === 'office') {
        const hasLicense = await db.hasActiveLicense(sender, 'office');
        if (!hasLicense) {
            bot.chat(`/msg ${sender} &cДля покупки офиса нужна лицензия! Оформите в Discord.`);
            return;
        }
    }
    
    // Проверяем баланс
    if (profile.money < property.price) {
        bot.chat(`/msg ${sender} &cНедостаточно средств! Нужно ${utils.formatMoney(property.price)}`);
        return;
    }
    
    // Выполняем покупку
    const result = await db.buyProperty(propertyId, sender);
    
    if (result.success) {
        // Добавляем в регион на сервере
        const regionName = `TRTR${propertyId}`;
        bot.chat(`/rg addmember ${regionName} ${sender}`);
        
        bot.chat(`/msg ${sender} &a✅ Вы успешно приобрели ${getPropertyTypeName(property.type)} #${propertyId} за ${utils.formatMoney(property.price)}`);
        bot.chat(`/cc &a🏠 ${sender} приобрёл ${getPropertyTypeName(property.type)} #${propertyId}!`);
        
        if (addLog) addLog(`🏠 ${sender} купил ${property.type} #${propertyId} за ${property.price}`, 'success');
    } else {
        bot.chat(`/msg ${sender} &c❌ Ошибка покупки: ${result.reason}`);
    }
}

// Информация об имуществе
async function propertyInfo(bot, sender, propertyId, db) {
    if (!propertyId) {
        bot.chat(`/msg ${sender} &cУкажите ID имущества!`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    const residents = await db.getPropertyResidents(propertyId);
    const taxRate = await db.getSetting('property_tax_rate') || 0.01;
    const yearlyTax = property.price * taxRate;
    const monthlyTax = yearlyTax / 12;
    
    bot.chat(`/msg ${sender} &6╔══════════════════════════════════════════╗`);
    bot.chat(`/msg ${sender} &6║ &l🏠 ИМУЩЕСТВО #${propertyId} &6║`);
    bot.chat(`/msg ${sender} &6╠══════════════════════════════════════════╣`);
    bot.chat(`/msg ${sender} &6║ &7Тип: &e${getPropertyTypeName(property.type)}`);
    bot.chat(`/msg ${sender} &6║ &7Цена покупки: &e${utils.formatMoney(property.price)}`);
    bot.chat(`/msg ${sender} &6║ &7Владелец: &e${property.owner_nick || 'Свободно'}`);
    bot.chat(`/msg ${sender} &6║ &7Налог (мес): &e${utils.formatMoney(monthlyTax)}`);
    
    if (residents && residents.length > 0) {
        bot.chat(`/msg ${sender} &6║ &7Сожители: &e${residents.join(', ')}`);
    }
    
    if (property.type === 'business') {
        const business = await db.getBusiness(propertyId);
        if (business) {
            bot.chat(`/msg ${sender} &6║ &7Доход (всего): &e${utils.formatMoney(business.total_income || 0)}`);
        }
    }
    
    if (property.type === 'office') {
        const office = await db.getOffice(propertyId);
        if (office) {
            bot.chat(`/msg ${sender} &6║ &7Уровень: &e${office.level || 4}/10`);
            bot.chat(`/msg ${sender} &6║ &7Тип офиса: &e${getOfficeTypeName(office.office_type)}`);
        }
    }
    
    bot.chat(`/msg ${sender} &6╚══════════════════════════════════════════╝`);
}

// Продажа имущества
async function sellProperty(bot, sender, propertyId, db, addLog) {
    if (!propertyId) {
        bot.chat(`/msg ${sender} &cУкажите ID имущества!`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    if (property.owner_nick !== sender) {
        bot.chat(`/msg ${sender} &cВы не являетесь владельцем этого имущества!`);
        return;
    }
    
    // Возвращаем 70% стоимости
    const refund = Math.floor(property.price * 0.7);
    await db.updateMoney(sender, refund, 'property_sell', `Продажа имущества #${propertyId}`, 'system');
    
    // Освобождаем имущество
    await db.run(`UPDATE property SET owner_nick = NULL, is_available = 1, co_owner1 = NULL, co_owner2 = NULL WHERE id = ?`, [propertyId]);
    
    // Удаляем из региона
    const regionName = `TRTR${propertyId}`;
    bot.chat(`/rg removemember ${regionName} ${sender}`);
    
    bot.chat(`/msg ${sender} &a✅ Вы продали ${getPropertyTypeName(property.type)} #${propertyId} за ${utils.formatMoney(refund)}`);
    bot.chat(`/cc &a🏠 ${sender} продал ${getPropertyTypeName(property.type)} #${propertyId}`);
    
    if (addLog) addLog(`🏠 ${sender} продал ${property.type} #${propertyId} за ${refund}`, 'info');
}

// ============================================
// /imflag [флаг] [on/off] - Управление флагами региона
// ============================================
async function imflag(bot, sender, args, db) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /imflag [флаг] [on/off]`);
        bot.chat(`/msg ${sender} &7Доступные флаги: use, item-drop`);
        return;
    }
    
    const flag = args[0].toLowerCase();
    const state = args[1].toLowerCase();
    
    // Получаем имущество игрока
    const properties = await db.getPlayerProperties(sender);
    if (!properties || properties.length === 0) {
        bot.chat(`/msg ${sender} &cУ вас нет имущества!`);
        return;
    }
    
    // Для простоты используем первое имущество
    const property = properties[0];
    const regionName = `TRTR${property.id}`;
    
    const allowDeny = state === 'on' ? 'allow' : 'deny';
    
    if (flag === 'use') {
        bot.chat(`/rg f ${regionName} use ${allowDeny}`);
        bot.chat(`/msg ${sender} &a✅ Флаг use установлен в ${state.toUpperCase()}`);
    } else if (flag === 'item-drop') {
        bot.chat(`/rg f ${regionName} item-drop ${allowDeny}`);
        bot.chat(`/msg ${sender} &a✅ Флаг item-drop установлен в ${state.toUpperCase()}`);
    } else {
        bot.chat(`/msg ${sender} &cНеизвестный флаг. Доступно: use, item-drop`);
    }
}

// ============================================
// /imm [add/del] [id] [ник] - Добавить/удалить сожителя
// ============================================
async function imm(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /imm [add/del] [id] [ник]`);
        bot.chat(`/msg ${sender} &7Добавлять сожителей можно только в квартиры и дома (макс 2)`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    const target = args[2];
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    if (property.owner_nick !== sender) {
        bot.chat(`/msg ${sender} &cВы не являетесь владельцем этого имущества!`);
        return;
    }
    
    // Проверяем тип имущества (только квартиры и дома)
    if (property.type !== 'apartment' && property.type !== 'house') {
        bot.chat(`/msg ${sender} &cСожителей можно добавлять только в квартиры и дома!`);
        return;
    }
    
    if (action === 'add') {
        // Проверяем, что игрок в клане и в RP
        const clanMember = await db.getClanMember(target);
        const rpProfile = await db.getRPProfile(target);
        
        if (!clanMember) {
            bot.chat(`/msg ${sender} &cИгрок ${target} не состоит в клане!`);
            return;
        }
        
        if (!rpProfile) {
            bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RolePlay!`);
            return;
        }
        
        // Проверяем количество сожителей
        const residents = await db.getPropertyResidents(propertyId);
        if (residents.length >= 2) {
            bot.chat(`/msg ${sender} &cНельзя добавить более 2 сожителей!`);
            return;
        }
        
        // Добавляем в БД
        await db.addPropertyResident(propertyId, target);
        
        // Добавляем в регион
        const regionName = `TRTR${propertyId}`;
        bot.chat(`/rg addmember ${regionName} ${target}`);
        
        bot.chat(`/msg ${sender} &a✅ ${target} добавлен как сожитель в имущество #${propertyId}`);
        bot.chat(`/msg ${target} &a✅ ${sender} добавил вас как сожителя в имущество #${propertyId}`);
        
        if (addLog) addLog(`🏠 ${sender} добавил сожителя ${target} в #${propertyId}`, 'info');
        
    } else if (action === 'del') {
        // Удаляем из БД
        await db.removePropertyResident(propertyId, target);
        
        // Удаляем из региона
        const regionName = `TRTR${propertyId}`;
        bot.chat(`/rg removemember ${regionName} ${target}`);
        
        bot.chat(`/msg ${sender} &a✅ ${target} удалён из сожителей имущества #${propertyId}`);
        bot.chat(`/msg ${target} &c❌ ${sender} удалил вас из сожителей имущества #${propertyId}`);
        
        if (addLog) addLog(`🏠 ${sender} удалил сожителя ${target} из #${propertyId}`, 'info');
    }
}

// ============================================
// /imnalog [info/dep] [id] [сумма] - Налог на имущество
// ============================================
async function imnalog(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /imnalog [info/dep] [id] [сумма]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const propertyId = args[1];
    const amount = parseFloat(args[2]);
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    if (property.owner_nick !== sender) {
        bot.chat(`/msg ${sender} &cВы не являетесь владельцем этого имущества!`);
        return;
    }
    
    const taxRate = await db.getSetting('property_tax_rate') || 0.01;
    const yearlyTax = property.price * taxRate;
    const monthlyTax = yearlyTax / 12;
    
    if (action === 'info') {
        const lastPay = property.last_tax_pay ? new Date(property.last_tax_pay) : null;
        const debt = property.tax_accumulated || 0;
        
        bot.chat(`/msg ${sender} &6🏠 НАЛОГ НА ИМУЩЕСТВО #${propertyId}`);
        bot.chat(`/msg ${sender} &7Ставка: &e${(taxRate * 100)}%`);
        bot.chat(`/msg ${sender} &7Налог в месяц: &e${utils.formatMoney(monthlyTax)}`);
        bot.chat(`/msg ${sender} &7Накопленный долг: &e${utils.formatMoney(debt)}`);
        if (lastPay) {
            bot.chat(`/msg ${sender} &7Последняя оплата: &e${lastPay.toLocaleDateString()}`);
        }
        
    } else if (action === 'dep') {
        if (isNaN(amount) || amount <= 0) {
            bot.chat(`/msg ${sender} &cУкажите сумму для оплаты!`);
            return;
        }
        
        const profile = await db.getRPProfile(sender);
        if (!profile || profile.money < amount) {
            bot.chat(`/msg ${sender} &cНедостаточно средств!`);
            return;
        }
        
        // Списываем деньги и обновляем налог
        await db.updateMoney(sender, -amount, 'tax', `Оплата налога за имущество #${propertyId}`, 'system');
        
        // Обновляем накопленный налог
        const currentDebt = property.tax_accumulated || 0;
        const newDebt = Math.max(0, currentDebt - amount);
        await db.run(`UPDATE property SET tax_accumulated = ?, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?`, [newDebt, propertyId]);
        
        bot.chat(`/msg ${sender} &a✅ Оплачено ${utils.formatMoney(amount)} в счёт налога за имущество #${propertyId}`);
        if (newDebt === 0) {
            bot.chat(`/msg ${sender} &a✅ Налог полностью погашен!`);
        }
        
        if (addLog) addLog(`💰 ${sender} оплатил налог ${amount} за #${propertyId}`, 'info');
    }
}

// ============================================
// /biz - Команды для бизнеса
// ============================================
async function biz(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /biz [flag/nalog/fin] [параметры]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    // Получаем бизнес игрока
    const properties = await db.getPlayerProperties(sender);
    const business = properties.find(p => p.type === 'business');
    
    if (!business) {
        bot.chat(`/msg ${sender} &cУ вас нет бизнеса!`);
        return;
    }
    
    if (action === 'flag') {
        if (args.length < 3) {
            bot.chat(`/msg ${sender} &cИспользование: /biz flag [флаг] [on/off]`);
            return;
        }
        const flag = args[1];
        const state = args[2];
        const regionName = `TRTR${business.id}`;
        const allowDeny = state === 'on' ? 'allow' : 'deny';
        bot.chat(`/rg f ${regionName} ${flag} ${allowDeny}`);
        bot.chat(`/msg ${sender} &a✅ Флаг ${flag} установлен в ${state.toUpperCase()}`);
        
    } else if (action === 'nalog') {
        if (args.length < 2) {
            bot.chat(`/msg ${sender} &cИспользование: /biz nalog [info/dep] [сумма]`);
            return;
        }
        const subAction = args[1];
        const amount = parseFloat(args[2]);
        
        if (subAction === 'info') {
            const taxRate = await db.getSetting('business_tax_rate') || 0.02;
            const yearlyTax = business.price * taxRate;
            bot.chat(`/msg ${sender} &6🏪 НАЛОГ НА БИЗНЕС #${business.id}`);
            bot.chat(`/msg ${sender} &7Ставка: &e${(taxRate * 100)}%`);
            bot.chat(`/msg ${sender} &7Налог в месяц: &e${utils.formatMoney(yearlyTax / 12)}`);
        } else if (subAction === 'dep' && !isNaN(amount)) {
            await db.updateMoney(sender, -amount, 'tax', `Оплата налога за бизнес #${business.id}`, 'system');
            bot.chat(`/msg ${sender} &a✅ Оплачено ${utils.formatMoney(amount)} налога за бизнес`);
        }
        
    } else if (action === 'fin') {
        if (args.length < 3) {
            bot.chat(`/msg ${sender} &cИспользование: /biz fin [id] [время]`);
            bot.chat(`/msg ${sender} &7Время: 1h, 1d, 1w, all`);
            return;
        }
        const bizId = args[1];
        const period = args[2];
        
        const income = await db.getBusinessIncome(bizId, period);
        bot.chat(`/msg ${sender} &6💰 ФИНАНСЫ БИЗНЕСА #${bizId} за ${period}`);
        bot.chat(`/msg ${sender} &7Доход: &e${utils.formatMoney(income)}`);
    }
}

// ============================================
// /office - Команды для офисов
// ============================================
async function office(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /office [nalog/fin/info] [параметры]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    // Получаем офис игрока
    const properties = await db.getPlayerProperties(sender);
    const officeProp = properties.find(p => p.type === 'office');
    
    if (!officeProp) {
        bot.chat(`/msg ${sender} &cУ вас нет офиса!`);
        return;
    }
    
    const office = await db.getOffice(officeProp.id);
    
    if (action === 'nalog') {
        if (args.length < 2) {
            bot.chat(`/msg ${sender} &cИспользование: /office nalog [info/dep] [сумма]`);
            return;
        }
        const subAction = args[1];
        const amount = parseFloat(args[2]);
        
        if (subAction === 'info') {
            const taxRate = await db.getSetting('office_tax_rate') || 0.015;
            const yearlyTax = officeProp.price * taxRate;
            bot.chat(`/msg ${sender} &6🏛️ НАЛОГ НА ОФИС #${officeProp.id}`);
            bot.chat(`/msg ${sender} &7Ставка: &e${(taxRate * 100)}%`);
            bot.chat(`/msg ${sender} &7Налог в месяц: &e${utils.formatMoney(yearlyTax / 12)}`);
        } else if (subAction === 'dep' && !isNaN(amount)) {
            await db.updateMoney(sender, -amount, 'tax', `Оплата налога за офис #${officeProp.id}`, 'system');
            bot.chat(`/msg ${sender} &a✅ Оплачено ${utils.formatMoney(amount)} налога за офис`);
        }
        
    } else if (action === 'fin') {
        if (args.length < 3) {
            bot.chat(`/msg ${sender} &cИспользование: /office fin [id] [время]`);
            return;
        }
        const officeId = args[1];
        const period = args[2];
        
        const income = await db.getOfficeIncome(officeId, period);
        bot.chat(`/msg ${sender} &6💰 ФИНАНСЫ ОФИСА #${officeId} за ${period}`);
        bot.chat(`/msg ${sender} &7Доход: &e${utils.formatMoney(income)}`);
        bot.chat(`/msg ${sender} &7Уровень: &e${office?.level || 4}/10`);
        
    } else if (action === 'info') {
        bot.chat(`/msg ${sender} &6🏛️ ИНФОРМАЦИЯ О ОФИСЕ #${officeProp.id}`);
        bot.chat(`/msg ${sender} &7Тип: &e${getOfficeTypeName(office?.office_type)}`);
        bot.chat(`/msg ${sender} &7Уровень: &e${office?.level || 4}/10`);
        bot.chat(`/msg ${sender} &7Доход всего: &e${utils.formatMoney(office?.total_income || 0)}`);
        
        const nextLevel = (office?.level || 4) + 1;
        const questionsNeeded = nextLevel * 5;
        bot.chat(`/msg ${sender} &7Для повышения до ${nextLevel} уровня нужно: &e${questionsNeeded} правильных ответов`);
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getPropertyTypeName(type) {
    const names = {
        'apartment': 'Квартиру',
        'house': 'Дом',
        'business': 'Бизнес',
        'office': 'Офис',
        'port': 'Порт'
    };
    return names[type] || type;
}

function getOfficeTypeName(type) {
    const names = {
        'crypto': 'Крипто-майнинг',
        'it': 'IT-разработка',
        'marketing': 'Маркетинг',
        'finance': 'Финансы',
        'legal': 'Юридические услуги'
    };
    return names[type] || type || 'Не выбран';
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