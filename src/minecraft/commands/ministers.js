// src/minecraft/commands/ministers.js
const database = require('../../database');
const permissions = require('../../shared/permissions');
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

// Министерские должности
const MINISTER_RANKS = {
    economy: 'Министр экономики',
    defense: 'Министр обороны',
    mvd: 'Министр МВД',
    health: 'Министр здравоохранения',
    education: 'Министр образования'
};

// Проверка, является ли игрок министром
async function isMinister(playerId, ministry) {
    const rp = await database.getRPPlayerById(playerId);
    if (!rp) return false;
    return rp.profession === MINISTER_RANKS[ministry];
}

// Проверка, является ли игрок мэром
async function isMayor(playerId) {
    const rp = await database.getRPPlayerById(playerId);
    if (!rp) return false;
    return rp.profession === 'Мэр';
}

/**
 * /mintax - управление налогами (Министр экономики)
 */
async function mintax(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isEconomyMinister = await isMinister(member.id, 'economy');
    const isMayorRole = await isMayor(member.id);
    
    if (!isEconomyMinister && !isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМинистр экономики&r или &eМэр&r могут использовать эту команду!', colors.red));
        return;
    }
    
    if (args.length < 1) {
        const lines = [
            `${colors.white}Управление налогами`,
            `${colors.gold}────────────────────`,
            `${colors.white}Установить налог: &e/mintax set [тип] [ставка]`,
            `${colors.white}Список налогов: &e/mintax list`,
            `${colors.gold}────────────────────`,
            `${colors.white}Доступные типы: &eproperty&r (имущество), &ebusiness&r (бизнес), &eoffice&r (офис)`,
            `${colors.white}Ставка: от &e0&r до &e1&r (например, 0.05 = 5%)`
        ];
        const frame = createFrame(`💰 НАЛОГИ`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const sub = args[0].toLowerCase();
    
    if (sub === 'set' && args.length >= 3) {
        const taxType = args[1].toLowerCase();
        const rate = parseFloat(args[2]);
        
        if (isNaN(rate) || rate < 0 || rate > 1) {
            sendPrivate(player, formatMessage('❌', 'Ставка налога должна быть от &e0&r до &e1', colors.red));
            return;
        }
        
        const validTypes = ['property', 'business', 'office'];
        if (!validTypes.includes(taxType)) {
            sendPrivate(player, formatMessage('❌', `Доступные типы: ${validTypes.join(', ')}`, colors.red));
            return;
        }
        
        database.setSetting(`tax_${taxType}`, rate.toString());
        
        const lines = [
            `${colors.white}Ставка налога &e${taxType}&r успешно изменена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Новая ставка: ${colors.green}${(rate * 100).toFixed(1)}%`,
            `${colors.white}Установил: ${colors.yellow}${player}`,
            `${colors.white}Дата: ${colors.green}${new Date().toLocaleString('ru-RU')}`
        ];
        const frame = createFrame(`💰 НАЛОГИ`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`💰 ${player} установил налог ${taxType} = ${rate * 100}%`, 'info');
        
    } else if (sub === 'list') {
        const taxes = database.getDb().prepare("SELECT key, value FROM settings WHERE key LIKE 'tax_%'").all();
        
        if (taxes.length === 0) {
            sendPrivate(player, formatMessage('ℹ️', 'Налоги не настроены.', colors.yellow));
            return;
        }
        
        const lines = [
            `${colors.white}Текущие налоговые ставки:`,
            `${colors.gold}────────────────────`
        ];
        
        for (const tax of taxes) {
            const taxName = tax.key.replace('tax_', '');
            const rate = (parseFloat(tax.value) * 100).toFixed(1);
            lines.push(`${colors.white}• ${taxName}: ${colors.green}${rate}%`);
        }
        
        const frame = createFrame(`💰 НАЛОГИ`, lines);
        sendPrivate(player, frame);
        
    } else {
        sendPrivate(player, formatMessage('❌', `Используйте &e/mintax set [тип] [ставка]&r или &e/mintax list`, colors.red));
    }
}

/**
 * /budget - просмотр бюджета города (Министр экономики)
 */
async function budget(bot, player, args, db, logCallback, sendPrivate) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isEconomyMinister = await isMinister(member.id, 'economy');
    const isMayorRole = await isMayor(member.id);
    
    if (!isEconomyMinister && !isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМинистр экономики&r или &eМэр&r могут использовать эту команду!', colors.red));
        return;
    }
    
    const cityBudget = parseInt(database.getSetting('city_budget') || '0');
    const mvdBudget = parseInt(database.getSetting('mvd_budget') || '0');
    const armyBudget = parseInt(database.getSetting('army_budget') || '0');
    const healthBudget = parseInt(database.getSetting('health_budget') || '0');
    const educationBudget = parseInt(database.getSetting('education_budget') || '0');
    
    const totalBudget = cityBudget + mvdBudget + armyBudget + healthBudget + educationBudget;
    
    const lines = [
        `${colors.white}Бюджет города: ${colors.green}${totalBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.gold}────────────────────`,
        `${colors.white}• Городской бюджет: ${colors.green}${cityBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.white}• МВД: ${colors.green}${mvdBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.white}• Армия: ${colors.green}${armyBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.white}• Здравоохранение: ${colors.green}${healthBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.white}• Образование: ${colors.green}${educationBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.gold}────────────────────`,
        `${colors.white}Последнее обновление: ${colors.yellow}${new Date().toLocaleString('ru-RU')}`
    ];
    const frame = createFrame(`💰 БЮДЖЕТ ГОРОДА`, lines);
    sendPrivate(player, frame);
}

/**
 * /grant - выдача гранта (Министр экономики)
 */
async function grant(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isEconomyMinister = await isMinister(member.id, 'economy');
    const isMayorRole = await isMayor(member.id);
    
    if (!isEconomyMinister && !isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМинистр экономики&r или &eМэр&r могут использовать эту команду!', colors.red));
        return;
    }
    
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/grant [ник] [сумма] [причина]`, colors.red));
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'Грант от города';
    
    if (isNaN(amount) || amount <= 0) {
        sendPrivate(player, formatMessage('❌', 'Сумма должна быть положительным числом!', colors.red));
        return;
    }
    
    if (amount > 500000) {
        sendPrivate(player, formatMessage('❌', 'Максимальная сумма гранта &e500 000&r ₽', colors.red));
        return;
    }
    
    const targetPlayer = await database.getPlayerByNickname(target);
    if (!targetPlayer) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    const cityBudget = parseInt(database.getSetting('city_budget') || '0');
    if (cityBudget < amount) {
        sendPrivate(player, formatMessage('❌', `Недостаточно средств в бюджете. Доступно: &e${cityBudget.toLocaleString('ru-RU')}&r ₽`, colors.red));
        return;
    }
    
    // Списываем с бюджета
    database.setSetting('city_budget', (cityBudget - amount).toString());
    await database.updatePlayerMoney(target, amount, `Грант от города: ${reason}`, player);
    
    const lines = [
        `${colors.white}Грант &e${amount.toLocaleString('ru-RU')}&r ₽ выдан &e${target}!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Причина: ${colors.green}${reason}`,
        `${colors.white}Выдал: ${colors.yellow}${player}`,
        `${colors.white}Остаток бюджета: ${colors.green}${(cityBudget - amount).toLocaleString('ru-RU')} ₽`
    ];
    const frame = createFrame(`🎁 ГРАНТ`, lines);
    sendClan(frame);
    
    setTimeout(() => {
        const targetLines = [
            `${colors.white}Вы получили грант от города!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Сумма: ${colors.green}${amount.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Причина: ${colors.yellow}${reason}`,
            `${colors.white}Выдал: ${colors.yellow}${player}`
        ];
        const targetFrame = createFrame(`🎁 ГРАНТ`, targetLines);
        sendPrivate(target, targetFrame);
    }, 500);
    
    if (logCallback) logCallback(`🎁 ${player} выдал грант ${amount}₽ игроку ${target}`, 'info');
}

/**
 * /armystatus - статус армии (Министр обороны)
 */
async function armystatus(bot, player, args, db, logCallback, sendPrivate) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isDefenseMinister = await isMinister(member.id, 'defense');
    const isMayorRole = await isMayor(member.id);
    
    if (!isDefenseMinister && !isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМинистр обороны&r или &eМэр&r могут использовать эту команду!', colors.red));
        return;
    }
    
    const armyCount = database.getDb().prepare("SELECT COUNT(*) as cnt FROM rp_players WHERE structure = 'Армия'").get().cnt;
    const alertLevel = database.getSetting('alert_level') || 'Альфа';
    const armyBudget = parseInt(database.getSetting('army_budget') || '0');
    
    const levelColors = {
        'Альфа': colors.green,
        'Бета': colors.yellow,
        'Омега': colors.red
    };
    
    const lines = [
        `${colors.white}Статус армии:`,
        `${colors.gold}────────────────────`,
        `${colors.white}Личный состав: ${colors.green}${armyCount} человек`,
        `${colors.white}Уровень тревоги: ${levelColors[alertLevel] || colors.white}${alertLevel}`,
        `${colors.white}Бюджет: ${colors.green}${armyBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.gold}────────────────────`,
        `${colors.white}Готовность: ${armyCount > 0 ? colors.green + 'БОЕВАЯ' : colors.red + 'КРИТИЧЕСКАЯ'}`
    ];
    const frame = createFrame(`⚔️ СТАТУС АРМИИ`, lines);
    sendPrivate(player, frame);
}

/**
 * /mvdbudget - бюджет МВД (Министр МВД)
 */
async function mvdbudget(bot, player, args, db, logCallback, sendPrivate) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isMvdMinister = await isMinister(member.id, 'mvd');
    const isMayorRole = await isMayor(member.id);
    
    if (!isMvdMinister && !isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМинистр МВД&r или &eМэр&r могут использовать эту команду!', colors.red));
        return;
    }
    
    const mvdBudget = parseInt(database.getSetting('mvd_budget') || '0');
    const policeCount = database.getDb().prepare("SELECT COUNT(*) as cnt FROM rp_players WHERE structure = 'Полиция'").get().cnt;
    const finesToday = database.getDb().prepare("SELECT COUNT(*) as cnt FROM money_logs WHERE reason LIKE '%штраф%' AND date(timestamp) = date('now')").get().cnt;
    
    const lines = [
        `${colors.white}Бюджет МВД: ${colors.green}${mvdBudget.toLocaleString('ru-RU')} ₽`,
        `${colors.gold}────────────────────`,
        `${colors.white}Сотрудников: ${colors.green}${policeCount} человек`,
        `${colors.white}Штрафов сегодня: ${colors.yellow}${finesToday}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Средства направлены на:`,
        `${colors.white}• Зарплаты сотрудникам`,
        `${colors.white}• Закупку техники`,
        `${colors.white}• Оперативные мероприятия`
    ];
    const frame = createFrame(`🚔 БЮДЖЕТ МВД`, lines);
    sendPrivate(player, frame);
}

/**
 * /mayor - команды мэра
 */
async function mayor(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не найдены в базе данных.', colors.red));
        return;
    }
    
    const isMayorRole = await isMayor(member.id);
    if (!isMayorRole) {
        sendPrivate(player, formatMessage('❌', 'Только &eМэр&r города может использовать эту команду!', colors.red));
        return;
    }
    
    if (args.length < 1) {
        const lines = [
            `${colors.white}Команды мэра:`,
            `${colors.gold}────────────────────`,
            `${colors.white}Изменить цену имущества: &e/mayor setprice [id] [цена]`,
            `${colors.white}Изгнать игрока: &e/mayor exile [ник] [причина]`,
            `${colors.white}Установить налог: &e/mayor tax [тип] [ставка]`,
            `${colors.white}Выдать грант: &e/mayor grant [ник] [сумма] [причина]`,
            `${colors.gold}────────────────────`,
            `${colors.white}Также доступны все команды министров`
        ];
        const frame = createFrame(`🏛️ КОМАНДЫ МЭРА`, lines);
        sendPrivate(player, frame);
        return;
    }
    
    const sub = args[0].toLowerCase();
    
    // /mayor setprice [id] [цена]
    if (sub === 'setprice' && args.length >= 3) {
        const propId = parseInt(args[1]);
        const price = parseInt(args[2]);
        
        if (isNaN(propId) || isNaN(price) || price < 0) {
            sendPrivate(player, formatMessage('❌', 'Неверный ID имущества или цена!', colors.red));
            return;
        }
        
        const property = await database.getProperty(propId);
        if (!property) {
            sendPrivate(player, formatMessage('❌', `Имущество #${propId} не найдено.`, colors.red));
            return;
        }
        
        const oldPrice = property.price;
        database.getDb().prepare('UPDATE properties SET price = ? WHERE id = ?').run(price, propId);
        
        const lines = [
            `${colors.white}Цена имущества &e#${propId}&r изменена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Старая цена: ${colors.red}${oldPrice.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Новая цена: ${colors.green}${price.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Изменение: ${price > oldPrice ? colors.red + '+' : colors.green}${((price - oldPrice) / oldPrice * 100).toFixed(1)}%`,
            `${colors.gold}────────────────────`,
            `${colors.white}Изменил: ${colors.yellow}${player}`
        ];
        const frame = createFrame(`🏠 ИЗМЕНЕНИЕ ЦЕНЫ`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`🏠 ${player} изменил цену имущества #${propId} с ${oldPrice} на ${price}`, 'info');
    }
    
    // /mayor exile [ник] [причина]
    else if (sub === 'exile' && args.length >= 3) {
        const target = args[1];
        const reason = args.slice(2).join(' ');
        
        const targetPlayer = await database.getPlayerByNickname(target);
        if (!targetPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
            return;
        }
        
        const targetRp = await database.getRPPlayer(target);
        
        const lines = [
            `${colors.white}Игрок &e${target}&r изгнан из города!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.red}${reason}`,
            `${colors.white}Изгнал: ${colors.yellow}${player}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Все имущество конфисковано`,
            `${colors.white}RP данные удалены`
        ];
        const frame = createFrame(`🏛️ ИЗГНАНИЕ`, lines);
        sendClan(frame);
        
        // Удаляем RP данные
        if (targetRp) {
            database.getDb().prepare('DELETE FROM rp_players WHERE minecraft_nick = ?').run(target);
        }
        
        // Удаляем из клана
        await database.removeClanMember(target);
        bot.chat(`/c kick ${target} Изгнание из города: ${reason}`);
        
        setTimeout(() => {
            sendPrivate(target, formatMessage('🚫', `Вы изгнаны из города. Причина: &e${reason}`, colors.red));
        }, 500);
        
        if (logCallback) logCallback(`🏛️ ${player} изгнал ${target} из города: ${reason}`, 'warn');
    }
    
    // /mayor tax [тип] [ставка]
    else if (sub === 'tax' && args.length >= 3) {
        const taxType = args[1].toLowerCase();
        const rate = parseFloat(args[2]);
        
        if (isNaN(rate) || rate < 0 || rate > 1) {
            sendPrivate(player, formatMessage('❌', 'Ставка налога должна быть от &e0&r до &e1', colors.red));
            return;
        }
        
        const validTypes = ['property', 'business', 'office'];
        if (!validTypes.includes(taxType)) {
            sendPrivate(player, formatMessage('❌', `Доступные типы: ${validTypes.join(', ')}`, colors.red));
            return;
        }
        
        database.setSetting(`tax_${taxType}`, rate.toString());
        
        const lines = [
            `${colors.white}Ставка налога &e${taxType}&r изменена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Новая ставка: ${colors.green}${(rate * 100).toFixed(1)}%`,
            `${colors.white}Изменил: ${colors.yellow}${player} (Мэр)`
        ];
        const frame = createFrame(`💰 НАЛОГИ`, lines);
        sendClan(frame);
        
        if (logCallback) logCallback(`💰 ${player} (Мэр) установил налог ${taxType} = ${rate * 100}%`, 'info');
    }
    
    // /mayor grant [ник] [сумма] [причина]
    else if (sub === 'grant' && args.length >= 3) {
        const target = args[1];
        const amount = parseInt(args[2]);
        const reason = args.slice(3).join(' ') || 'Грант от мэра';
        
        if (isNaN(amount) || amount <= 0) {
            sendPrivate(player, formatMessage('❌', 'Сумма должна быть положительным числом!', colors.red));
            return;
        }
        
        if (amount > 1000000) {
            sendPrivate(player, formatMessage('❌', 'Максимальная сумма гранта &e1 000 000&r ₽', colors.red));
            return;
        }
        
        const targetPlayer = await database.getPlayerByNickname(target);
        if (!targetPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
            return;
        }
        
        const cityBudget = parseInt(database.getSetting('city_budget') || '0');
        if (cityBudget < amount) {
            sendPrivate(player, formatMessage('❌', `Недостаточно средств в бюджете. Доступно: &e${cityBudget.toLocaleString('ru-RU')}&r ₽`, colors.red));
            return;
        }
        
        database.setSetting('city_budget', (cityBudget - amount).toString());
        await database.updatePlayerMoney(target, amount, `Грант от мэра: ${reason}`, player);
        
        const lines = [
            `${colors.white}Грант &e${amount.toLocaleString('ru-RU')}&r ₽ выдан &e${target}!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Причина: ${colors.green}${reason}`,
            `${colors.white}Выдал: ${colors.yellow}${player} (Мэр)`
        ];
        const frame = createFrame(`🎁 ГРАНТ МЭРА`, lines);
        sendClan(frame);
        
        setTimeout(() => {
            sendPrivate(target, formatMessage('🎁', `Вы получили грант от мэра &e${amount.toLocaleString('ru-RU')}&r ₽. Причина: &e${reason}`, colors.green));
        }, 500);
        
        if (logCallback) logCallback(`🎁 ${player} (Мэр) выдал грант ${amount}₽ игроку ${target}`, 'info');
    }
    
    else {
        sendPrivate(player, formatMessage('❌', `Неизвестная команда. Используйте &e/mayor help`, colors.red));
    }
}

module.exports = {
    mintax,
    budget,
    grant,
    armystatus,
    mvdbudget,
    mayor
};