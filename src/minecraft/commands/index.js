const logger = require('../../shared/logger');
const civilian = require('./civilian');
const property = require('./property');
const orgLeader = require('./org_leader');
const ministry = require('./ministry');
const structureSpec = require('./structure_spec');
const staff = require('./staff');
const adminArp = require('./admin_arp');

/**
 * ГЛАВНЫЙ ДИСПЕТЧЕР КОМАНД
 */
async function handleCommand(bot, nick, fullMsg, db, logFn, sendPrivate, sendClan, getRealName) {
    // 1. Предварительная обработка
    const args = fullMsg.trim().split(/\s+/);
    const cmd = args.shift().toLowerCase(); // Сама команда (например, /pay)
    const callbacks = { sendPrivate, sendClan };

    // 2. Проверка глобальной блокировки (Maintenance)
    // Только команда /arp доступна администратору в этом режиме
    if (global.maintenance && cmd !== '/arp') {
        return sendPrivate(nick, "&#FF0202| &#76C519" + nick + "&#D4D4D4, бот в режиме ожидания: &c'Действия заблокированы Администратором'&r");
    }

    try {
        // 3. Распределение команд по модулям
        
        // --- Блок Гражданских и Клановых команд ---
        if (['/pay', '/balance', '/bal', '/pass', '/id', '/keys', '/idim', '/help', '/discord', '/ds', '/rp', '/link', '/10t', '/fly'].includes(cmd)) {
            // Команды /fly, /10t, /link, /rp обрабатываются внутри civilian или спец. модулей
            return await civilian.handle(bot, nick, cmd, args, callbacks);
        }

        // --- Блок Имущества ---
        if (['/im', '/biz', '/office', '/of'].includes(cmd)) {
            return await property.handle(bot, nick, cmd, args, callbacks);
        }

        // --- Блок Лидеров и Министров ---
        if (['/org', '/o'].includes(cmd)) {
            // Модули сами проверят ранг внутри
            await orgLeader.handle(bot, nick, cmd, args, callbacks);
            await ministry.handle(bot, nick, cmd, args, callbacks);
            return;
        }

        // --- Блок Специфики Структур (МВД, Армия и т.д.) ---
        if (['/search', '/check', '/fine', '/order', '/tr', '/border', '/redcode', '/rc', '/grade'].includes(cmd)) {
            return await structureSpec.handle(bot, nick, cmd, args, callbacks);
        }

        // --- Блок Персонала (Модерация) ---
        if (['/mute', '/kick', '/blacklist', '/bl', '/admin', '/a', '/awarn'].includes(cmd)) {
            return await staff.handle(bot, nick, cmd, args, callbacks);
        }

        // --- Блок Администрирования /ARP ---
        if (['/arp', '/spam', '/r'].includes(cmd)) {
            return await adminArp.handle(bot, nick, cmd, args, callbacks);
        }

        // 4. ЕСЛИ КОМАНДА НЕ НАЙДЕНА (Логика из промта)
        // Если длина команды > 5 символов, обрезаем и ставим три точки
        let errorCmd = cmd;
        if (cmd.length > 5) {
            errorCmd = cmd.substring(0, 5) + "...";
        }

        // Красивое уведомление о неизвестной команде по шаблону
        const errorMsg = `&#FF0202| &#76C519${nick}&#D4D4D4, неизвестная команда: &c'${errorCmd}'&#D4D4D4. Напишите &c'/help'&#D4D4D4 для списка команд&r`;
        sendPrivate(nick, errorMsg);

    } catch (err) {
        logger.error(`[CMD ERROR] Ошибка при выполнении ${cmd}: ${err.message}`);
        sendPrivate(nick, `&#FF0202| &#C58383Произошла внутренняя ошибка при обработке команды.`);
    }
}

module.exports = { handleCommand };