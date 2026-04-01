// src/minecraft/commands/player.js
// Команды для всех игроков клана

const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');

// Кэш для кулдаунов команд
const commandCooldowns = new Map();

// Проверка кулдауна
function checkCooldown(sender, command, seconds) {
    const key = `${sender}:${command}`;
    const lastUse = commandCooldowns.get(key);
    const now = Date.now();
    
    if (lastUse && now - lastUse < seconds * 1000) {
        const remaining = Math.ceil((seconds * 1000 - (now - lastUse)) / 1000);
        return { allowed: false, remaining };
    }
    
    commandCooldowns.set(key, now);
    return { allowed: true };
}

// ============================================
// /balance - Показать баланс
// ============================================
async function balance(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        bot.chat(`/msg ${sender} &cВы не зарегистрированы в RolePlay! Используйте /rp`);
        return;
    }
    
    const money = profile.money;
    const bank = profile.bank_balance || 0;
    
    bot.chat(`/msg ${sender} &6💰 Баланс: &e${utils.formatMoney(money)}`);
    if (bank > 0) {
        bot.chat(`/msg ${sender} &6🏦 Банк: &e${utils.formatMoney(bank)}`);
    }
}

// ============================================
// /pay [ник] [сумма] - Передать деньги
// ============================================
async function pay(bot, sender, args, db) {
    // Проверка кулдауна (15 секунд)
    const cooldown = checkCooldown(sender, 'pay', 15);
    if (!cooldown.allowed) {
        bot.chat(`/msg ${sender} &cПодождите ${cooldown.remaining} секунд перед следующей оплатой!`);
        return;
    }
    
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /pay [ник] [сумма] (макс 50 000₽)`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    
    if (isNaN(amount) || amount <= 0) {
        bot.chat(`/msg ${sender} &cУкажите корректную сумму!`);
        return;
    }
    
    if (amount > 50000) {
        bot.chat(`/msg ${sender} &cМаксимальная сумма перевода - 50 000₽!`);
        return;
    }
    
    if (sender.toLowerCase() === target.toLowerCase()) {
        bot.chat(`/msg ${sender} &cНельзя перевести деньги самому себе!`);
        return;
    }
    
    // Проверяем, существует ли игрок в RP
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RolePlay!`);
        return;
    }
    
    // Выполняем перевод
    const success = await db.transferMoney(sender, target, amount, `Перевод от ${sender}`);
    
    if (success) {
        bot.chat(`/msg ${sender} &a✅ Вы перевели ${utils.formatMoney(amount)} игроку ${target}`);
        bot.chat(`/msg ${target} &a✅ ${sender} перевел вам ${utils.formatMoney(amount)}`);
    } else {
        bot.chat(`/msg ${sender} &c❌ Недостаточно средств!`);
    }
}

// ============================================
// /pass - Показать паспорт
// ============================================
async function pass(bot, sender, args, db, addLog) {
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        await sendDelayedMessage(bot, sender, `&cВы не зарегистрированы в RolePlay! Используйте /rp`);
        return;
    }
    
    await sendDelayedMessage(bot, sender, `&6╔══════════════════════════════════╗`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &l🏙️ ПАСПОРТ ГРАЖДАНИНА RESISTANCE &6║`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6╠══════════════════════════════════╣`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7Имя: &e${sender}`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7Структура: &e${profile.structure || 'Гражданин'}`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7Должность: &e${profile.job_rank || 'Нет'}`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7Баланс: &e${utils.formatMoney(profile.money || 0)}`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6╚══════════════════════════════════╝`);
}

function getStructureIcon(structure) {
    const icons = {
        'police': '👮 Полиция',
        'army': '⚔️ Армия',
        'hospital': '🏥 Больница',
        'academy': '📚 Академия',
        'government': '🏛️ Правительство'
    };
    return icons[structure] || structure;
}

// ============================================
// /id - Показать ID в БД
// ============================================
async function id(bot, sender, args, db) {
    const member = await db.getClanMember(sender);
    if (!member) {
        bot.chat(`/msg ${sender} &cВы не состоите в клане!`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    const kills = member.kills || 0;
    const deaths = member.deaths || 0;
    const joinedAt = member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'неизвестно';
    
    bot.chat(`/msg ${sender} &6📋 ID: &e${sender}`);
    bot.chat(`/msg ${sender} &6📊 Статистика: &e${kills}🗡️ / ${deaths}💀`);
    bot.chat(`/msg ${sender} &6📅 В клане с: &e${joinedAt}`);
    if (profile) {
        bot.chat(`/msg ${sender} &6💰 Баланс: &e${utils.formatMoney(profile.money)}`);
    }
}

// ============================================
// /keys - Список имущества
// ============================================
async function keys(bot, sender, args, db) {
    const properties = await db.getPlayerProperties(sender);
    
    if (!properties || properties.length === 0) {
        bot.chat(`/msg ${sender} &cУ вас нет имущества. Используйте /idim для просмотра доступных объектов.`);
        return;
    }
    
    bot.chat(`/msg ${sender} &6🏠 Ваше имущество (${properties.length}):`);
    
    for (const prop of properties) {
        const typeIcon = getPropertyIcon(prop.type);
        bot.chat(`/msg ${sender} &7- ${typeIcon} &e#${prop.id} &7(${getPropertyTypeName(prop.type)})`);
    }
    
    bot.chat(`/msg ${sender} &7Используйте &e/idim [номер] &7для информации об объекте.`);
}

function getPropertyIcon(type) {
    const icons = {
        'apartment': '🏢',
        'house': '🏠',
        'business': '🏪',
        'office': '🏛️',
        'port': '⚓'
    };
    return icons[type] || '📦';
}

function getPropertyTypeName(type) {
    const names = {
        'apartment': 'Квартира',
        'house': 'Дом',
        'business': 'Бизнес',
        'office': 'Офис',
        'port': 'Порт'
    };
    return names[type] || type;
}

// ============================================
// /idim [номер] - Информация об имуществе
// ============================================
async function idim(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /idim [номер имущества]`);
        return;
    }
    
    const propertyId = args[0];
    const property = await db.getProperty(propertyId);
    
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с номером ${propertyId} не найдено!`);
        return;
    }
    
    const isAvailable = property.is_available;
    const owner = property.owner_nick || 'Свободно';
    const price = utils.formatMoney(property.price);
    const typeName = getPropertyTypeName(property.type);
    
    bot.chat(`/msg ${sender} &6╔══════════════════════════════════╗`);
    bot.chat(`/msg ${sender} &6║ &l🏠 ИМУЩЕСТВО #${propertyId} &6║`);
    bot.chat(`/msg ${sender} &6╠══════════════════════════════════╣`);
    bot.chat(`/msg ${sender} &6║ &7Тип: &e${typeName}`);
    bot.chat(`/msg ${sender} &6║ &7Цена: &e${price}`);
    bot.chat(`/msg ${sender} &6║ &7Статус: &e${isAvailable ? '✅ Свободно' : '🔒 Занято'}`);
    if (!isAvailable && owner) {
        bot.chat(`/msg ${sender} &6║ &7Владелец: &e${owner}`);
    }
    bot.chat(`/msg ${sender} &6╚══════════════════════════════════╝`);
    
    if (isAvailable) {
        bot.chat(`/msg ${sender} &aДля покупки используйте &e/im buy ${propertyId}`);
    }
}

// ============================================
// /help - Справка
// ============================================
async function help(bot, sender, args, db, addLog) {
    await sendDelayedMessage(bot, sender, `&6╔════════════════════════════════════════╗`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &l📚 КОМАНДЫ RESISTANCE &6║`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6╠════════════════════════════════════════╣`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7💰 Экономика:`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/balance &7- баланс`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/pay [ник] [сумма] &7- перевод`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/pass &7- паспорт`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7🎭 RolePlay:`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/rp &7- регистрация в RP`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║ &7🔗 Прочее:`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/fly &7- полёт (КД 2 мин)`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/10t &7- получить 10к (КД 5 мин)`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6║   &e/discord &7- ссылка на Discord`);
    await utils.sleep(300);
    await sendDelayedMessage(bot, sender, `&6╚════════════════════════════════════════╝`);
}

// ============================================
// /rp - Регистрация в RolePlay
// ============================================
// /rp - Регистрация в RolePlay
// /rp - Регистрация в RolePlay
async function rp(bot, sender, args, db, addLog) {
    // Проверяем, не зарегистрирован ли уже
    const existing = await db.getRPProfile(sender);
    
    // Если игрок уже в RP (не Гражданин) — запрещаем повторную регистрацию
    if (existing && existing.structure !== 'Гражданин') {
        await sendDelayedMessage(bot, sender, `&c❌ Вы уже зарегистрированы в RolePlay!`);
        await utils.sleep(400);
        await sendDelayedMessage(bot, sender, `&7Ваша структура: &e${existing.structure}`);
        await utils.sleep(400);
        await sendDelayedMessage(bot, sender, `&7Ваша должность: &e${existing.job_rank}`);
        return;
    }
    
    // Если игрок уже начал регистрацию (есть ожидающий код)
    if (global.pendingRegistrations && global.pendingRegistrations.has(sender)) {
        const pending = global.pendingRegistrations.get(sender);
        if (Date.now() < pending.expires) {
            await sendDelayedMessage(bot, sender, `&e⏳ У вас уже есть активный код регистрации!`);
            await utils.sleep(400);
            await sendDelayedMessage(bot, sender, `&7Ваш код: &e${pending.code}`);
            await utils.sleep(400);
            await sendDelayedMessage(bot, sender, `&7Отправьте его мне в ЛС для завершения регистрации.`);
            return;
        } else {
            // Код истёк, удаляем
            global.pendingRegistrations.delete(sender);
        }
    }
    
    // Проверяем, состоит ли в клане
    const clanMember = await db.getClanMember(sender);
    if (!clanMember) {
        await sendDelayedMessage(bot, sender, `&c❌ Сначала вступите в клан Resistance!`);
        await utils.sleep(400);
        await sendDelayedMessage(bot, sender, `&7Подайте заявку в клан через меню или команду /c join`);
        return;
    }
    
    // Генерируем код проверки
    const code = utils.generateCode(6);
    
    // Сохраняем код в временное хранилище
    if (!global.pendingRegistrations) global.pendingRegistrations = new Map();
    global.pendingRegistrations.set(sender, {
        code,
        expires: Date.now() + 5 * 60 * 1000
    });
    
    // Отправляем сообщения с задержкой
    await sendDelayedMessage(bot, sender, `&6📝 РЕГИСТРАЦИЯ В ROLEPLAY`);
    await utils.sleep(500);
    await sendDelayedMessage(bot, sender, `&7Для регистрации отправьте мне в ЛС код: &e${code}`);
    await utils.sleep(500);
    await sendDelayedMessage(bot, sender, `&7Код действителен 5 минут.`);
    
    if (addLog) addLog(`📝 Генерация кода RP для ${sender}: ${code}`, 'debug');
}

// Вспомогательная функция
async function sendDelayedMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

// ============================================
// /link [код] - Привязка Discord
// ============================================
async function link(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /link [код верификации]`);
        return;
    }
    
    const code = args[0].toUpperCase();
    const result = await db.verifyCode(code, sender);
    
    if (result.success) {
        bot.chat(`/msg ${sender} &a✅ Discord аккаунт успешно привязан!`);
        bot.chat(`/cc &a✅ &e${sender} &aпривязал Discord аккаунт!`);
    } else {
        bot.chat(`/msg ${sender} &c❌ Неверный код верификации. Запросите новый код в Discord.`);
    }
}

// ============================================
// /fly - Выдать полёт (КД на весь клан 2 мин)
// ============================================
let lastFlyTime = 0;
async function fly(bot, sender, args, db) {
    const now = Date.now();
    if (now - lastFlyTime < 120000) {
        const remaining = Math.ceil((120000 - (now - lastFlyTime)) / 1000);
        bot.chat(`/msg ${sender} &cКоманда /fly доступна через ${remaining} секунд!`);
        return;
    }
    
    lastFlyTime = now;
    bot.chat(`/fly ${sender}`);
    bot.chat(`/cc &a✨ &e${sender} &aиспользовал /fly! Следующее использование через 2 минуты.`);
}

// ============================================
// /10t - Получить 10к (КД 5 мин)
// ============================================
let lastTenTTime = 0;
async function tenT(bot, sender, args, db) {
    const now = Date.now();
    if (now - lastTenTTime < 300000) {
        const remaining = Math.ceil((300000 - (now - lastTenTTime)) / 1000);
        bot.chat(`/msg ${sender} &cКоманда /10t доступна через ${remaining} секунд!`);
        return;
    }
    
    lastTenTTime = now;
    
    // Проверяем, зарегистрирован ли в RP
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        bot.chat(`/msg ${sender} &cСначала зарегистрируйтесь в RolePlay через /rp!`);
        return;
    }
    
    await db.updateMoney(sender, 10000, 'bonus', 'Ежедневный бонус /10t', 'system');
    bot.chat(`/msg ${sender} &a✅ Вы получили 10 000₽!`);
    bot.chat(`/cc &a💰 &e${sender} &aполучил ежедневный бонус!`);
}

// ============================================
// /org o list - Список организаций
// ============================================
async function org(bot, sender, args, db) {
    if (args.length < 1 || args[0] !== 'o') {
        bot.chat(`/msg ${sender} &cИспользование: /org o list`);
        return;
    }
    
    if (args[1] !== 'list') {
        bot.chat(`/msg ${sender} &cИспользование: /org o list`);
        return;
    }
    
    const orgs = await db.getAllOrganizations();
    
    bot.chat(`/msg ${sender} &6📋 ДОСТУПНЫЕ ОРГАНИЗАЦИИ:`);
    for (const org of orgs) {
        const members = await db.getOrgMembers(org.name);
        const memberCount = members ? members.length : 0;
        bot.chat(`/msg ${sender} &7- ${getStructureIcon(org.name)} &e${org.display_name} &7(${memberCount} чел.)`);
    }
    bot.chat(`/msg ${sender} &7Для вступления обратитесь к лидеру организации.`);
}

// ============================================
// /discord - Ссылка на Discord
// ============================================
async function discord(bot, sender, args, db) {
    const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/resistance';
    bot.chat(`/msg ${sender} &6💬 Discord сервер Resistance: &e${discordLink}`);
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