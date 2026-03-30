// src/minecraft/commands/base.js
const database = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');

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

// Кулдауны для команд
let lastFlyTime = 0;
let last10tTime = 0;
let lastPayTime = new Map();

/**
 * /help - список команд (ссылка на Discord)
 */
async function help(bot, player, args, db, logCallback, sendPrivate) {
    const lines = [
        `${colors.white}Вся информация о командах доступна в нашем Discord сервере!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Основные команды:`,
        `${colors.white}• &e/pay&r - перевод денег`,
        `${colors.white}• &e/balance&r - баланс`,
        `${colors.white}• &e/pass&r - паспорт`,
        `${colors.white}• &e/fly&r - полёт`,
        `${colors.white}• &e/10t&r - бонус 10к`,
        `${colors.gold}────────────────────`,
        `${colors.white}Подробнее в Discord:`
    ];
    const frame = createFrame(`📖 ПОМОЩЬ`, lines);
    sendPrivate(player, frame);
    
    setTimeout(() => {
        sendPrivate(player, formatMessage('💬', '&bdiscord.gg/PDH6Frcs6u', colors.aqua));
    }, 1000);
    
    if (logCallback) logCallback(`📖 ${player} запросил помощь`, 'info');
}

/**
 * /balance - просмотр баланса
 */
async function balance(bot, player, args, db, logCallback, sendPrivate) {
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r!', colors.red));
        return;
    }
    
    const balance = rpPlayer.money;
    let balanceColor = colors.green;
    if (balance < 10000) balanceColor = colors.yellow;
    if (balance < 1000) balanceColor = colors.red;
    
    const lines = [
        `${colors.white}Баланс игрока &e${player}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Сумма: ${balanceColor}${balance.toLocaleString('ru-RU')} ₽${colors.reset}`,
        `${colors.white}Статус: ${balance >= 10000 ? colors.green + 'Богатый' : balance >= 1000 ? colors.yellow + 'Средний' : colors.red + 'Нуждается'}`
    ];
    const frame = createFrame(`💰 БАЛАНС`, lines);
    sendPrivate(player, frame);
    
    if (logCallback) logCallback(`💰 ${player} проверил баланс: ${balance}₽`, 'info');
}

/**
 * /pay - перевод денег
 */
async function pay(bot, player, args, db, logCallback, sendPrivate, getRealName) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/pay [ник] [сумма]&r (от 1 до 50 000 ₽)`, colors.red));
        return;
    }
    
    let target = args[0];
    if (target.startsWith('~~')) {
        const real = getRealName(target);
        if (real !== target) target = real;
    }
    
    const amount = parseInt(args[1]);
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
    
    const sender = await database.getRPPlayer(player);
    const receiver = await database.getRPPlayer(target);
    
    if (!sender) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r!', colors.red));
        return;
    }
    if (!receiver) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не зарегистрирован в RolePlay.`, colors.red));
        return;
    }
    if (sender.money < amount) {
        const needed = amount - sender.money;
        sendPrivate(player, formatMessage('❌', `Недостаточно средств. Не хватает &e${needed.toLocaleString('ru-RU')}&r ₽`, colors.red));
        return;
    }
    
    await database.updatePlayerMoney(player, -amount, `Перевод игроку ${target}`, player);
    await database.updatePlayerMoney(target, amount, `Перевод от ${player}`, player);
    
    lastPayTime.set(player, Date.now());
    
    const lines = [
        `${colors.white}Перевод выполнен успешно!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Отправитель: ${colors.yellow}${player}`,
        `${colors.white}Получатель: ${colors.green}${target}`,
        `${colors.white}Сумма: ${colors.green}${amount.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Новый баланс: ${colors.green}${(sender.money - amount).toLocaleString('ru-RU')} ₽`
    ];
    const frame = createFrame(`💸 ПЕРЕВОД`, lines);
    sendPrivate(player, frame);
    
    setTimeout(() => {
        const receiverLines = [
            `${colors.white}Вы получили перевод!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Отправитель: ${colors.yellow}${player}`,
            `${colors.white}Сумма: ${colors.green}${amount.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Новый баланс: ${colors.green}${(receiver.money + amount).toLocaleString('ru-RU')} ₽`
        ];
        const receiverFrame = createFrame(`💸 ПОЛУЧЕНИЕ`, receiverLines);
        sendPrivate(target, receiverFrame);
    }, 500);
    
    if (logCallback) logCallback(`💰 ${player} перевёл ${amount}₽ ${target}`, 'info');
}

/**
 * /pass - паспорт игрока
 */
async function pass(bot, player, args, db, logCallback, sendPrivate, getRealName) {
    let target = args[0] || player;
    if (target.startsWith('~~')) {
        const real = getRealName(target);
        if (real !== target) target = real;
    }
    
    const member = await database.getPlayerByNickname(target);
    const rpPlayer = await database.getRPPlayer(target);
    
    if (!member) {
        sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
        return;
    }
    
    const lines = [
        `${colors.white}Никнейм: ${colors.yellow}${target}`,
        `${colors.white}Ранг в клане: ${colors.green}${member.rank || 'Новичок'}`,
        `${colors.white}Статистика: ${colors.green}${member.kills}⚔️${colors.reset} / ${colors.red}${member.deaths}💀`,
        `${colors.white}В клане с: ${colors.green}${new Date(member.joined_at).toLocaleDateString('ru-RU')}`,
        `${colors.gold}────────────────────`
    ];
    
    if (rpPlayer) {
        lines.push(`${colors.light_purple}${colors.bold}ROLEPLAY ДАННЫЕ${colors.reset}`);
        lines.push(`${colors.white}Баланс: ${colors.green}${rpPlayer.money.toLocaleString('ru-RU')} ₽`);
        lines.push(`${colors.white}Структура: ${colors.yellow}${rpPlayer.structure || 'не выбрана'}`);
        lines.push(`${colors.white}Звание: ${colors.green}${rpPlayer.organization_rank || 'нет'}`);
        lines.push(`${colors.white}Образование: ${rpPlayer.education ? colors.green + '✅ Есть' : colors.red + '❌ Нет'}`);
        lines.push(`${colors.white}Баллы активности: ${colors.green}${rpPlayer.unique_points || 0}`);
        lines.push(`${colors.white}Предупреждений: ${rpPlayer.warns >= 3 ? colors.red : colors.yellow}${rpPlayer.warns || 0}/3`);
    } else {
        lines.push(`${colors.red}${colors.bold}ROLEPLAY: НЕ ЗАРЕГИСТРИРОВАН${colors.reset}`);
        lines.push(`${colors.white}Используйте &e/rp&r для регистрации!`);
    }
    
    const frame = createFrame(`📋 ПАСПОРТ ${target.toUpperCase()}`, lines);
    sendPrivate(player, frame);
}

/**
 * /id - уникальный ID игрока
 */
async function id(bot, player, args, db, logCallback, sendPrivate) {
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Ошибка получения данных.', colors.red));
        return;
    }
    
    const lines = [
        `${colors.white}Игрок: ${colors.yellow}${player}`,
        `${colors.white}ID в базе данных: ${colors.green}#${member.id}`,
        `${colors.white}Дата регистрации: ${colors.green}${new Date(member.joined_at).toLocaleDateString('ru-RU')}`
    ];
    const frame = createFrame(`🆔 ИНФОРМАЦИЯ`, lines);
    sendPrivate(player, frame);
}

/**
 * /discord - ссылка на Discord
 */
async function discord(bot, player, args, db, logCallback, sendPrivate) {
    const lines = [
        `${colors.white}Наш Discord сервер:`,
        `${colors.gold}────────────────────`,
        `${colors.aqua}${colors.bold}discord.gg/PDH6Frcs6u`,
        `${colors.gold}────────────────────`,
        `${colors.white}Присоединяйтесь к сообществу!`
    ];
    const frame = createFrame(`💬 DISCORD`, lines);
    sendPrivate(player, frame);
    
    if (logCallback) logCallback(`🔗 ${player} запросил ссылку на Discord`, 'info');
}

/**
 * /fly - полёт (кд 2 минуты на весь клан)
 */
async function fly(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const now = Date.now();
    if (now - lastFlyTime < 120000) {
        const remaining = Math.ceil((120000 - (now - lastFlyTime)) / 1000);
        sendPrivate(player, formatMessage('⏰', `Команда /fly доступна раз в 2 минуты. Подождите &e${remaining}&r сек.`, colors.yellow));
        return;
    }
    
    lastFlyTime = now;
    bot.chat(`/fly ${player}`);
    
    const lines = [
        `${colors.white}Полёт активирован!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Длительность: ${colors.green}2 минуты`,
        `${colors.white}Следующее использование: через ${colors.yellow}2 минуты`
    ];
    const frame = createFrame(`✨ ПОЛЁТ`, lines);
    sendPrivate(player, frame);
    
    sendClan(`${colors.gold}[✨]${colors.reset} ${colors.yellow}${player}${colors.reset} использовал &e/fly&r!`);
    if (logCallback) logCallback(`🕊️ ${player} использовал /fly`, 'info');
}

/**
 * /10t - получение бонуса 10к (кд 5 минут)
 */
async function tenThousand(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    const now = Date.now();
    if (now - last10tTime < 300000) {
        const remaining = Math.ceil((300000 - (now - last10tTime)) / 1000);
        sendPrivate(player, formatMessage('⏰', `Команда /10t доступна раз в 5 минут. Подождите &e${remaining}&r сек.`, colors.yellow));
        return;
    }
    
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r.', colors.red));
        return;
    }
    
    last10tTime = now;
    await database.updatePlayerMoney(player, 10000, 'Команда /10t', 'system');
    
    const lines = [
        `${colors.white}Бонус получен!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Сумма: ${colors.green}10 000 ₽`,
        `${colors.white}Новый баланс: ${colors.green}${(rpPlayer.money + 10000).toLocaleString('ru-RU')} ₽`,
        `${colors.gold}────────────────────`,
        `${colors.white}Следующее использование: через ${colors.yellow}5 минут`
    ];
    const frame = createFrame(`🎁 БОНУС /10T`, lines);
    sendPrivate(player, frame);
    
    sendClan(`${colors.gold}[🎁]${colors.reset} ${colors.yellow}${player}${colors.reset} использовал &e/10t&r!`);
    if (logCallback) logCallback(`🎁 ${player} использовал /10t`, 'info');
}

/**
 * /rp - регистрация в RolePlay
 */
async function rp(bot, player, args, db, logCallback, sendPrivate) {
    const existing = await database.getRPPlayer(player);
    if (existing) {
        sendPrivate(player, formatMessage('ℹ️', 'Вы уже зарегистрированы в RolePlay!', colors.yellow));
        return;
    }
    
    const member = await database.getPlayerByNickname(player);
    if (!member) {
        sendPrivate(player, formatMessage('❌', 'Вы не состоите в клане!', colors.red));
        return;
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 300000;
    
    if (!global.rpRegistrations) global.rpRegistrations = new Map();
    global.rpRegistrations.set(player, { code, expiresAt });
    
    const lines = [
        `${colors.white}Для регистрации в RolePlay введите код в личные сообщения!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Ваш код: ${colors.green}${colors.bold}${code}`,
        `${colors.white}Код действителен: ${colors.red}5 минут`,
        `${colors.gold}────────────────────`,
        `${colors.white}Введите: ${colors.green}/${code}${colors.reset} или просто код в ЛС`,
        `${colors.white}После регистрации вы получите ${colors.green}1000 ₽`
    ];
    const frame = createFrame(`📝 РЕГИСТРАЦИЯ RP`, lines);
    sendPrivate(player, frame);
    
    setTimeout(() => {
        const pending = global.rpRegistrations.get(player);
        if (pending && pending.code === code) {
            global.rpRegistrations.delete(player);
            sendPrivate(player, formatMessage('⏰', 'Время регистрации истекло. Используйте /rp заново.', colors.yellow));
        }
    }, 300000);
    
    if (logCallback) logCallback(`📝 ${player} начал регистрацию в RP (код: ${code})`, 'info');
}

/**
 * /link - привязка Discord аккаунта
 */
async function link(bot, player, args, db, logCallback, sendPrivate) {
    if (args.length < 1) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/link [код]`, colors.red));
        return;
    }
    
    const code = args[0];
    const result = await database.verifyCode(code, player);
    
    if (result.success) {
        const lines = [
            `${colors.white}Discord аккаунт успешно привязан!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Теперь вы можете:`,
            `${colors.white}• Использовать команды из Discord`,
            `${colors.white}• Получать уведомления о событиях`,
            `${colors.white}• Участвовать в голосованиях`
        ];
        const frame = createFrame(`🔗 ПРИВЯЗКА DISCORD`, lines);
        sendPrivate(player, frame);
        
        if (logCallback) logCallback(`🔗 ${player} привязал Discord`, 'success');
    } else {
        sendPrivate(player, formatMessage('❌', result.message, colors.red));
    }
}

/**
 * /org list - список организаций
 */
async function orgList(bot, player, args, db, logCallback, sendPrivate) {
    const lines = [
        `${colors.white}Организации города:`,
        `${colors.gold}────────────────────`,
        `${colors.white}• ${colors.green}🏛️ Мэрия${colors.reset} - управление городом`,
        `${colors.white}• ${colors.blue}🚔 Полиция${colors.reset} - правопорядок`,
        `${colors.white}• ${colors.red}⚔️ Армия${colors.reset} - оборона города`,
        `${colors.white}• ${colors.aqua}🏥 Больница${colors.reset} - медицина`,
        `${colors.white}• ${colors.yellow}📚 Академия${colors.reset} - образование`,
        `${colors.white}• ${colors.light_purple}⚖️ Суд${colors.reset} - правосудие`,
        `${colors.gold}────────────────────`,
        `${colors.white}Для вступления обратитесь к руководству`
    ];
    const frame = createFrame(`🏢 ОРГАНИЗАЦИИ`, lines);
    sendPrivate(player, frame);
}

module.exports = {
    help,
    balance,
    pay,
    pass,
    id,
    discord,
    fly,
    tenThousand,
    rp,
    link,
    orgList
};