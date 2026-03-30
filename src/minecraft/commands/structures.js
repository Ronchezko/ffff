// src/minecraft/commands/structures.js
const database = require('../../database');
const utils = require('../../shared/utils');
const license = require('./license');

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

// Уровни тревоги
const alertLevels = {
    'Альфа': 1,
    'Бета': 2,
    'Омега': 3
};

let currentAlertLevel = 'Альфа';
let redCodeActive = false;

// Структуры рангов
const structureRanks = {
    'Полиция': ['Рядовой', 'Сержант', 'Прапорщик', 'Лейтенант', 'Капитан', 'Подполковник', 'Полковник'],
    'Армия': ['Рядовой', 'Сержант', 'Старшина', 'Прапорщик', 'Лейтенант', 'Капитан', 'Майор', 'Подполковник', 'Полковник', 'Маршал'],
    'Больница': ['Санитар(ка)', 'Сестра-хозяйка', 'Медсёстры/Брат', 'Фельдшер', 'Лаборант', 'Акушерка', 'Врач', 'Главный врач'],
    'Академия': ['Стажёр', 'Ассистент', 'Преподаватель', 'Зав. кафедрой', 'Проректор', 'Директор']
};

// ========== ПОЛИЦИЯ ==========

/**
 * /search - личный досмотр
 */
async function search(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/search [ник]`, colors.red));
        return;
    }
    
    const target = args[1];
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Полиция') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники полиции могут использовать эту команду!', colors.red));
        return;
    }
    
    const rankIndex = structureRanks['Полиция'].indexOf(rpPlayer.organization_rank);
    if (rankIndex < 0) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для этой команды.', colors.red));
        return;
    }
    
    sendPrivate(player, formatMessage('🔍', `Проводится досмотр игрока &e${target}${colors.reset}...`, colors.aqua));
    
    // Имитация досмотра с рандомными предметами
    const items = [
        `алмазы: ${Math.floor(Math.random() * 20)}`,
        `изумруды: ${Math.floor(Math.random() * 10)}`,
        `золото: ${Math.floor(Math.random() * 30)}`,
        `железо: ${Math.floor(Math.random() * 50)}`
    ];
    
    setTimeout(() => {
        const frame = createFrame(`🔍 ДОСМОТР ${target}`, [
            `${colors.white}Обнаружено: ${colors.green}${items.join(', ')}`,
            `${colors.white}Нарушений: ${colors.yellow}${Math.floor(Math.random() * 3)}`
        ]);
        sendPrivate(player, frame);
    }, 1500);
    
    if (logCallback) logCallback(`🔍 ${player} провёл досмотр ${target}`, 'info');
}

/**
 * /check - проверка на судимость
 */
async function check(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/check [ник]`, colors.red));
        return;
    }
    
    const target = args[1];
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Полиция') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники полиции могут использовать эту команду!', colors.red));
        return;
    }
    
    const punishments = await database.getActivePunishments(target, null);
    const hasPunishments = punishments.length > 0;
    
    const lines = [
        `${colors.white}Проверка судимости игрока ${colors.yellow}${target}`,
        `${colors.gold}────────────────────`,
        hasPunishments 
            ? `${colors.red}⚠️ Имеет активные наказания: ${punishments.length}`
            : `${colors.green}✅ Не имеет активных наказаний`
    ];
    
    if (hasPunishments && punishments.length > 0) {
        lines.push(`${colors.gold}────────────────────`);
        for (const p of punishments.slice(0, 3)) {
            lines.push(`${colors.white}• ${p.type}: ${colors.yellow}${p.reason}${colors.reset} (${new Date(p.issued_at).toLocaleDateString()})`);
        }
        if (punishments.length > 3) {
            lines.push(`${colors.white}и ещё ${punishments.length - 3} наказаний...`);
        }
    }
    
    const frame = createFrame(`⚖️ СУДИМОСТЬ`, lines);
    sendPrivate(player, frame);
}

/**
 * /fine - выписать штраф
 */
async function fine(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 4) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/fine [ник] [сумма] [причина]`, colors.red));
        return;
    }
    
    const target = args[1];
    const amount = parseInt(args[2]);
    const reason = args.slice(3).join(' ');
    
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Полиция') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники полиции могут использовать эту команду!', colors.red));
        return;
    }
    
    const rankIndex = structureRanks['Полиция'].indexOf(rpPlayer.organization_rank);
    if (rankIndex < 1) {
        sendPrivate(player, formatMessage('❌', 'Штрафы доступны с ранга &eСержант&r и выше!', colors.red));
        return;
    }
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        sendPrivate(player, formatMessage('❌', 'Сумма должна быть от &e1&r до &e50 000&r ₽', colors.red));
        return;
    }
    
    const targetRp = await database.getRPPlayer(target);
    if (!targetRp) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
        return;
    }
    
    if (targetRp.money < amount) {
        sendPrivate(player, formatMessage('❌', `У игрока &e${target}&r недостаточно средств.`, colors.red));
        return;
    }
    
    await database.updatePlayerMoney(target, -amount, `Штраф от полиции: ${reason}`, player);
    
    sendPrivate(player, formatMessage('💰', `Штраф &e${amount.toLocaleString('ru-RU')}&r ₽ выписан &e${target}`, colors.green));
    setTimeout(() => {
        sendPrivate(target, formatMessage('⚠️', `Вам выписан штраф &e${amount.toLocaleString('ru-RU')}&r ₽ от полиции. Причина: &e${reason}`, colors.yellow));
    }, 500);
    
    if (logCallback) logCallback(`💰 ${player} выписал штраф ${amount}₽ ${target}`, 'info');
}

/**
 * /order - ордер на досмотр
 */
async function order(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/order [ник]`, colors.red));
        return;
    }
    
    const target = args[1];
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Полиция') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники полиции могут использовать эту команду!', colors.red));
        return;
    }
    
    const rankIndex = structureRanks['Полиция'].indexOf(rpPlayer.organization_rank);
    if (rankIndex < 3) {
        sendPrivate(player, formatMessage('❌', 'Ордер на досмотр доступен с ранга &eЛейтенант&r и выше!', colors.red));
        return;
    }
    
    sendPrivate(player, formatMessage('📄', `Ордер на досмотр имущества &e${target}&r выдан.`, colors.green));
    setTimeout(() => {
        sendPrivate(target, formatMessage('🚨', `Выдан ордер на досмотр вашего имущества от полиции.`, colors.yellow));
    }, 500);
    
    if (logCallback) logCallback(`📄 ${player} выдал ордер на досмотр ${target}`, 'info');
}

// ========== АРМИЯ ==========

/**
 * /tr status - уровень тревоги
 */
async function trStatus(bot, player, args, db, logCallback, sendPrivate) {
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Армия') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники армии могут использовать эту команду!', colors.red));
        return;
    }
    
    const levels = {
        'Альфа': '&aПовышенная готовность',
        'Бета': '&eКритическая угроза, комендантский час',
        'Омега': '&cОсада, полная мобилизация'
    };
    
    const lines = [
        `${colors.white}Текущий уровень тревоги: ${levels[currentAlertLevel] || '&7Спокойный режим'}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Описание: ${levels[currentAlertLevel]?.replace(/&[0-9a-f]/g, '') || 'Спокойный режим'}`
    ];
    
    const frame = createFrame(`🚨 УРОВЕНЬ ТРЕВОГИ`, lines);
    sendPrivate(player, frame);
}

/**
 * /border - проверка документов
 */
async function border(bot, player, args, db, logCallback, sendPrivate, getRealName) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/border [ник]`, colors.red));
        return;
    }
    
    let target = args[1];
    if (target.startsWith('~~')) {
        const real = getRealName(target);
        if (real !== target) target = real;
    }
    
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Армия') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники армии могут использовать эту команду!', colors.red));
        return;
    }
    
    const member = await database.getPlayerByNickname(target);
    if (!member) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    const lines = [
        `${colors.white}Проверка документов &e${target}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Ранг: ${colors.yellow}${member.rank}`,
        `${colors.white}В клане с: ${colors.green}${new Date(member.joined_at).toLocaleDateString()}`,
        `${colors.white}Статус: ${member.is_online ? '🟢 Онлайн' : '⚪ Оффлайн'}`
    ];
    
    const frame = createFrame(`📋 ДОКУМЕНТЫ`, lines);
    sendPrivate(player, frame);
}

/**
 * /tr - объявить тревогу
 */
async function trSet(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/tr [Альфа|Бета|Омега]`, colors.red));
        return;
    }
    
    const level = args[1];
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Армия') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники армии могут использовать эту команду!', colors.red));
        return;
    }
    
    const rankIndex = structureRanks['Армия'].indexOf(rpPlayer.organization_rank);
    if (rankIndex < 5) {
        sendPrivate(player, formatMessage('❌', 'Объявление тревоги доступно с ранга &eКапитан&r и выше!', colors.red));
        return;
    }
    
    if (!alertLevels[level]) {
        sendPrivate(player, formatMessage('❌', 'Уровни тревоги: &eАльфа&r, &eБета&r, &eОмега', colors.red));
        return;
    }
    
    currentAlertLevel = level;
    
    const levelColors = {
        'Альфа': colors.green,
        'Бета': colors.yellow,
        'Омега': colors.red
    };
    
    sendClan(formatMessage('🚨', `${levelColors[level]}${rpPlayer.organization_rank} ${player}${colors.reset} объявил уровень тревоги: ${levelColors[level]}${level}!`, colors.yellow));
    
    if (level === 'Омега') {
        sendClan(formatMessage('⚠️', `${colors.red}${colors.bold}ОСАДА! ВСЕМ ГРАЖДАНАМ ПРИБЫТЬ НА ЗАЩИТУ ГОРОДА!`, colors.red));
    }
    
    if (logCallback) logCallback(`🚨 ${player} объявил тревогу ${level}`, 'warn');
}

// ========== БОЛЬНИЦА ==========

/**
 * /rc status - статус красного кода
 */
async function rcStatus(bot, player, args, db, logCallback, sendPrivate) {
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Больница') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники больницы могут использовать эту команду!', colors.red));
        return;
    }
    
    const status = redCodeActive 
        ? `${colors.red}${colors.bold}АКТИВЕН${colors.reset}`
        : `${colors.green}НЕ АКТИВЕН`;
    
    const lines = [
        `${colors.white}Красный код: ${status}`,
        `${colors.gold}────────────────────`,
        redCodeActive 
            ? `${colors.red}⚠️ Все медики должны срочно прибыть!`
            : `${colors.green}✅ Обычный режим работы`
    ];
    
    const frame = createFrame(`🆘 КРАСНЫЙ КОД`, lines);
    sendPrivate(player, frame);
}

/**
 * /rc on/off - включить/отключить красный код
 */
async function rcToggle(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/rc on|off`, colors.red));
        return;
    }
    
    const action = args[1];
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Больница') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники больницы могут использовать эту команду!', colors.red));
        return;
    }
    
    const rankIndex = structureRanks['Больница'].indexOf(rpPlayer.organization_rank);
    if (rankIndex < 6) {
        sendPrivate(player, formatMessage('❌', 'Красный код могут объявлять только &eВрачи&r и выше!', colors.red));
        return;
    }
    
    if (action === 'on') {
        redCodeActive = true;
        sendClan(formatMessage('🚨', `${colors.red}${colors.bold}КРАСНЫЙ КОД АКТИВИРОВАН! ВСЕМ МЕДИКАМ СРОЧНО ПРИБЫТЬ!`, colors.red));
        sendPrivate(player, formatMessage('✅', 'Красный код активирован.', colors.green));
        if (logCallback) logCallback(`🆘 ${player} активировал красный код`, 'warn');
    } else if (action === 'off') {
        redCodeActive = false;
        sendClan(formatMessage('✅', 'Красный код деактивирован.', colors.green));
        sendPrivate(player, formatMessage('✅', 'Красный код деактивирован.', colors.green));
        if (logCallback) logCallback(`✅ ${player} деактивировал красный код`, 'info');
    } else {
        sendPrivate(player, formatMessage('❌', 'Используйте &e/rc on&r или &e/rc off', colors.red));
    }
}

// ========== АКАДЕМИЯ ==========

/**
 * /grade - поставить оценку
 */
async function grade(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 4) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/grade [ник] [курс] [оценка]`, colors.red));
        return;
    }
    
    const target = args[1];
    const course = args[2];
    const gradeValue = parseInt(args[3]);
    
    const rpPlayer = await database.getRPPlayer(player);
    
    if (!rpPlayer || rpPlayer.structure !== 'Академия') {
        sendPrivate(player, formatMessage('❌', 'Только сотрудники академии могут использовать эту команду!', colors.red));
        return;
    }
    
    if (isNaN(gradeValue) || gradeValue < 2 || gradeValue > 5) {
        sendPrivate(player, formatMessage('❌', 'Оценка должна быть от &e2&r до &e5', colors.red));
        return;
    }
    
    const targetRp = await database.getRPPlayer(target);
    if (!targetRp) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
        return;
    }
    
    let result = '';
    let messageColor = colors.green;
    
    if (gradeValue >= 5) {
        result = 'отлично';
        messageColor = colors.light_purple;
        sendPrivate(target, formatMessage('⭐', `Вы отлично сдали курс &e${course}&r!`, colors.light_purple));
    } else if (gradeValue >= 4) {
        result = 'хорошо';
        messageColor = colors.aqua;
        sendPrivate(target, formatMessage('✅', `Вы сдали курс &e${course}&r на хорошо.`, colors.green));
    } else if (gradeValue >= 3) {
        result = 'удовлетворительно';
        messageColor = colors.yellow;
        sendPrivate(target, formatMessage('✅', `Вы сдали курс &e${course}&r.`, colors.green));
    } else {
        result = 'неудовлетворительно';
        messageColor = colors.red;
        sendPrivate(target, formatMessage('❌', `Вы не сдали курс &e${course}&r. Придётся пересдавать.`, colors.red));
    }
    
    if (gradeValue >= 3) {
        db.getDb().prepare('UPDATE rp_players SET education = 1 WHERE minecraft_nick = ?').run(target);
    }
    
    sendPrivate(player, formatMessage('📚', `Оценка ${gradeValue} (${result}) выставлена &e${target}&r за курс &e${course}`, messageColor));
    if (logCallback) logCallback(`📚 ${player} выставил оценку ${gradeValue} ${target} за курс ${course}`, 'info');
}

// ========== ИМУЩЕСТВО ==========

/**
 * /im - управление имуществом
 */
async function im(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/im [flag|addm|dellm|nalog] [параметры]`, colors.red));
        return;
    }
    
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red));
        return;
    }
    
    const command = args[1];
    const subArgs = args.slice(2);
    
    const properties = db.getDb().prepare('SELECT id FROM properties WHERE owner = ?').all(player);
    if (properties.length === 0 && command !== 'nalog') {
        sendPrivate(player, formatMessage('🏠', 'У вас нет имущества.', colors.yellow));
        return;
    }
    
    const propertyId = properties.length > 0 ? properties[0].id : null;
    const regionName = `TRTR${propertyId}`;
    
    // /im flag
    if (command === 'flag' && subArgs.length >= 2) {
        const flag = subArgs[0];
        const value = subArgs[1];
        
        if (!propertyId) {
            sendPrivate(player, formatMessage('❌', 'У вас нет имущества для настройки флагов.', colors.red));
            return;
        }
        
        if (flag === 'use') {
            bot.chat(`/rg f ${regionName} use ${value === 'on' ? 'allow' : 'deny'}`);
        } else if (flag === 'item-drop') {
            bot.chat(`/rg f ${regionName} item-drop ${value === 'on' ? 'allow' : 'deny'}`);
        } else {
            sendPrivate(player, formatMessage('❌', 'Доступные флаги: &euse&r, &eitem-drop', colors.red));
            return;
        }
        
        sendPrivate(player, formatMessage('✅', `Флаг &e${flag}&r установлен на ${value === 'on' ? 'вкл' : 'выкл'}`, colors.green));
    }
    
    // /im addm / dellm
    else if ((command === 'addm' || command === 'dellm') && subArgs.length >= 2) {
        const propId = parseFloat(subArgs[0]);
        const target = subArgs[1];
        
        const property = await database.getProperty(propId);
        if (!property || property.owner !== player) {
            sendPrivate(player, formatMessage('❌', 'Вы не владелец этого имущества.', colors.red));
            return;
        }
        
        if (property.type !== 'apartment' && property.type !== 'house') {
            sendPrivate(player, formatMessage('❌', 'Сожителей можно добавлять только в квартиры и дома.', colors.red));
            return;
        }
        
        const targetRp = await database.getRPPlayer(target);
        if (!targetRp) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        let coOwners = JSON.parse(property.co_owners || '[]');
        
        if (command === 'addm') {
            if (coOwners.length >= 2) {
                sendPrivate(player, formatMessage('❌', 'Максимум 2 сожителя.', colors.red));
                return;
            }
            if (coOwners.includes(target)) {
                sendPrivate(player, formatMessage('⚠️', `&e${target}&r уже является сожителем.`, colors.yellow));
                return;
            }
            
            coOwners.push(target);
            db.getDb().prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propId);
            bot.chat(`/rg addmember ${regionName} ${target}`);
            sendPrivate(player, formatMessage('✅', `&e${target}&r добавлен как сожитель`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('🏠', `Вы добавлены как сожитель в имущество #${propId}`, colors.green));
            }, 500);
        } else if (command === 'dellm') {
            if (!coOwners.includes(target)) {
                sendPrivate(player, formatMessage('⚠️', `&e${target}&r не является сожителем.`, colors.yellow));
                return;
            }
            
            coOwners = coOwners.filter(n => n !== target);
            db.getDb().prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propId);
            bot.chat(`/rg removemember ${regionName} ${target}`);
            sendPrivate(player, formatMessage('✅', `&e${target}&r удалён из сожителей`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('⚠️', `Вы удалены из сожителей имущества #${propId}`, colors.yellow));
            }, 500);
        }
    }
    
    // /im nalog
    else if (command === 'nalog' && subArgs.length >= 2) {
        const action = subArgs[0];
        const propId = parseFloat(subArgs[1]);
        const amount = action === 'dep' ? parseFloat(subArgs[2]) : null;
        
        const property = await database.getProperty(propId);
        if (!property || property.owner !== player) {
            sendPrivate(player, formatMessage('❌', 'Вы не владелец этого имущества.', colors.red));
            return;
        }
        
        const taxRate = parseFloat(database.getSetting('tax_property') || '1');
        const taxAmount = Math.floor(property.price * taxRate / 100);
        
        if (action === 'info') {
            const lines = [
                `${colors.white}Имущество #${propId} (${property.type})`,
                `${colors.gold}────────────────────`,
                `${colors.white}Налог: ${colors.green}${taxAmount.toLocaleString('ru-RU')}₽/неделя`,
                `${colors.white}Последняя оплата: ${colors.yellow}${property.last_tax_paid ? new Date(property.last_tax_paid).toLocaleDateString() : 'никогда'}`
            ];
            const frame = createFrame(`🏠 НАЛОГ НА ИМУЩЕСТВО`, lines);
            sendPrivate(player, frame);
        } else if (action === 'dep' && amount) {
            if (rpPlayer.money < amount) {
                sendPrivate(player, formatMessage('❌', 'Недостаточно средств.', colors.red));
                return;
            }
            if (amount < taxAmount) {
                sendPrivate(player, formatMessage('⚠️', `Сумма меньше необходимого налога (${taxAmount.toLocaleString('ru-RU')}₽).`, colors.yellow));
                return;
            }
            
            await database.updatePlayerMoney(player, -amount, `Оплата налога за имущество #${propId}`, player);
            db.getDb().prepare('UPDATE properties SET last_tax_paid = datetime("now") WHERE id = ?').run(propId);
            sendPrivate(player, formatMessage('✅', `Налог &e${amount.toLocaleString('ru-RU')}&r ₽ оплачен.`, colors.green));
        }
    }
    
    else {
        sendPrivate(player, formatMessage('❌', `Доступные команды: &eflag, addm, dellm, nalog`, colors.red));
    }
}

// ========== БИЗНЕС ==========

/**
 * /biz - управление бизнесом
 */
async function biz(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/biz [flag|nalog|fin] [параметры]`, colors.red));
        return;
    }
    
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red));
        return;
    }
    
    const properties = db.getDb().prepare('SELECT id, price FROM properties WHERE owner = ? AND type = "business"').all(player);
    if (properties.length === 0) {
        sendPrivate(player, formatMessage('🏪', 'У вас нет бизнеса.', colors.yellow));
        return;
    }
    
    const businessId = properties[0].id;
    const regionName = `TRTR${businessId}`;
    const command = args[1];
    const subArgs = args.slice(2);
    
    if (command === 'flag' && subArgs.length >= 2) {
        const flag = subArgs[0];
        const value = subArgs[1];
        
        if (flag === 'use') {
            bot.chat(`/rg f ${regionName} use ${value === 'on' ? 'allow' : 'deny'}`);
        } else if (flag === 'item-drop') {
            bot.chat(`/rg f ${regionName} item-drop ${value === 'on' ? 'allow' : 'deny'}`);
        } else {
            sendPrivate(player, formatMessage('❌', 'Доступные флаги: &euse&r, &eitem-drop', colors.red));
            return;
        }
        
        sendPrivate(player, formatMessage('✅', `Флаг &e${flag}&r установлен на ${value === 'on' ? 'вкл' : 'выкл'}`, colors.green));
    }
    
    else if (command === 'nalog' && subArgs.length >= 2) {
        const action = subArgs[0];
        const amount = action === 'dep' ? parseFloat(subArgs[1]) : null;
        
        const taxRate = parseFloat(database.getSetting('tax_business') || '2');
        const taxAmount = Math.floor(properties[0].price * taxRate / 100);
        
        if (action === 'info') {
            const lines = [
                `${colors.white}Бизнес #${businessId}`,
                `${colors.gold}────────────────────`,
                `${colors.white}Налог: ${colors.green}${taxAmount.toLocaleString('ru-RU')}₽/неделя`
            ];
            const frame = createFrame(`🏪 НАЛОГ НА БИЗНЕС`, lines);
            sendPrivate(player, frame);
        } else if (action === 'dep' && amount) {
            if (rpPlayer.money < amount) {
                sendPrivate(player, formatMessage('❌', 'Недостаточно средств.', colors.red));
                return;
            }
            await database.updatePlayerMoney(player, -amount, `Оплата налога за бизнес #${businessId}`, player);
            sendPrivate(player, formatMessage('✅', `Налог &e${amount.toLocaleString('ru-RU')}&r ₽ оплачен.`, colors.green));
        }
    }
    
    else if (command === 'fin' && subArgs.length >= 2) {
        const period = subArgs[1];
        const hours = { '1h': 1, '1d': 24, '1w': 168, 'all': 720 }[period] || 1;
        const income = 5000 * hours;
        
        const lines = [
            `${colors.white}Бизнес #${businessId}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Период: ${colors.yellow}${period}`,
            `${colors.white}Доход: ${colors.green}${income.toLocaleString('ru-RU')}₽`,
            `${colors.white}Расходы: ${colors.red}${Math.floor(income * 0.3).toLocaleString('ru-RU')}₽`,
            `${colors.white}Прибыль: ${colors.green}${Math.floor(income * 0.7).toLocaleString('ru-RU')}₽`
        ];
        const frame = createFrame(`📊 ФИНАНСОВЫЙ ОТЧЁТ`, lines);
        sendPrivate(player, frame);
    }
    
    else {
        sendPrivate(player, formatMessage('❌', `Доступные команды: &eflag, nalog, fin`, colors.red));
    }
}

// ========== ОФИС ==========

/**
 * /office - управление офисом
 */
async function office(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/office [nalog|fin|info] [параметры]`, colors.red));
        return;
    }
    
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red));
        return;
    }
    
    const properties = db.getDb().prepare('SELECT id, price, level, correct_answers, wrong_answers, profit_data FROM properties WHERE owner = ? AND type = "office"').all(player);
    if (properties.length === 0) {
        sendPrivate(player, formatMessage('🏢', 'У вас нет офиса.', colors.yellow));
        return;
    }
    
    const officeData = properties[0];
    const officeId = officeData.id;
    const command = args[1];
    const subArgs = args.slice(2);
    
    if (command === 'nalog' && subArgs.length >= 2) {
        const action = subArgs[0];
        const amount = action === 'dep' ? parseFloat(subArgs[1]) : null;
        
        const taxRate = parseFloat(database.getSetting('tax_office') || '1.5');
        const taxAmount = Math.floor(officeData.price * taxRate / 100);
        
        if (action === 'info') {
            const lines = [
                `${colors.white}Офис #${officeId}`,
                `${colors.gold}────────────────────`,
                `${colors.white}Налог: ${colors.green}${taxAmount.toLocaleString('ru-RU')}₽/неделя`
            ];
            const frame = createFrame(`🏢 НАЛОГ НА ОФИС`, lines);
            sendPrivate(player, frame);
        } else if (action === 'dep' && amount) {
            if (rpPlayer.money < amount) {
                sendPrivate(player, formatMessage('❌', 'Недостаточно средств.', colors.red));
                return;
            }
            await database.updatePlayerMoney(player, -amount, `Оплата налога за офис #${officeId}`, player);
            sendPrivate(player, formatMessage('✅', `Налог &e${amount.toLocaleString('ru-RU')}&r ₽ оплачен.`, colors.green));
        }
    }
    
    else if (command === 'fin' && subArgs.length >= 2) {
        const period = subArgs[1];
        const hours = { '1h': 1, '1d': 24, '1w': 168, 'all': 720 }[period] || 1;
        const level = officeData.level || 4;
        const baseIncome = 10000 * level;
        const income = baseIncome * hours;
        
        const lines = [
            `${colors.white}Офис #${officeId}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Период: ${colors.yellow}${period}`,
            `${colors.white}Уровень: ${colors.green}${level}/10`,
            `${colors.white}Доход: ${colors.green}${income.toLocaleString('ru-RU')}₽`
        ];
        const frame = createFrame(`📊 ФИНАНСОВЫЙ ОТЧЁТ`, lines);
        sendPrivate(player, frame);
    }
    
    else if (command === 'info') {
        const level = officeData.level || 4;
        const correctAnswers = officeData.correct_answers || 0;
        const wrongAnswers = officeData.wrong_answers || 0;
        
        const neededCorrect = 5;
        const neededWrong = 3;
        
        let officeType = 'неизвестный';
        try {
            const profitData = JSON.parse(officeData.profit_data || '{}');
            officeType = profitData.office_type || 'неизвестный';
        } catch(e) {}
        
        const typeNames = {
            crypto: '🏭 Крипто-майнинг',
            it: '💻 IT-разработка',
            marketing: '📢 Маркетинговое агентство',
            consulting: '📊 Консалтинг'
        };
        
        const lines = [
            `${colors.white}Офис #${officeId}`,
            `${colors.white}Тип: ${colors.green}${typeNames[officeType] || officeType}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Уровень: ${colors.yellow}${level}/10`,
            `${colors.white}До повышения: ${colors.green}${Math.max(0, neededCorrect - correctAnswers)} правильных ответов`,
            `${colors.white}До понижения: ${colors.red}${Math.max(0, neededWrong - wrongAnswers)} неправильных ответов`,
            `${colors.gold}────────────────────`,
            `${colors.white}Правильных ответов: ${colors.green}${correctAnswers}`,
            `${colors.white}Неправильных ответов: ${colors.red}${wrongAnswers}`
        ];
        const frame = createFrame(`🏢 ИНФОРМАЦИЯ ОБ ОФИСЕ`, lines);
        sendPrivate(player, frame);
    }
    
    else {
        sendPrivate(player, formatMessage('❌', `Доступные команды: &enalog, fin, info`, colors.red));
    }
}

// ========== ЛИЦЕНЗИИ ==========

async function buyLicenseCmd(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/buylicense business|office`, colors.red));
        return;
    }
    
    const type = args[1].toLowerCase();
    if (type !== 'business' && type !== 'office') {
        sendPrivate(player, formatMessage('❌', 'Доступные типы: &ebusiness&r, &eoffice', colors.red));
        return;
    }
    
    await license.buyLicense(bot, player, type, db, logCallback, sendPrivate);
}

async function renewLicenseCmd(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/renewlicense business|office`, colors.red));
        return;
    }
    
    const type = args[1].toLowerCase();
    if (type !== 'business' && type !== 'office') {
        sendPrivate(player, formatMessage('❌', 'Доступные типы: &ebusiness&r, &eoffice', colors.red));
        return;
    }
    
    await license.renewLicense(bot, player, type, db, logCallback, sendPrivate);
}

async function officeType(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 3 || args[1] !== 'type') {
        sendPrivate(player, formatMessage('❌', `Использование: &e/office type [тип]`, colors.red));
        sendPrivate(player, formatMessage('ℹ️', 'Доступные типы: &ecrypto&r, &eit&r, &emarketing&r, &econsulting', colors.yellow));
        return;
    }
    
    const officeType = args[2].toLowerCase();
    await license.selectOfficeType(bot, player, officeType, db, logCallback, sendPrivate);
}

async function officeAnswer(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 4 || args[1] !== 'answer') {
        sendPrivate(player, formatMessage('❌', `Использование: &e/office answer [id] [ответ]`, colors.red));
        return;
    }
    
    const officeId = parseInt(args[2]);
    const answer = args.slice(3).join(' ');
    
    if (isNaN(officeId)) {
        sendPrivate(player, formatMessage('❌', 'Неверный ID офиса.', colors.red));
        return;
    }
    
    await license.handleOfficeAnswer(bot, player, officeId, answer, db, logCallback, sendPrivate);
}

module.exports = {
    search,
    check,
    fine,
    order,
    trStatus,
    border,
    trSet,
    rcStatus,
    rcToggle,
    grade,
    im,
    biz,
    office,
    buyLicense: buyLicenseCmd,
    renewLicense: renewLicenseCmd,
    officeType,
    officeAnswer
};