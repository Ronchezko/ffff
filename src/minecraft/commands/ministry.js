// src/minecraft/commands/ministry.js
// Команды для министров

const utils = require('../../shared/utils');

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// МИНИСТР ЭКОНОМИКИ
// ============================================

// /org/o tax set [тип] [ставка] - Установить налог
async function taxSet(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o tax set [тип] [ставка]`);
        sendMessage(bot, sender, `&7&l|&f Типы: &eproperty, business, office`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const type = args[0].toLowerCase();
    const rate = parseFloat(args[1]);
    
    if (isNaN(rate) || rate < 0 || rate > 100) {
        sendMessage(bot, sender, `&4&l|&c Ставка должна быть от 0 до 100`);
        return;
    }
    
    const settingKey = `${type}_tax_rate`;
    await db.setSetting(settingKey, (rate / 100).toString(), sender);
    
    sendMessage(bot, sender, `&a&l|&f Налог на &e${type} &aустановлен на &e${rate}%`);
    bot.chat(`/cc &a💰 Министр экономики ${sender} установил налог на ${type} ${rate}%`);
    if (addLog) addLog(`💰 ${sender} установил налог ${type} ${rate}%`, 'info');
}

// /org/o tax list - Список налогов
async function taxList(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const propertyTax = (await db.getSetting('property_tax_rate') || 0.01) * 100;
    const businessTax = (await db.getSetting('business_tax_rate') || 0.02) * 100;
    const officeTax = (await db.getSetting('office_tax_rate') || 0.015) * 100;
    
    sendMessage(bot, sender, `&a&l|&f Текущие налоги:`);
    sendMessage(bot, sender, `&7&l|&f Недвижимость: &e${propertyTax}%`);
    sendMessage(bot, sender, `&7&l|&f Бизнес: &e${businessTax}%`);
    sendMessage(bot, sender, `&7&l|&f Офисы: &e${officeTax}%`);
}

// /org/o budget - Бюджет города
async function budget(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const cityBudget = await db.getSetting('city_budget') || 10000000;
    sendMessage(bot, sender, `&a&l|&f Бюджет города: &e${parseInt(cityBudget).toLocaleString()}₽`);
}

// /org/o bonus [процент] - Установить бонус к зарплатам
async function bonus(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o bonus [процент]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const percent = parseInt(args[0]);
    if (isNaN(percent) || percent < 0 || percent > 100) {
        sendMessage(bot, sender, `&4&l|&c Процент должен быть от 0 до 100`);
        return;
    }
    
    await db.setSetting('salary_bonus', percent.toString(), sender);
    sendMessage(bot, sender, `&a&l|&f Бонус к зарплатам установлен на &e${percent}%`);
    bot.chat(`/cc &a💰 Министр экономики ${sender} установил бонус к зарплатам ${percent}%`);
    if (addLog) addLog(`💰 ${sender} установил бонус зарплат ${percent}%`, 'info');
}

// /org/o grant [ник] [сумма] [причина] - Выдать грант
async function grant(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o grant [ник] [сумма] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount <= 0) {
        sendMessage(bot, sender, `&4&l|&c Укажите корректную сумму`);
        return;
    }
    
    const cityBudget = parseInt(await db.getSetting('city_budget') || 10000000);
    if (cityBudget < amount) {
        sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете города`);
        return;
    }
    
    await db.setSetting('city_budget', (cityBudget - amount).toString(), sender);
    await db.updateMoney(target, amount, 'grant', `Грант от правительства: ${reason}`, sender);
    
    sendMessage(bot, sender, `&a&l|&f Выдан грант &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
    sendMessage(bot, target, `&a&l|&f Вы получили грант &e${amount.toLocaleString()}₽ &aот правительства. Причина: &e${reason}`);
    bot.chat(`/cc &a💰 ${target} получил грант ${amount.toLocaleString()}₽ от правительства`);
    if (addLog) addLog(`💰 ${sender} выдал грант ${amount} ${target} (${reason})`, 'info');
}

// /org/o id set [цена] - Изменить цену на имущество
async function idSet(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o id set [id] [цена]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const propertyId = args[0];
    const price = parseInt(args[1]);
    
    if (isNaN(price) || price <= 0) {
        sendMessage(bot, sender, `&4&l|&c Укажите корректную цену`);
        return;
    }
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
        return;
    }
    
    await db.run(`UPDATE property SET price = ? WHERE id = ?`, [price, propertyId]);
    
    sendMessage(bot, sender, `&a&l|&f Цена имущества #&e${propertyId} &aизменена на &e${price.toLocaleString()}₽`);
    bot.chat(`/cc &a💰 Министр экономики ${sender} изменил цену имущества #${propertyId}`);
    if (addLog) addLog(`💰 ${sender} изменил цену имущества #${propertyId} на ${price}`, 'info');
}

// /org/o im [ник] [id] - Забрать имущество
async function imTake(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o im [ник] [id]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const propertyId = args[1];
    
    const property = await db.getProperty(propertyId);
    if (!property || property.owner_nick !== target) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне владеет имуществом #&e${propertyId}`);
        return;
    }
    
    await db.run(`UPDATE property SET owner_nick = NULL, is_available = 1, co_owner1 = NULL, co_owner2 = NULL WHERE id = ?`, [propertyId]);
    
    const regionName = `TRTR${propertyId}`;
    bot.chat(`/rg removemember ${regionName} ${target}`);
    
    sendMessage(bot, sender, `&a&l|&f Имущество #&e${propertyId} &aизъято у &e${target}`);
    sendMessage(bot, target, `&c&l|&f У вас изъято имущество #&e${propertyId} &cправительством`);
    bot.chat(`/cc &c🏠 Имущество #${propertyId} изъято у ${target} правительством`);
    if (addLog) addLog(`🏠 ${sender} изъял имущество #${propertyId} у ${target}`, 'warn');
}

// ============================================
// МИНИСТР ОБОРОНЫ
// ============================================

// /org/o budget - Бюджет обороны
async function defenseBudget(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const budget = await db.getSetting('defense_budget') || 1000000;
    sendMessage(bot, sender, `&a&l|&f Бюджет Министерства обороны: &e${parseInt(budget).toLocaleString()}₽`);
}

// /org/o status - Статус армии
async function armyStatus(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const members = await db.getOrgMembers('army');
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    const alertLevel = await db.getSetting('alert_level') || 'Бета';
    
    sendMessage(bot, sender, `&a&l|&f Статус армии Resistance`);
    sendMessage(bot, sender, `&7&l|&f Сотрудников: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
    sendMessage(bot, sender, `&7&l|&f Уровень тревоги: &e${alertLevel}`);
}

// ============================================
// МИНИСТР МВД
// ============================================

// /org/o budget - Бюджет МВД
async function mvdBudget(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const budget = await db.getSetting('mvd_budget') || 1000000;
    sendMessage(bot, sender, `&a&l|&f Бюджет МВД: &e${parseInt(budget).toLocaleString()}₽`);
}

// /org/o status - Статус МВД
async function mvdStatus(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const members = await db.getOrgMembers('police');
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    
    sendMessage(bot, sender, `&a&l|&f Статус МВД Resistance`);
    sendMessage(bot, sender, `&7&l|&f Сотрудников: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
}

// /org/o crime list - Список нарушений
async function crimeList(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const punishments = await db.all(`SELECT player, COUNT(*) as count FROM punishments WHERE type = 'mute' AND active = 1 GROUP BY player ORDER BY count DESC LIMIT 10`);
    
    if (!punishments || punishments.length === 0) {
        sendMessage(bot, sender, `&4&l|&c Нет активных нарушителей`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Топ нарушителей:`);
    for (let i = 0; i < punishments.length; i++) {
        sendMessage(bot, sender, `&7&l|&f ${i+1}. ${punishments[i].player} &7- &e${punishments[i].count} &7нарушений`);
    }
}

// ============================================
// МИНИСТР ЗДРАВООХРАНЕНИЯ
// ============================================

// /org/o budget - Бюджет здравоохранения
async function healthBudget(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const budget = await db.getSetting('health_budget') || 1000000;
    sendMessage(bot, sender, `&a&l|&f Бюджет Министерства здравоохранения: &e${parseInt(budget).toLocaleString()}₽`);
}

// /org/o status - Статус больницы
async function hospitalStatus(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const members = await db.getOrgMembers('hospital');
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    const redCode = await db.getSetting('redcode_active') === 'true';
    
    sendMessage(bot, sender, `&a&l|&f Статус больницы Resistance`);
    sendMessage(bot, sender, `&7&l|&f Сотрудников: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
    sendMessage(bot, sender, `&7&l|&f Красный код: &e${redCode ? 'АКТИВЕН' : 'НЕ АКТИВЕН'}`);
}

// ============================================
// МИНИСТР ОБРАЗОВАНИЯ
// ============================================

// /org/o budget - Бюджет образования
async function eduBudget(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const budget = await db.getSetting('edu_budget') || 1000000;
    sendMessage(bot, sender, `&a&l|&f Бюджет Министерства образования: &e${parseInt(budget).toLocaleString()}₽`);
}

// /org/o status - Статус академии
async function academyStatus(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const members = await db.getOrgMembers('academy');
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    const graduates = await db.get(`SELECT COUNT(*) as count FROM rp_players WHERE has_education = 1`);
    
    sendMessage(bot, sender, `&a&l|&f Статус академии Resistance`);
    sendMessage(bot, sender, `&7&l|&f Преподавателей: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
    sendMessage(bot, sender, `&7&l|&f Выпускников: &e${graduates?.count || 0}`);
}

// ============================================
// МЭР ГОРОДА
// ============================================

// Мэр имеет доступ ко всем командам выше
// Дополнительные команды мэра

async function mayorKick(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/mayor kick [ник] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'government') {
        sendMessage(bot, sender, `&4&l|&c Только правительство может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ') || 'Не указана';
    
    await db.removeClanMember(target);
    await db.run(`UPDATE rp_players SET is_frozen = 1, structure = 'Гражданин', job_rank = 'Нет' WHERE minecraft_nick = ?`, [target]);
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aизгнан из города`);
    sendMessage(bot, target, `&c&l|&f Вы изгнаны из города Resistance. Причина: &e${reason}`);
    bot.chat(`/cc &c👑 ${target} изгнан из города мэром ${sender}`);
    if (addLog) addLog(`👑 ${sender} изгнал ${target} из города`, 'warn');
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    // Министр экономики
    taxSet,
    taxList,
    budget,
    bonus,
    grant,
    idSet,
    imTake,
    // Министр обороны
    defenseBudget,
    armyStatus,
    // Министр МВД
    mvdBudget,
    mvdStatus,
    crimeList,
    // Министр здравоохранения
    healthBudget,
    hospitalStatus,
    // Министр образования
    eduBudget,
    academyStatus,
    // Мэр
    mayorKick
};