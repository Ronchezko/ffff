// src/minecraft/commands/player.js
const utils = require('../../shared/utils');
const database = require('../../database');
const license = require('./license');

let lastFlyTime = 0;
let last10tTime = 0;
let lastPayTime = new Map();

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0',
    dark_blue: '&1',
    dark_green: '&2',
    dark_aqua: '&3',
    dark_red: '&4',
    dark_purple: '&5',
    gold: '&6',
    gray: '&7',
    dark_gray: '&8',
    blue: '&9',
    green: '&a',
    aqua: '&b',
    red: '&c',
    light_purple: '&d',
    yellow: '&e',
    white: '&f',
    bold: '&l',
    reset: '&r'
};

// Функция для красивого форматирования сообщений
function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${colors.yellow}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

async function help(bot, player, args, db, logCallback, sendPrivate) {
    // Упрощённый help - только ссылка на Discord
    sendPrivate(player, formatMessage('ℹ️', '&fВся информация о командах доступна в нашем Discord сервере!', colors.yellow));
    setTimeout(() => {
        sendPrivate(player, formatMessage('💬', '&bdiscord.gg/PDH6Frcs6u', colors.aqua));
    }, 1000);
    
    if (logCallback) logCallback(`📖 ${player} запросил помощь`, 'info');
}

async function balance(bot, player, args, db, logCallback, sendPrivate) {
    const rpPlayer = await db.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r для регистрации!', colors.red));
        return;
    }
    
    const balance = rpPlayer.money;
    let balanceColor = colors.green;
    if (balance < 10000) balanceColor = colors.yellow;
    if (balance < 1000) balanceColor = colors.red;
    
    sendPrivate(player, formatMessage('💰', `&fВаш баланс: ${balanceColor}${balance.toLocaleString('ru-RU')} ₽${colors.reset}`, colors.white));
    if (logCallback) logCallback(`💰 ${player} проверил баланс: ${balance}₽`, 'info');
}

async function pay(bot, player, args, db, logCallback, sendPrivate, getRealName) {
    if (args.length < 3) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/pay [ник] [сумма]&r (от 1 до 50 000 ₽)`, colors.red));
        return;
    }
    
    let target = args[1];
    if (target.startsWith('~~')) {
        const real = getRealName(target);
        if (real !== target) target = real;
    }
    
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        sendPrivate(player, formatMessage('❌', `Сумма должна быть от &e1&r до &e50 000&r ₽`, colors.red));
        return;
    }
    
    const lastUse = lastPayTime.get(player) || 0;
    if (Date.now() - lastUse < 10000) {
        const remaining = Math.ceil((10000 - (Date.now() - lastUse)) / 1000);
        sendPrivate(player, formatMessage('⏰', `Подождите &e${remaining}&r секунд перед следующим переводом.`, colors.yellow));
        return;
    }
    
    const sender = await db.getRPPlayer(player);
    const receiver = await db.getRPPlayer(target);
    
    if (!sender) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r!', colors.red));
        return;
    }
    if (!receiver) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не зарегистрирован в RolePlay.`, colors.red));
        return;
    }
    if (sender.money < amount) {
        sendPrivate(player, formatMessage('❌', `Недостаточно средств. Ваш баланс: &e${sender.money.toLocaleString('ru-RU')}&r ₽`, colors.red));
        return;
    }
    
    await db.updatePlayerMoney(player, -amount, `Перевод игроку ${target}`, player);
    await db.updatePlayerMoney(target, amount, `Перевод от ${player}`, player);
    
    lastPayTime.set(player, Date.now());
    
    sendPrivate(player, formatMessage('✅', `Вы перевели &e${amount.toLocaleString('ru-RU')}&r ₽ игроку &b${target}`, colors.green));
    setTimeout(() => {
        sendPrivate(target, formatMessage('✅', `Вы получили &e${amount.toLocaleString('ru-RU')}&r ₽ от &b${player}`, colors.green));
    }, 500);
    
    if (logCallback) logCallback(`💰 ${player} перевёл ${amount}₽ ${target}`, 'info');
}

async function pass(bot, player, args, db, logCallback, sendPrivate, getRealName) {
    let target = args[1] || player;
    if (target.startsWith('~~')) {
        const real = getRealName(target);
        if (real !== target) target = real;
    }
    
    const member = await db.getPlayerByNickname(target);
    const rpPlayer = await db.getRPPlayer(target);
    
    if (!member) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    // Красивый паспорт с разделителями
    let passInfo = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    passInfo += `${colors.gold}║ ${colors.light_purple}${colors.bold}ПАСПОРТ ГРАЖДАНИНА${colors.reset}${colors.gold}            ║${colors.reset}\n`;
    passInfo += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    passInfo += `${colors.gold}║ ${colors.aqua}Никнейм:${colors.reset} ${colors.white}${target}${colors.reset}`;
    passInfo += ' '.repeat(32 - target.length - 8) + `${colors.gold}║${colors.reset}\n`;
    passInfo += `${colors.gold}║ ${colors.aqua}Ранг:${colors.reset} ${colors.yellow}${member.rank}${colors.reset}`;
    passInfo += ' '.repeat(32 - member.rank.length - 6) + `${colors.gold}║${colors.reset}\n`;
    passInfo += `${colors.gold}║ ${colors.aqua}Статистика:${colors.reset} ${colors.white}${member.kills}⚔️ / ${member.deaths}💀${colors.reset}`;
    passInfo += ' '.repeat(32 - 19) + `${colors.gold}║${colors.reset}\n`;
    passInfo += `${colors.gold}║ ${colors.aqua}В клане с:${colors.reset} ${colors.white}${new Date(member.joined_at).toLocaleDateString('ru-RU')}${colors.reset}`;
    passInfo += ' '.repeat(32 - 17) + `${colors.gold}║${colors.reset}\n`;
    
    if (rpPlayer) {
        passInfo += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.light_purple}${colors.bold}ROLEPLAY ДАННЫЕ${colors.reset}${colors.gold}               ║${colors.reset}\n`;
        passInfo += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.aqua}Баланс:${colors.reset} ${colors.green}${rpPlayer.money.toLocaleString('ru-RU')}₽${colors.reset}`;
        passInfo += ' '.repeat(32 - rpPlayer.money.toString().length - 9) + `${colors.gold}║${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.aqua}Структура:${colors.reset} ${colors.white}${rpPlayer.structure || 'не выбрана'}${colors.reset}`;
        const structLen = (rpPlayer.structure || 'не выбрана').length;
        passInfo += ' '.repeat(32 - structLen - 11) + `${colors.gold}║${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.aqua}Звание:${colors.reset} ${colors.yellow}${rpPlayer.organization_rank || 'нет'}${colors.reset}`;
        const rankLen = (rpPlayer.organization_rank || 'нет').length;
        passInfo += ' '.repeat(32 - rankLen - 8) + `${colors.gold}║${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.aqua}Образование:${colors.reset} ${rpPlayer.education ? '✅' : '❌'}`;
        passInfo += ' '.repeat(32 - 14) + `${colors.gold}║${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.aqua}Баллы:${colors.reset} ${colors.green}${rpPlayer.unique_points || 0}${colors.reset}`;
        passInfo += ' '.repeat(32 - (rpPlayer.unique_points || 0).toString().length - 8) + `${colors.gold}║${colors.reset}\n`;
    } else {
        passInfo += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
        passInfo += `${colors.gold}║ ${colors.red}${colors.bold}ROLEPLAY: НЕ ЗАРЕГИСТРИРОВАН${colors.reset}${colors.gold}   ║${colors.reset}\n`;
    }
    
    passInfo += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    
    sendPrivate(player, passInfo);
}

async function id(bot, player, args, db, logCallback, sendPrivate) {
    const member = await db.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Ошибка получения данных.', colors.red));
        return;
    }
    sendPrivate(player, formatMessage('🆔', `Ваш ID в базе данных: &e#${member.id}`, colors.white));
}

async function discord(bot, player, args, db, logCallback, sendPrivate) {
    sendPrivate(player, formatMessage('💬', '&bdiscord.gg/PDH6Frcs6u', colors.aqua));
    if (logCallback) logCallback(`🔗 ${player} запросил ссылку на Discord`, 'info');
}

async function idim(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/idim [номер имущества]`, colors.red));
        return;
    }
    
    const propertyId = parseFloat(args[1]);
    const property = await db.getProperty(propertyId);
    
    if (!property) {
        sendPrivate(player, formatMessage('❌', `Имущество #${propertyId} не найдено.`, colors.red));
        return;
    }
    
    const typeNames = {
        apartment: 'Квартира',
        house: 'Дом',
        business: 'Бизнес',
        office: 'Офис',
        port: 'Порт'
    };
    
    const typeName = typeNames[property.type] || property.type;
    const status = property.owner ? `${colors.green}Занято${colors.reset} владельцем: ${colors.yellow}${property.owner}` : `${colors.green}Свободно${colors.reset}`;
    const coOwners = property.co_owners ? JSON.parse(property.co_owners).join(', ') : 'нет';
    
    let info = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    info += `${colors.gold}║ ${colors.light_purple}${colors.bold}ИМУЩЕСТВО #${propertyId}${colors.reset}${colors.gold}               ║${colors.reset}\n`;
    info += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    info += `${colors.gold}║ ${colors.aqua}Тип:${colors.reset} ${colors.white}${typeName}${colors.reset}`;
    info += ' '.repeat(32 - typeName.length - 6) + `${colors.gold}║${colors.reset}\n`;
    info += `${colors.gold}║ ${colors.aqua}Цена:${colors.reset} ${colors.green}${property.price.toLocaleString('ru-RU')}₽${colors.reset}`;
    info += ' '.repeat(32 - property.price.toString().length - 7) + `${colors.gold}║${colors.reset}\n`;
    info += `${colors.gold}║ ${colors.aqua}Статус:${colors.reset} ${status}`;
    const statusLen = status.replace(/&[0-9a-fklmnor]/g, '').length;
    info += ' '.repeat(32 - statusLen - 8) + `${colors.gold}║${colors.reset}\n`;
    info += `${colors.gold}║ ${colors.aqua}Сожители:${colors.reset} ${colors.white}${coOwners}${colors.reset}`;
    const coLen = coOwners.length;
    info += ' '.repeat(32 - coLen - 10) + `${colors.gold}║${colors.reset}\n`;
    info += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    
    sendPrivate(player, info);
}

async function keys(bot, player, args, db, logCallback, sendPrivate) {
    const rpPlayer = await db.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red));
        return;
    }
    
    const properties = db.getDb().prepare(`
        SELECT id, type FROM properties WHERE owner = ? OR co_owners LIKE ?
    `).all(player, `%${player}%`);
    
    if (properties.length === 0) {
        sendPrivate(player, formatMessage('🔑', 'У вас нет имущества.', colors.yellow));
        return;
    }
    
    const typeNames = { apartment: 'Квартира', house: 'Дом', business: 'Бизнес', office: 'Офис', port: 'Порт' };
    
    let message = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    message += `${colors.gold}║ ${colors.light_purple}${colors.bold}ВАШЕ ИМУЩЕСТВО${colors.reset}${colors.gold}                 ║${colors.reset}\n`;
    message += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    
    for (const prop of properties) {
        const typeName = typeNames[prop.type] || prop.type;
        message += `${colors.gold}║ ${colors.white}#${prop.id}${colors.reset} - ${colors.green}${typeName}${colors.reset}`;
        const lineLen = prop.id.toString().length + typeName.length + 6;
        message += ' '.repeat(32 - lineLen) + `${colors.gold}║${colors.reset}\n`;
    }
    
    message += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    
    sendPrivate(player, message);
}

async function fly(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const now = Date.now();
    if (now - lastFlyTime < 120000) {
        const remaining = Math.ceil((120000 - (now - lastFlyTime)) / 1000);
        sendPrivate(player, formatMessage('⏰', `Команда /fly доступна раз в 2 минуты. Подождите &e${remaining}&r сек.`, colors.yellow));
        return;
    }
    
    lastFlyTime = now;
    bot.chat(`/fly ${player}`);
    sendPrivate(player, formatMessage('✨', 'Полёт активирован!', colors.green));
    sendClan(`${colors.gold}[✨]${colors.reset} ${colors.yellow}${player}${colors.reset} использовал &e/fly&r!`);
    if (logCallback) logCallback(`🕊️ ${player} использовал /fly`, 'info');
}

async function tenThousand(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const now = Date.now();
    if (now - last10tTime < 300000) {
        const remaining = Math.ceil((300000 - (now - last10tTime)) / 1000);
        sendPrivate(player, formatMessage('⏰', `Команда /10t доступна раз в 5 минут. Подождите &e${remaining}&r сек.`, colors.yellow));
        return;
    }
    
    last10tTime = now;
    
    const rpPlayer = await db.getRPPlayer(player);
    if (rpPlayer) {
        await db.updatePlayerMoney(player, 10000, 'Команда /10t', 'system');
        sendPrivate(player, formatMessage('💰', `Вы получили &e10 000&r ₽!`, colors.green));
        sendClan(`${colors.gold}[🎁]${colors.reset} ${colors.yellow}${player}${colors.reset} использовал &e/10t&r!`);
    } else {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r.', colors.red));
    }
    
    if (logCallback) logCallback(`🎁 ${player} использовал /10t`, 'info');
}

// В функции rp замените код на:

async function rp(bot, player, args, db, logCallback, sendPrivate) {
    const existing = await db.getRPPlayer(player);
    if (existing) {
        sendPrivate(player, `ℹ️ Вы уже зарегистрированы в RolePlay!`);
        return;
    }
    
    const member = await db.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, `❌ Вы не состоите в клане!`);
        return;
    }
    
    // Проверка кулдауна на получение кода (5 минут)
    const lastCodeTime = global.lastRpCodeTime?.get(player) || 0;
    if (Date.now() - lastCodeTime < 300000) {
        const remaining = Math.ceil((300000 - (Date.now() - lastCodeTime)) / 1000);
        sendPrivate(player, `⚠️ Подождите ${remaining} секунд перед получением нового кода.`);
        return;
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 300000;
    
    if (!global.rpRegistrations) global.rpRegistrations = new Map();
    if (!global.lastRpCodeTime) global.lastRpCodeTime = new Map();
    
    global.rpRegistrations.set(player, { code, expiresAt });
    global.lastRpCodeTime.set(player, Date.now());
    
    sendPrivate(player, `📝 Для регистрации в RolePlay вам потребуется пройти проверку, напишите ваш код в личные сообщения боту в течение 5 минут. Ваш код: ${code}`);
    
    setTimeout(() => {
        const pending = global.rpRegistrations.get(player);
        if (pending && pending.code === code) {
            global.rpRegistrations.delete(player);
            sendPrivate(player, `⏰ Время регистрации истекло. Используйте /rp заново.`);
        }
    }, 300000);
    
    if (logCallback) logCallback(`📝 ${player} начал регистрацию в RP (код: ${code})`, 'info');
}

async function link(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/link [код]`, colors.red));
        return;
    }
    
    const code = args[1];
    const result = await db.verifyCode(code, player);
    
    if (result.success) {
        sendPrivate(player, formatMessage('✅', 'Discord аккаунт успешно привязан!', colors.green));
        if (logCallback) logCallback(`🔗 ${player} привязал Discord`, 'success');
    } else {
        sendPrivate(player, formatMessage('❌', result.message, colors.red));
    }
}

async function buyLicense(bot, player, args, db, logCallback, sendPrivate) {
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

async function renewLicense(bot, player, args, db, logCallback, sendPrivate) {
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
    help,
    balance,
    pay,
    pass,
    id,
    discord,
    idim,
    keys,
    fly,
    tenThousand,
    rp,
    link,
    buyLicense,
    renewLicense,
    officeType,
    officeAnswer
};