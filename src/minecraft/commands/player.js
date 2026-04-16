// src/minecraft/commands/player.js
// Команды для всех игроков клана (ПОЛНАЯ ВЕРСИЯ)

const utils = require('../../shared/utils');
const { checkRPFrozen } = require('../../shared/utils');
require('../../shared/cleanNick')
// Глобальные кулдауны
let lastFlyTime = 0;
let lastTenTTime = 0;
const rpCooldowns = new Map();
const payCooldowns = new Map();

// ========== ФУНКЦИЯ ОЧИСТКИ НИКА ==========


// ========== ФУНКЦИЯ ОТПРАВКИ СООБЩЕНИЙ С ЗАДЕРЖКОЙ ==========
async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(300);
}

// ============================================
// /balance - Показать баланс
// ============================================

async function balance(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    if (await checkRPFrozen(sender, bot, db)) return;
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Вы не зарегистрированы в RolePlay! Используйте &e/rp`);
        return;
    }
    await sendMessage(bot, sender, `&a&l|&f Ваш баланс: &e${profile.money.toLocaleString()}₽`);
}

// ============================================
// /pay [ник] [сумма] - Перевести деньги
// ============================================

async function pay(bot, sender, args, db) {
    const cleanSender = cleanNick(sender);
    if (await checkRPFrozen(sender, bot, db)) return;
    const lastPay = payCooldowns.get(cleanSender) || 0;
    if (Date.now() - lastPay < 15000) {
        const remaining = Math.ceil((15000 - (Date.now() - lastPay)) / 1000);
        await sendMessage(bot, sender, `&4&l|&c Подождите &e${remaining}&c секунд`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `     &e/pay [ник] [сумма] &7(макс 50 000₽)`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        await sendMessage(bot, sender, `&4&l|&c Сумма от &e1 &cдо &e50 000₽`);
        return;
    }
    
    if (cleanSender === cleanNick(target)) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя перевести деньги самому себе!`);
        return;
    }
    
    const targetProfile = await db.getRPProfile(cleanNick(target));
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне в RP`);
        return;
    }
    
    payCooldowns.set(cleanSender, Date.now());
    const success = await db.transferMoney(cleanSender, cleanNick(target), amount, `Перевод от ${sender}`);
    
    if (success) {
        await sendMessage(bot, sender, `&a&l|&f Перевели &e${amount.toLocaleString()}₽ &fигроку &e${target}`);
        await sendMessage(bot, target, `&a&l|&f ${sender} перевел вам &e${amount.toLocaleString()}₽`);
    } else {
        await sendMessage(bot, sender, `&4&l|&c Недостаточно средств!`);
    }
}

// ============================================
// /pass - Паспорт
// ============================================

async function pass(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    if (await checkRPFrozen(sender, bot, db)) return;
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Вы не в RP! Используйте &e/rp`);
        return;
    }
    
    const clanMember = await db.getClanMember(cleanNickname);
    const education = profile.has_education ? '✅' : '❌';
    
    await sendMessage(bot, sender, `&a&l|&f Паспорт &e${sender} &7&l|&f Структура: &e${profile.structure} &7| Ранг: &e${profile.job_rank} &7| Образование: ${education}`);
}

// ============================================
// /id - Узнать ID в базе данных (исправлен)
// ============================================

async function id(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    if (await checkRPFrozen(sender, bot, db)) return;
    
    // Проверяем, есть ли игрок в клане
    const member = await db.getClanMember(cleanNickname);
    if (!member) {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в клане!`);
        return;
    }
    
    // Получаем ID разными способами
    let playerId = member.id;
    
    // Если id нет, пробуем получить rowid
    if (!playerId) {
        const rowidResult = await db.get('SELECT rowid FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNickname]);
        if (rowidResult) {
            playerId = rowidResult.rowid;
        }
    }
    
    // Если всё равно нет, пробуем через rowid в самой записи
    if (!playerId && member.rowid) {
        playerId = member.rowid;
    }
    
    if (!playerId) {
        await sendMessage(bot, sender, `&4&l|&c Не удалось получить ID. Обратитесь к администратору.`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Ваш ID: &e${playerId}`);
    if (member.joined_at) {
        await sendMessage(bot, sender, `&7&l|&f В клане с: &e${new Date(member.joined_at).toLocaleDateString()}`);
    }
}
// ============================================
// /keys - Список имущества
// ============================================

async function keys(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    const properties = await db.getPlayerProperties(cleanNickname);
    if (await checkRPFrozen(sender, bot, db)) return;
    if (!properties || properties.length === 0) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет имущества`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Ваше имущество (${properties.length}):`);
    for (const prop of properties) {
        await sendMessage(bot, sender, `&7&l|&f #${prop.id} &7- ${prop.type} &7(${prop.price.toLocaleString()}₽)`);
    }
}

// ============================================
// /idim [номер] - Информация об имуществе
// ============================================

async function idim(bot, sender, args, db) {
    if (await checkRPFrozen(sender, bot, db)) return;
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/idim [номер]`);
        return;
    }
    
    const property = await db.getProperty(args[0]);
    if (!property) {
        await sendMessage(bot, sender, `&4&l|&c Имущество #&e${args[0]} &cне найдено`);
        return;
    }
    
    const status = property.is_available ? '✅ Свободно' : '🔒 Занято';
    await sendMessage(bot, sender, `&a&l|&f #${property.id} &7| ${property.type} &7| ${status}`);
    await sendMessage(bot, sender, `&7&l|&f Цена: &e${property.price.toLocaleString()}₽`);
    if (property.owner_nick) {
        await sendMessage(bot, sender, `&7&l|&f Владелец: &e${property.owner_nick}`);
    }
}

// ============================================
// /help - Справка
// ============================================

async function help(bot, sender, args, db) {
    await sendMessage(bot, sender, `&a&l|&f Команды: &e/balance, /pay, /pass, /id, /keys, /idim, /rp, /fly, /10t, /discord`);
    await sendMessage(bot, sender, `&7&l|&f Полный список на Discord!`);
}

// ============================================
// /rp - Регистрация в RolePlay
// ============================================

// В начале файла player.js


async function rp(bot, realNick, originalSender, args, db, addLog) {
    const sendTarget = originalSender || realNick;
    const cleanNickname = cleanNick(realNick);
    
    // Проверка заморозки
    const isFrozen = await db.isRPFrozen(realNick);
    if (isFrozen) {
        await sendMessage(bot, sendTarget, `&4&l|&c Ваш RP профиль заморожен!`);
        return;
    }
    
    // Проверка: есть ли запись в таблице rp_players
    const existing = await db.getRPProfile(cleanNickname);
    
    if (existing) {
        await sendMessage(bot, sendTarget, `&4&l|&c Вы уже зарегистрированы в RolePlay!`);
        return;
    }
    
    // Кулдаун 5 минут
    const lastRpTime = rpCooldowns.get(cleanNickname) || 0;
    if (Date.now() - lastRpTime < 300000) {
        const remaining = Math.ceil((300000 - (Date.now() - lastRpTime)) / 1000);
        await sendMessage(bot, sendTarget, `&4&l|&c Подождите ${remaining} секунд`);
        return;
    }
    
    // Проверка клана
    const clanMember = await db.getClanMember(cleanNickname);
    if (!clanMember) {
        await sendMessage(bot, sendTarget, `&4&l|&c Вы не в клане Resistance!`);
        return;
    }
    
    // Генерация кода
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Сохраняем
    if (!global.pendingRegistrations) global.pendingRegistrations = new Map();
    global.pendingRegistrations.set(cleanNickname, {
        code: code,
        expires: Date.now() + 5 * 60 * 1000,
        originalNick: sendTarget
    });
    
    rpCooldowns.set(cleanNickname, Date.now());
    
    // Отправляем код
    await sendMessage(bot, sendTarget, `&a&l|&f Ваш код: &e&l${code}`);
    await sendMessage(bot, sendTarget, `&7&l|&f Отправьте код мне в ЛС. Действует 5 минут.`);
    
    if (addLog) addLog(`✅ Код ${code} отправлен ${sendTarget}`, 'success');
}

// ============================================
// /link [код] - Привязка Discord
// ============================================

async function link(bot, sender, args, db) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/link [код]`);
        return;
    }
    
    const cleanNickname = cleanNick(sender);
    const result = await db.verifyCode(args[0], cleanNickname);
    
    if (result.success) {
        await sendMessage(bot, sender, `&a&l|&f Discord привязан!`);
        bot.chat(`/cc &a&l|&f ${sender} &aпривязал Discord!`);
    } else {
        await sendMessage(bot, sender, `&4&l|&c Неверный код!`);
    }
}

// ============================================
// /fly - Выдать полёт (КД на весь клан 2 мин)
// ============================================

async function fly(bot, sender, args, db) {
    const now = Date.now();
    if (now - lastFlyTime < 120000) {
        const remaining = Math.ceil((120000 - (now - lastFlyTime)) / 1000);
        await sendMessage(bot, sender, `&4&l|&c /fly через &e${remaining}&c сек`);
        return;
    }
    
    lastFlyTime = now;
    bot.chat(`/fly ${sender}`);
    await sendMessage(bot, sender, `&a&l|&f Вы получили полёт!`);
    bot.chat(`/cc &a&l|&f ${sender} &aиспользовал /fly`);
}

// ============================================
// /10t - Получить 10к (КД 5 мин)
// ============================================

async function tenT(bot, sender, args, db) {
    const now = Date.now();
    if (now - lastTenTTime < 300000) {
        const remaining = Math.ceil((300000 - (now - lastTenTTime)) / 1000);
        await sendMessage(bot, sender, `&4&l|&c /10t через &e${remaining}&c сек`);
        return;
    }
    
    const cleanNickname = cleanNick(sender);
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Сначала /rp`);
        return;
    }
    
    lastTenTTime = now;
    
    // Выдаём валюту на сервере (нужно уточнить команду)
    bot.chat(`/eco set ${sender} 10000000000000000`);
    
    // Обновляем в БД
    await db.updateMoney(cleanNickname, 10000, 'bonus', 'Бонус /10t', 'system');
    
    await sendMessage(bot, sender, `&a&l|&f Вы получили &e10 000₽`);
    bot.chat(`/cc &a&l|&f ${sender} &aполучил бонус!`);
}

// ============================================
// /org o list - Список организаций
// ============================================

async function org(bot, sender, args, db) {
    if (await checkRPFrozen(sender, bot, db)) return;
    if (args.length < 2 || args[0] !== 'o' || args[1] !== 'list') {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org o list`);
        return;
    }
    
    const orgs = await db.getAllOrganizations();
    if (!orgs || orgs.length === 0) {
        await sendMessage(bot, sender, `&4&l|&c Организаций нет`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Организации Resistance:`);
    for (const org of orgs) {
        await sendMessage(bot, sender, `&7&l|&f ${org.display_name}`);
    }
}

// ============================================
// /discord - Ссылка на Discord
// ============================================

async function discord(bot, sender, args, db) {
    const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/resistance';
    await sendMessage(bot, sender, `&a&l|&f Discord: &e${discordLink}`);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    balance,
    pay,
    pass,
    id,
    keys,
    idim,
    help,
    rp,
    link,
    fly,
    tenT,
    org,
    discord
};