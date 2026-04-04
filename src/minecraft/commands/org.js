// src/minecraft/commands/org.js
// Команды для организаций (полиция, армия, больница, академия)

const utils = require('../../shared/utils');

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// ПОЛИЦИЯ
// ============================================

// /search [ник] - Личный досмотр
async function search(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/search [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    const properties = await db.getPlayerProperties(target);
    const punishments = await db.all(`SELECT * FROM punishments WHERE player = ? AND active = 1`, [target]);
    
    sendMessage(bot, sender, `&a&l|&f Личный досмотр &e${target}`);
    sendMessage(bot, sender, `&7&l|&f Баланс: &e${targetProfile.money?.toLocaleString() || 0}₽ &7| Имущество: &e${properties?.length || 0} шт.`);
    sendMessage(bot, sender, `&7&l|&f Нарушения: &e${punishments?.length || 0}`);
    bot.chat(`/cc &a👮 ${sender} провёл досмотр ${target}`);
}

// /check [ник] - Проверка на судимость
async function checkOrg(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/check [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const punishments = await db.all(`SELECT * FROM punishments WHERE player = ? AND type IN ('mute', 'blacklist') AND active = 1`, [target]);
    const fines = await db.all(`SELECT * FROM money_logs WHERE player = ? AND type = 'fine'`, [target]);
    
    if ((!punishments || punishments.length === 0) && (!fines || fines.length === 0)) {
        sendMessage(bot, sender, `&a&l|&f Гражданин &e${target} &a- нарушений не найдено`);
    } else {
        sendMessage(bot, sender, `&a&l|&f Проверка &e${target}`);
        if (punishments?.length > 0) sendMessage(bot, sender, `&7&l|&f Активные наказания: &e${punishments.length}`);
        if (fines?.length > 0) sendMessage(bot, sender, `&7&l|&f Штрафы: &e${fines.length}`);
    }
}

// /fine [ник] [сумма] [причина] - Выписать штраф
async function fine(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/fine [ник] [сумма] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const rank = profile.job_rank;
    const allowedRanks = ['Сержант', 'Прапорщик', 'Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(rank)) {
        sendMessage(bot, sender, `&4&l|&c Штрафы могут выписывать сотрудники от Сержанта и выше`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount <= 0 || amount > 100000) {
        sendMessage(bot, sender, `&4&l|&c Сумма штрафа должна быть от 1 до 100 000₽`);
        return;
    }
    
    const success = await db.updateMoney(target, -amount, 'fine', reason, sender);
    
    if (success) {
        sendMessage(bot, sender, `&a&l|&f Штраф &e${amount.toLocaleString()}₽ &aвыписан &e${target}`);
        sendMessage(bot, target, `&c&l|&f Вам выписан штраф &e${amount.toLocaleString()}₽ &cот &e${sender}&f. Причина: &e${reason}`);
        bot.chat(`/cc &c💰 ${target} оштрафован на ${amount.toLocaleString()}₽ ${sender}`);
        if (addLog) addLog(`💰 ${sender} оштрафовал ${target} на ${amount} (${reason})`, 'info');
    } else {
        sendMessage(bot, sender, `&4&l|&c У игрока &e${target} &cнедостаточно средств`);
    }
}

// /order [ник] - Ордер на досмотр
async function order(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/order [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'police') {
        sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const rank = profile.job_rank;
    const allowedRanks = ['Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(rank)) {
        sendMessage(bot, sender, `&4&l|&c Ордер могут выписывать сотрудники от Лейтенанта и выше`);
        return;
    }
    
    const target = args[0];
    bot.chat(`/cc &c📜 ОРДЕР НА ДОСМОТР ИМУЩЕСТВА ${target}`);
    bot.chat(`/cc &7Выдан: ${sender}`);
    sendMessage(bot, target, `&c&l|&f Внимание! Выдан ордер на досмотр вашего имущества`);
}

// ============================================
// АРМИЯ
// ============================================

// /tr [status/уровень] - Уровень тревоги
async function tr(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'army') {
        sendMessage(bot, sender, `&4&l|&c Только армия может использовать эту команду`);
        return;
    }
    
    if (args.length === 0 || args[0].toLowerCase() === 'status') {
        const currentLevel = await db.getSetting('alert_level') || 'Бета';
        sendMessage(bot, sender, `&a&l|&f Уровень тревоги: &e${currentLevel}`);
        return;
    }
    
    const rank = profile.job_rank;
    const allowedRanks = ['Капитан', 'Майор', 'Подполковник', 'Полковник', 'Маршал'];
    if (!allowedRanks.includes(rank)) {
        sendMessage(bot, sender, `&4&l|&c Объявлять тревогу могут сотрудники от Капитана и выше`);
        return;
    }
    
    const level = args[0];
    const validLevels = ['Альфа', 'Бета', 'Омега'];
    if (!validLevels.includes(level)) {
        sendMessage(bot, sender, `&4&l|&c Доступные уровни: &eАльфа, Бета, Омега`);
        return;
    }
    
    await db.setSetting('alert_level', level, sender);
    bot.chat(`/cc &c🚨🚨🚨 УРОВЕНЬ ТРЕВОГИ ПОВЫШЕН ДО ${level.toUpperCase()}! 🚨🚨🚨`);
    bot.chat(`/cc &7Объявил: ${sender}`);
}

// /border [ник] - Проверка документов
async function border(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/border [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'army') {
        sendMessage(bot, sender, `&4&l|&c Только армия может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Проверка документов &e${target}`);
    sendMessage(bot, sender, `&7&l|&f Статус: ${targetProfile.is_frozen ? '❌ Заморожен' : '✅ Активен'}`);
    sendMessage(bot, sender, `&7&l|&f Структура: &e${targetProfile.structure}`);
    bot.chat(`/cc &a⚔️ ${sender} проверил документы ${target}`);
}

// ============================================
// БОЛЬНИЦА
// ============================================

// /redcode [status/on/off] - Красный код
async function redcode(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'hospital') {
        sendMessage(bot, sender, `&4&l|&c Только больница может использовать эту команду`);
        return;
    }
    
    if (args.length === 0 || args[0].toLowerCase() === 'status') {
        const isRedCode = await db.getSetting('redcode_active') === 'true';
        sendMessage(bot, sender, `&a&l|&f Красный код: &e${isRedCode ? 'АКТИВЕН' : 'НЕ АКТИВЕН'}`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const rank = profile.job_rank;
    const allowedRanks = ['Врач', 'Главный врач'];
    if (!allowedRanks.includes(rank)) {
        sendMessage(bot, sender, `&4&l|&c Управлять красным кодом могут врачи и выше`);
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
        sendMessage(bot, sender, `&4&l|&c Использование: &e/grade [ник] [курс] [оценка]`);
        sendMessage(bot, sender, `&7&l|&f Оценки: &e2 &7- не сдал, &e3-5 &7- сдал`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure !== 'academy') {
        sendMessage(bot, sender, `&4&l|&c Только академия может использовать эту команду`);
        return;
    }
    
    const target = args[0];
    const course = args[1];
    const gradeValue = parseInt(args[2]);
    
    if (isNaN(gradeValue) || gradeValue < 2 || gradeValue > 5) {
        sendMessage(bot, sender, `&4&l|&c Оценка должна быть от 2 до 5`);
        return;
    }
    
    const passed = gradeValue >= 3;
    const gradeText = passed ? (gradeValue === 5 ? 'отлично' : (gradeValue === 4 ? 'хорошо' : 'нормально')) : 'завалил';
    
    await db.run(`INSERT INTO education_courses (course_name, teacher_nick, student_nick, grade, passed) VALUES (?, ?, ?, ?, ?)`, 
        [course, sender, target, gradeValue, passed ? 1 : 0]);
    
    if (passed) {
        const coursesCount = await db.get('SELECT COUNT(*) as count FROM education_courses WHERE student_nick = ? AND passed = 1', [target]);
        if (coursesCount.count >= 3) {
            await db.run('UPDATE rp_players SET has_education = 1 WHERE minecraft_nick = ?', [target]);
            sendMessage(bot, target, `&a&l|&f Поздравляем! Вы успешно завершили обучение в Академии!`);
        }
        sendMessage(bot, sender, `&a&l|&f Оценка &e${gradeValue} &a(${gradeText}) выставлена &e${target} &aза курс &e"${course}"`);
        sendMessage(bot, target, `&a&l|&f Вам выставлена оценка &e${gradeValue} &a(${gradeText}) за курс &e"${course}"`);
    } else {
        sendMessage(bot, sender, `&4&l|&f ${target} &cне сдал курс &e"${course}"`);
        sendMessage(bot, target, `&4&l|&f Вы не сдали курс &e"${course}"&f. Попробуйте снова`);
    }
    
    if (addLog) addLog(`📚 ${sender} поставил оценку ${gradeValue} ${target} за курс "${course}"`, 'info');
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    // Полиция
    search,
    check: checkOrg,
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