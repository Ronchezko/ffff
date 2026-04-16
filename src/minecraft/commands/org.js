// src/minecraft/commands/org.js
// Команды для организаций (полиция, армия, больница, академия)

const utils = require('../../shared/utils');
require('../../shared/cleanNick')
// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================



async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

// Проверка, состоит ли игрок в указанной организации
async function isInOrganization(nick, orgName, db) {
    const profile = await db.getRPProfile(nick);
    return profile && profile.structure && profile.structure.toLowerCase() === orgName.toLowerCase();
}

// Проверка ранга сотрудника
async function hasRank(nick, minRank, db) {
    const profile = await db.getRPProfile(nick);
    if (!profile) return false;
    
    const ranks = {
        'Рядовой': 1,
        'Сержант': 2,
        'Старшина': 2,
        'Прапорщик': 3,
        'Младший лейтенант': 3,
        'Лейтенант': 4,
        'Капитан': 5,
        'Майор': 5,
        'Подполковник': 6,
        'Полковник': 7,
        'Маршал': 8,
        'Санитар(ка)': 1,
        'Сестра-хозяйка': 2,
        'Медсёстры/Брат': 3,
        'Фельдшер': 4,
        'Лаборант': 3,
        'Акушерка': 4,
        'Врач': 6,
        'Главный врач': 7,
        'Стажёр': 1,
        'Ассистент': 2,
        'Преподаватель': 3,
        'Зав. кафедрой': 4,
        'Проректор': 5,
        'Директор': 6
    };
    
    const rankLevel = ranks[profile.job_rank] || 0;
    return rankLevel >= minRank;
}

// ============================================
// ПОЛИЦИЯ (МВД)
// ============================================

// /search [ник] - Личный досмотр (от начального ранга)
async function search(bot, sender, args, db) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/search [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'police') {
        await sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    const properties = await db.getPlayerProperties(target);
    const punishments = await db.all(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND active = 1`, [target]);
    const fines = await db.all(`SELECT * FROM money_logs WHERE LOWER(player) = LOWER(?) AND type = 'fine'`, [target]);
    
    await sendMessage(bot, sender, `&a&l|&f Личный досмотр &e${target}`);
    await sendMessage(bot, sender, `&7&l|&f Баланс: &e${targetProfile.money?.toLocaleString() || 0}₽`);
    await sendMessage(bot, sender, `&7&l|&f Имущество: &e${properties?.length || 0} шт.`);
    if (punishments?.length > 0) {
        await sendMessage(bot, sender, `&7&l|&f Нарушения: &e${punishments.length}`);
    }
    if (fines?.length > 0) {
        await sendMessage(bot, sender, `&7&l|&f Штрафы: &e${fines.length}`);
    }
    
    bot.chat(`/cc &a👮 ${sender} провёл досмотр ${target}`);
}

// /check [ник] - Проверка на судимость (от начального ранга)
async function check(bot, sender, args, db) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/check [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'police') {
        await sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const punishments = await db.all(`SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type IN ('mute', 'blacklist') AND active = 1`, [target]);
    const fines = await db.all(`SELECT * FROM money_logs WHERE LOWER(player) = LOWER(?) AND type = 'fine'`, [target]);
    
    if ((!punishments || punishments.length === 0) && (!fines || fines.length === 0)) {
        await sendMessage(bot, sender, `&a&l|&f Гражданин &e${target} &a- нарушений не найдено`);
    } else {
        await sendMessage(bot, sender, `&a&l|&f Проверка &e${target}`);
        if (punishments?.length > 0) {
            await sendMessage(bot, sender, `&7&l|&f Активные наказания: &e${punishments.length}`);
        }
        if (fines?.length > 0) {
            await sendMessage(bot, sender, `&7&l|&f Штрафы: &e${fines.length}`);
        }
    }
}

// /fine [ник] [сумма] [причина] - Выписать штраф (от Сержанта)
async function fine(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/fine [ник] [сумма] [причина]`);
        await sendMessage(bot, sender, `&7&l|&f Сумма: &e1 - 100 000₽`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'police') {
        await sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    // Проверка ранга (от Сержанта)
    const allowedRanks = ['Сержант', 'Прапорщик', 'Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(profile.job_rank)) {
        await sendMessage(bot, sender, `&4&l|&c Штрафы могут выписывать сотрудники от Сержанта и выше`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount <= 0 || amount > 100000) {
        await sendMessage(bot, sender, `&4&l|&c Сумма штрафа должна быть от 1 до 100 000₽`);
        return;
    }
    
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    const success = await db.updateMoney(target, -amount, 'fine', reason, sender);
    
    if (success) {
        await sendMessage(bot, sender, `&a&l|&f Штраф &e${amount.toLocaleString()}₽ &aвыписан &e${target}`);
        await sendMessage(bot, target, `&4&l|&f Вам выписан штраф &e${amount.toLocaleString()}₽`);
        await sendMessage(bot, target, `&4&l|&f От &e${sender}&f. Причина: &e${reason}`);
        bot.chat(`/cc &c💰 ${target} оштрафован на ${amount.toLocaleString()}₽ от ${sender}`);
        if (addLog) addLog(`💰 ${sender} оштрафовал ${target} на ${amount} (${reason})`, 'info');
    } else {
        await sendMessage(bot, sender, `&4&l|&c У игрока &e${target} &cнедостаточно средств`);
    }
}

// /order [ник] - Ордер на досмотр имущества (от Лейтенанта)
async function order(bot, sender, args, db) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/order [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'police') {
        await sendMessage(bot, sender, `&4&l|&c Только полиция может использовать эту команду`);
        return;
    }
    
    // Проверка ранга (от Лейтенанта)
    const allowedRanks = ['Лейтенант', 'Капитан', 'Подполковник', 'Полковник'];
    if (!allowedRanks.includes(profile.job_rank)) {
        await sendMessage(bot, sender, `&4&l|&c Ордер могут выписывать сотрудники от Лейтенанта и выше`);
        return;
    }
    
    const target = args[0];
    bot.chat(`/cc &c📜 ОРДЕР НА ДОСМОТР ИМУЩЕСТВА ${target}`);
    bot.chat(`/cc &7Выдан: ${sender}`);
    await sendMessage(bot, target, `&4&l|&f Внимание! Выдан ордер на досмотр вашего имущества от &e${sender}`);
}

// ============================================
// АРМИЯ
// ============================================

// /tr status - Проверка уровня тревоги (от начального ранга)
// /tr [уровень] - Объявить тревогу (от Капитана)
async function tr(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'army') {
        await sendMessage(bot, sender, `&4&l|&c Только армия может использовать эту команду`);
        return;
    }
    
    if (args.length === 0 || args[0].toLowerCase() === 'status') {
        const currentLevel = await db.getSetting('alert_level') || 'Бета';
        await sendMessage(bot, sender, `&a&l|&f Уровень тревоги: &e${currentLevel}`);
        return;
    }
    
    // Проверка ранга (от Капитана)
    const allowedRanks = ['Капитан', 'Майор', 'Подполковник', 'Полковник', 'Маршал'];
    if (!allowedRanks.includes(profile.job_rank)) {
        await sendMessage(bot, sender, `&4&l|&c Объявлять тревогу могут сотрудники от Капитана и выше`);
        return;
    }
    
    const level = args[0];
    const validLevels = ['Альфа', 'Бета', 'Омега'];
    if (!validLevels.includes(level)) {
        await sendMessage(bot, sender, `&4&l|&c Доступные уровни: &eАльфа, Бета, Омега`);
        return;
    }
    
    await db.setSetting('alert_level', level, sender);
    bot.chat(`/cc &c🚨🚨🚨 УРОВЕНЬ ТРЕВОГИ ПОВЫШЕН ДО ${level.toUpperCase()}! 🚨🚨🚨`);
    bot.chat(`/cc &7Объявил: ${sender}`);
}

// /border [ник] - Проверить документы (от начального ранга)
async function border(bot, sender, args, db) {
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/border [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'army') {
        await sendMessage(bot, sender, `&4&l|&c Только армия может использовать эту команду`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Проверка документов &e${target}`);
    await sendMessage(bot, sender, `&7&l|&f Статус: ${targetProfile.is_frozen ? '❌ Заморожен' : '✅ Активен'}`);
    await sendMessage(bot, sender, `&7&l|&f Структура: &e${targetProfile.structure}`);
    await sendMessage(bot, sender, `&7&l|&f Ранг: &e${targetProfile.job_rank}`);
    bot.chat(`/cc &a⚔️ ${sender} проверил документы ${target}`);
}

// ============================================
// БОЛЬНИЦА
// ============================================

// /redcode status - Проверка красного кода (от начального ранга)
// /redcode on/off - Объявить/отменить красный код (от Врача)
async function redcode(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'hospital') {
        await sendMessage(bot, sender, `&4&l|&c Только больница может использовать эту команду`);
        return;
    }
    
    if (args.length === 0 || args[0].toLowerCase() === 'status') {
        const isRedCode = await db.getSetting('redcode_active') === 'true';
        await sendMessage(bot, sender, `&a&l|&f Красный код: &e${isRedCode ? 'АКТИВЕН' : 'НЕ АКТИВЕН'}`);
        return;
    }
    
    const action = args[0].toLowerCase();
    
    // Проверка ранга (от Врача)
    const allowedRanks = ['Врач', 'Главный врач'];
    if (!allowedRanks.includes(profile.job_rank)) {
        await sendMessage(bot, sender, `&4&l|&c Управлять красным кодом могут врачи и выше`);
        return;
    }
    
    if (action === 'on') {
        await db.setSetting('redcode_active', 'true', sender);
        bot.chat(`/cc &c🚑🚑🚑 КРАСНЫЙ КОД АКТИВИРОВАН! 🚑🚑🚑`);
        bot.chat(`/cc &7Объявил: ${sender}`);
        await sendMessage(bot, sender, `&a&l|&f Красный код &2активирован`);
    } else if (action === 'off') {
        await db.setSetting('redcode_active', 'false', sender);
        bot.chat(`/cc &a✅ КРАСНЫЙ КОД ДЕАКТИВИРОВАН ${sender}`);
        await sendMessage(bot, sender, `&a&l|&f Красный код &2деактивирован`);
    } else {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/redcode [status/on/off]`);
    }
}

// ============================================
// АКАДЕМИЯ
// ============================================

// /grade [ник] [курс] [оценка] - Поставить оценку (от начального ранга)
async function grade(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/grade [ник] [курс] [оценка]`);
        await sendMessage(bot, sender, `&7&l|&f Оценки: &e2 &7- не сдал, &e3-5 &7- сдал`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure.toLowerCase() !== 'academy') {
        await sendMessage(bot, sender, `&4&l|&c Только академия может использовать эту команду`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const course = args[1];
    const gradeValue = parseInt(args[2]);
    
    if (isNaN(gradeValue) || gradeValue < 2 || gradeValue > 5) {
        await sendMessage(bot, sender, `&4&l|&c Оценка должна быть от 2 до 5`);
        return;
    }
    
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    const passed = gradeValue >= 3;
    let gradeText = '';
    if (passed) {
        if (gradeValue === 5) gradeText = 'отлично';
        else if (gradeValue === 4) gradeText = 'хорошо';
        else gradeText = 'нормально';
    } else {
        gradeText = 'завалил';
    }
    
    await db.run(`INSERT INTO education_courses (course_name, teacher_nick, student_nick, grade, passed) VALUES (?, ?, ?, ?, ?)`, 
        [course, sender, target, gradeValue, passed ? 1 : 0]);
    
    if (passed) {
        const coursesCount = await db.get('SELECT COUNT(*) as count FROM education_courses WHERE LOWER(student_nick) = LOWER(?) AND passed = 1', [target]);
        if (coursesCount.count >= 3) {
            await db.run('UPDATE rp_players SET has_education = 1 WHERE LOWER(minecraft_nick) = LOWER(?)', [target]);
            await sendMessage(bot, target, `&a&l|&f Поздравляем! Вы успешно завершили обучение в Академии!`);
        }
        await sendMessage(bot, sender, `&a&l|&f Оценка &e${gradeValue} &a(${gradeText}) выставлена &e${target} &aза курс &e"${course}"`);
        await sendMessage(bot, target, `&a&l|&f Вам выставлена оценка &e${gradeValue} &a(${gradeText}) за курс &e"${course}"`);
    } else {
        await sendMessage(bot, sender, `&4&l|&f ${target} &cне сдал курс &e"${course}"`);
        await sendMessage(bot, target, `&4&l|&f Вы не сдали курс &e"${course}"&f. Попробуйте снова`);
    }
    
    if (addLog) addLog(`📚 ${sender} поставил оценку ${gradeValue} ${target} за курс "${course}"`, 'info');
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
    grade,
    isInOrganization,
    hasRank
};