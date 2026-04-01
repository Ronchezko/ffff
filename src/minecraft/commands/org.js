// src/minecraft/commands/org.js
// Команды для организаций (полиция, армия, больница, академия)

const utils = require('../../shared/utils');

// ============================================
// ПОЛИЦИЯ
// ============================================

// /search [ник] - Личный досмотр
async function search(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /search [ник]`);
        return;
    }
    
    const target = args[0];
    
    // Проверяем, что отправитель в полиции
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        bot.chat(`/msg ${sender} &cТолько полиция может использовать эту команду!`);
        return;
    }
    
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    bot.chat(`/msg ${sender} &6🔍 ЛИЧНЫЙ ДОСМОТР ${target}`);
    bot.chat(`/msg ${sender} &7💰 Баланс: ${utils.formatMoney(targetProfile.money)}`);
    bot.chat(`/msg ${sender} &7🏠 Имущество: ${await getPropertiesCount(target, db)} шт.`);
    bot.chat(`/msg ${sender} &7⚠️ Нарушения: ${await getPunishmentsCount(target, db)}`);
    bot.chat(`/cc &a👮 ${sender} провёл досмотр ${target}`);
}

// /check [ник] - Проверка на судимость
async function check(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /check [ник]`);
        return;
    }
    
    const target = args[0];
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        bot.chat(`/msg ${sender} &cТолько полиция может использовать эту команду!`);
        return;
    }
    
    const punishments = await db.getActivePunishments(target);
    const fines = await db.getFines(target);
    
    bot.chat(`/msg ${sender} &6📋 ПРОВЕРКА ГРАЖДАНИНА ${target}`);
    
    if (punishments.length === 0 && fines.length === 0) {
        bot.chat(`/msg ${sender} &a✅ Нарушений не найдено`);
    } else {
        if (punishments.length > 0) {
            bot.chat(`/msg ${sender} &c⚠️ Активные наказания: ${punishments.length}`);
        }
        if (fines.length > 0) {
            bot.chat(`/msg ${sender} &c💰 Неоплаченные штрафы: ${fines.length}`);
        }
    }
}

// /fine [ник] [сумма] [причина] - Выписать штраф
async function fine(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /fine [ник] [сумма] [причина]`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        bot.chat(`/msg ${sender} &cТолько полиция может использовать эту команду!`);
        return;
    }
    
    // Проверяем ранг (штрафы доступны с сержанта)
    const rank = profile.job_rank;
    const allowedRanks = ['Сержант', 'Прапорщик', 'Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(rank)) {
        bot.chat(`/msg ${sender} &cШтрафы могут выписывать сотрудники от Сержанта и выше!`);
        return;
    }
    
    if (isNaN(amount) || amount <= 0 || amount > 100000) {
        bot.chat(`/msg ${sender} &cСумма штрафа должна быть от 1 до 100 000₽!`);
        return;
    }
    
    // Списываем деньги
    const success = await db.updateMoney(target, -amount, 'fine', reason, sender);
    
    if (success) {
        bot.chat(`/msg ${sender} &a✅ Штраф ${utils.formatMoney(amount)} выписан ${target}`);
        bot.chat(`/msg ${target} &c⚠️ Вам выписан штраф ${utils.formatMoney(amount)} от ${sender} Причина: ${reason}`);
        bot.chat(`/cc &c💰 ${target} оштрафован на ${utils.formatMoney(amount)} ${sender}`);
        if (addLog) addLog(`💰 ${sender} оштрафовал ${target} на ${amount} (${reason})`, 'info');
    } else {
        bot.chat(`/msg ${sender} &cУ игрока ${target} недостаточно средств!`);
    }
}

// /order [ник] - Ордер на досмотр (лейтенант+)
async function order(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /order [ник]`);
        return;
    }
    
    const target = args[0];
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        bot.chat(`/msg ${sender} &cТолько полиция может использовать эту команду!`);
        return;
    }
    
    // Проверяем ранг (ордер доступен с лейтенанта)
    const rank = profile.job_rank;
    const allowedRanks = ['Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(rank)) {
        bot.chat(`/msg ${sender} &cОрдер могут выписывать сотрудники от Лейтенанта и выше!`);
        return;
    }
    
    bot.chat(`/cc &c📜 ОРДЕР НА ДОСМОТР ИМУЩЕСТВА ${target}`);
    bot.chat(`/cc &7Выдан: ${sender}`);
    bot.chat(`/msg ${target} &cВнимание! Выдан ордер на досмотр вашего имущества.`);
}

// ============================================
// АРМИЯ
// ============================================

// /tr [status/уровень] - Уровень тревоги
async function tr(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'army') {
        bot.chat(`/msg ${sender} &cТолько армия может использовать эту команду!`);
        return;
    }
    
    if (args.length === 0) {
        const currentLevel = await db.getSetting('alert_level') || 'Бета';
        bot.chat(`/msg ${sender} &6🚨 ТЕКУЩИЙ УРОВЕНЬ ТРЕВОГИ: &e${currentLevel}`);
        return;
    }
    
    if (args[0].toLowerCase() === 'status') {
        const currentLevel = await db.getSetting('alert_level') || 'Бета';
        bot.chat(`/msg ${sender} &6🚨 Уровень тревоги: &e${currentLevel}`);
        return;
    }
    
    // Установка уровня тревоги (доступно с капитана)
    const rank = profile.job_rank;
    const allowedRanks = ['Капитан', 'Майор', 'Подполковник', 'Полковник', 'Маршал'];
    if (!allowedRanks.includes(rank)) {
        bot.chat(`/msg ${sender} &cОбъявлять тревогу могут сотрудники от Капитана и выше!`);
        return;
    }
    
    const level = args[0];
    const validLevels = ['Альфа', 'Бета', 'Омега'];
    if (!validLevels.includes(level)) {
        bot.chat(`/msg ${sender} &cДоступные уровни: Альфа, Бета, Омега`);
        return;
    }
    
    await db.setSetting('alert_level', level, sender);
    bot.chat(`/cc &c🚨🚨🚨 УРОВЕНЬ ТРЕВОГИ ПОВЫШЕН ДО ${level.toUpperCase()}! 🚨🚨🚨`);
    bot.chat(`/cc &7Объявил: ${sender}`);
}

// /border [ник] - Проверка документов
async function border(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /border [ник]`);
        return;
    }
    
    const target = args[0];
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'army') {
        bot.chat(`/msg ${sender} &cТолько армия может использовать эту команду!`);
        return;
    }
    
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    bot.chat(`/msg ${sender} &6🛂 ПРОВЕРКА ДОКУМЕНТОВ ${target}`);
    bot.chat(`/msg ${sender} &7Статус: ${targetProfile.is_frozen ? '❌ Заморожен' : '✅ Активен'}`);
    bot.chat(`/msg ${sender} &7Структура: ${targetProfile.structure}`);
    bot.chat(`/cc &a⚔️ ${sender} проверил документы ${target}`);
}

// ============================================
// БОЛЬНИЦА
// ============================================

// /redcode [status/on/off] - Красный код
async function redcode(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'hospital') {
        bot.chat(`/msg ${sender} &cТолько больница может использовать эту команду!`);
        return;
    }
    
    if (args.length === 0 || args[0].toLowerCase() === 'status') {
        const isRedCode = await db.getSetting('redcode_active') === 'true';
        bot.chat(`/msg ${sender} &6🚑 КРАСНЫЙ КОД: &e${isRedCode ? 'АКТИВЕН' : 'НЕ АКТИВЕН'}`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    // Включение/выключение (доступно с врача)
    const rank = profile.job_rank;
    const allowedRanks = ['Врач', 'Главный врач'];
    if (!allowedRanks.includes(rank)) {
        bot.chat(`/msg ${sender} &cУправлять красным кодом могут врачи и выше!`);
        return;
    }
    
    if (action === 'on') {
        await db.setSetting('redcode_active', 'true', sender);
        bot.chat(`/cc &c🚑🚑🚑 КРАСНЫЙ КОД АКТИВИРОВАН! 🚑🚑🚑`);
        bot.chat(`/cc &7Объявил: ${sender}`);
    } else if (action === 'off') {
        await db.setSetting('redcode_active', 'false', sender);
        bot.chat(`/cc &a✅ КРАСНЫЙ КОД ДЕАКТИВИРОВАН ${sender}`);
    }
}

// ============================================
// АКАДЕМИЯ
// ============================================

// /grade [ник] [курс] [оценка] - Поставить оценку
async function grade(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /grade [ник] [курс] [оценка]`);
        bot.chat(`/msg ${sender} &7Оценки: 2-5 (2 - не сдал, 3-5 - сдал)`);
        return;
    }
    
    const target = args[0];
    const course = args[1];
    const gradeValue = parseInt(args[2]);
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'academy') {
        bot.chat(`/msg ${sender} &cТолько академия может использовать эту команду!`);
        return;
    }
    
    if (isNaN(gradeValue) || gradeValue < 2 || gradeValue > 5) {
        bot.chat(`/msg ${sender} &cОценка должна быть от 2 до 5!`);
        return;
    }
    
    const passed = gradeValue >= 3;
    
    // Сохраняем результат
    await db.run(`INSERT INTO education_courses (course_name, teacher_nick, student_nick, grade, passed)
        VALUES (?, ?, ?, ?, ?)`, [course, sender, target, gradeValue, passed ? 1 : 0]);
    
    if (passed) {
        // Проверяем, все ли курсы пройдены
        const coursesCount = await db.get('SELECT COUNT(*) as count FROM education_courses WHERE student_nick = ? AND passed = 1', [target]);
        if (coursesCount.count >= 3) {
            await db.run('UPDATE rp_players SET has_education = 1 WHERE minecraft_nick = ?', [target]);
            bot.chat(`/msg ${target} &a🎓 Поздравляем! Вы успешно завершили обучение в Академии!`);
        }
        bot.chat(`/msg ${sender} &a✅ Оценка ${gradeValue} выставлена ${target} за курс "${course}"`);
        bot.chat(`/msg ${target} &a✅ Вам выставлена оценка ${gradeValue} за курс "${course}"`);
    } else {
        bot.chat(`/msg ${sender} &c❌ ${target} не сдал курс "${course}"`);
        bot.chat(`/msg ${target} &c❌ Вы не сдали курс "${course}". Попробуйте снова.`);
    }
    
    if (addLog) addLog(`📚 ${sender} поставил оценку ${gradeValue} ${target} за курс "${course}"`, 'info');
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

async function getPropertiesCount(nick, db) {
    const props = await db.getPlayerProperties(nick);
    return props?.length || 0;
}

async function getPunishmentsCount(nick, db) {
    const punishments = await db.getActivePunishments(nick);
    return punishments?.length || 0;
}

// ============================================
// ЭКСПОРТ
// ============================================
module.exports = {
    // Полиция
    search,
    check,
    fine,
    order,
    // Армия
    tr,
    border,
    // Больница
    redcode,
    // Академия
    grade
};