// src/minecraft/commands/rp.js — RP-команды Resistance City v5.0.0
// /rp — регистрация в RolePlay, статус, информация
// Полная система с верификацией через ЛС

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

// ==================== ХРАНИЛИЩЕ ОЖИДАЮЩИХ ВЕРИФИКАЦИЙ ====================
const pendingVerifications = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of pendingVerifications) {
        if (now - value.timestamp > 300000) pendingVerifications.delete(key);
    }
}, 300000);

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function msg(bot, user, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/msg ' + user + ' ' + text); } catch(e) {}
}
function cc(bot, text) {
    try { if (text.length > 200) text = text.substring(0, 197) + '...'; bot.chat('/cc ' + text); } catch(e) {}
}

// ==================== /RP ====================
function registerRp(bot, username, args, source) {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'status' || subCommand === 'stats' || subCommand === 'profile') {
        return showRpStatus(bot, username, source);
    }
    if (subCommand === 'info') {
        return showRpInfo(bot, username, source);
    }
    if (subCommand === 'help') {
        return showRpHelp(bot, username, source);
    }

    return startRpRegistration(bot, username, source);
}

// ==================== ПОКАЗ СТАТУСА RP ====================
function showRpStatus(bot, username, source) {
    const member = db.rpMembers.get(username);

    if (!member || member.is_active !== 1) {
        return msg(bot, username, '&#80C4C5📋 Вы не в RP. Используйте &#FFB800/rp &#80C4C5для регистрации\n&#D4D4D4RP — система ролевой игры: работа, экономика, недвижимость, зарплата');
    }

    const edu = db.education.get(username);
    const medBook = db.medicalBooks.isValid(username);
    const properties = db.properties.getOwned(username);
    const bankAccount = db.bank.getAccount(username);
    const activeLicenses = db.licenses.getActive(username);
    const clanMember = db.members.get(username);

    // Авто-освобождение
    if (member.is_in_jail && member.jail_until && new Date(member.jail_until) < new Date()) {
        db.rpMembers.releaseFromJail(username);
        member.is_in_jail = 0;
        member.jail_until = null;
    }
    if (member.is_sick && member.sick_until && new Date(member.sick_until) < new Date()) {
        db.rpMembers.healFromSick(username, 'natural');
        member.is_sick = 0;
        member.sick_until = null;
    }

    // СТРОКА 1
    msg(bot, username,
        '&#80C4C5📋 Профиль &#76C519' + username +
        ' &#D4D4D4| ID: &#76C519' + member.id +
        ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(member.balance) +
        (bankAccount ? ' &#D4D4D4| Банк: &#76C519' + utils.formatMoney(bankAccount.balance) : '')
    );

    // СТРОКА 2
    const orgText = member.organization
        ? '&#FFB800' + member.organization + ' &#D4D4D4(' + (member.rank || 'Нет') + ')'
        : '&#D4D4D4Безработный';
    msg(bot, username,
        orgText +
        ' &#D4D4D4| Баллы: &#FFB800' + (member.points || 0) +
        ' &#D4D4D4| PayDay: &#FFB800' + (member.payday_count || 0) +
        ' &#D4D4D4| Часов: &#76C519' + (member.total_hours || 0).toFixed(1)
    );

    // СТРОКА 3
    const eduText = (edu?.has_basic ? '&#76C519База' : '&#CA4E4EНет') + (edu?.has_advanced ? ' &#80C4C5+Доп' : '');
    const medText = medBook ? '&#76C519Есть' : '&#CA4E4EНет';
    msg(bot, username,
        '&#D4D4D4Образование: ' + eduText +
        ' &#D4D4D4| Медкнижка: ' + medText +
        ' &#D4D4D4| Имущества: &#76C519' + properties.length +
        ' &#D4D4D4| Лицензий: &#76C519' + activeLicenses.length
    );

    // СТРОКА 4 — Статус
    const statusParts = [];
    if (!member.is_in_city) statusParts.push('&#CA4E4EНе в городе');
    if (member.is_in_jail) statusParts.push('&#CA4E4EВ тюрьме');
    if (member.is_sick) statusParts.push('&#FFB800Болен');
    if (member.is_frozen) statusParts.push('&#CA4E4EЗаморожен');
    if (member.warns > 0) statusParts.push('&#FFB800Предупр: ' + member.warns + '/3');
    if (statusParts.length === 0) statusParts.push('&#76C519Всё хорошо');

    msg(bot, username, '&#D4D4D4Статус: ' + statusParts.join(' &#D4D4D4| '));

    if (clanMember) {
        msg(bot, username,
            '&#D4D4D4Убийств: &#CA4E4E' + (clanMember.kills || 0) +
            ' &#D4D4D4| Смертей: &#FFB800' + (clanMember.deaths || 0) +
            ' &#D4D4D4| K/D: &#80C4C5' + (clanMember.deaths > 0 ? (clanMember.kills / clanMember.deaths).toFixed(2) : clanMember.kills)
        );
    }
}

// ==================== ИНФОРМАЦИЯ О RP ====================
function showRpInfo(bot, username, source) {
    msg(bot, username, '&#80C4C5📖 RolePlay Resistance — система ролевой игры');
    msg(bot, username, '&#D4D4D4Структуры: Полиция, Армия, Больница, Академия, Мэрия. Зарплата каждый час. Недвижимость и бизнесы.');
    msg(bot, username, '&#D4D4D4Работа: 14:00-17:00, 18:00-23:00 МСК. Для регистрации: &#FFB800/rp');
}

// ==================== ПОМОЩЬ ПО RP ====================
function showRpHelp(bot, username, source) {
    msg(bot, username, '&#80C4C5❓ RP-команды: /rp — регистрация, /rp status — профиль, /rp info — о системе');
    msg(bot, username, '&#D4D4D4/pay <ник> <сумма> — перевод, /balance — баланс, /pass — паспорт');
    msg(bot, username, '&#D4D4D4/im — имущество, /biz — бизнес, /office — офис, /org — организации, /license — лицензии');
}

// ==================== НАЧАЛО РЕГИСТРАЦИИ ====================
function startRpRegistration(bot, username, source) {
    const clanMember = db.members.get(username);
    if (!clanMember || clanMember.is_in_clan !== 1) {
        return msg(bot, username, '&#CA4E4E❌ Вы должны состоять в клане Resistance! Вступите в клан, затем /rp');
    }

    const existingRp = db.rpMembers.get(username);
    if (existingRp && existingRp.is_active === 1) {
        return msg(bot, username, '&#76C519✅ Вы уже в RP! Используйте &#FFB800/rp status &#D4D4D4для профиля');
    }

    if (existingRp && existingRp.blacklisted_from_rp === 1) {
        return msg(bot, username, '&#CA4E4E❌ Вы заблокированы в RP. Обратитесь к администрации.');
    }

    if (existingRp && existingRp.is_frozen === 1) {
        return msg(bot, username, '&#CA4E4E❌ Профиль заморожен: ' + (existingRp.frozen_reason || 'Не указана'));
    }

    if (existingRp && existingRp.is_active === 0) {
        return reactivateRp(bot, username, existingRp, source);
    }

    if (pendingVerifications.has(username.toLowerCase())) {
        const pending = pendingVerifications.get(username.toLowerCase());
        const remaining = Math.ceil((pending.timestamp + 120000 - Date.now()) / 1000);
        if (remaining > 0) {
            return msg(bot, username, '&#FFB800⏳ У вас уже активна регистрация! Проверьте ЛС. Осталось: ' + remaining + 'с');
        }
        pendingVerifications.delete(username.toLowerCase());
    }

    return initiateNewRpRegistration(bot, username, source);
}

// ==================== ПЕРЕАКТИВАЦИЯ RP ====================
function reactivateRp(bot, username, existingRp, source) {
    if (existingRp.is_frozen === 1) {
        return msg(bot, username, '&#CA4E4E❌ Профиль всё ещё заморожен.');
    }

    db.rpMembers.add(username);
    db.rpMembers.setCityStatus(username, true);

    logger.info(username + ' переактивировал RP (баланс: ' + utils.formatMoney(existingRp.balance) + ')');

    msg(bot, username, '&#76C519✅ Профиль восстановлен! Баланс: &#FFB800' + utils.formatMoney(existingRp.balance));
    if (existingRp.organization) {
        msg(bot, username, '&#D4D4D4Организация: &#FFB800' + existingRp.organization + ' &#D4D4D4(' + (existingRp.rank || 'Нет') + ')');
    }
    msg(bot, username, '&#D4D4D4Используйте &#FFB800/rp status &#D4D4D4для просмотра');
}

// ==================== НОВАЯ РЕГИСТРАЦИЯ ====================
function initiateNewRpRegistration(bot, username, source) {
    const verificationNumber = generateVerificationNumber(username);

    // Инструкции в ЛС
    const instructions = [
        '&#80C4C5══════════════════════════════',
        '&#80C4C5  РЕГИСТРАЦИЯ В ROLEPLAY',
        '&#80C4C5  Свободный Город Resistance',
        '&#80C4C5══════════════════════════════',
        '',
        '&#D4D4D4Для завершения регистрации:',
        '&#FFB8001. &#D4D4D4Ознакомьтесь с правилами города',
        '&#FFB8002. &#D4D4D4Отправьте боту число: &#76C519' + verificationNumber,
        '',
        '&#D4D4D4⚠ У вас 2 минуты. 3 неверные попытки — отмена.',
    ];

    instructions.forEach((line, index) => {
        setTimeout(() => {
            try {
                if (line && line.trim().length > 0) {
                    bot.chat('/msg ' + username + ' ' + line);
                }
            } catch (e) {
                logger.error('Ошибка отправки ЛС для ' + username + ': ' + e.message);
            }
        }, index * 300);
    });

    pendingVerifications.set(username.toLowerCase(), {
        expectedNumber: verificationNumber,
        timestamp: Date.now(),
        attempts: 0,
        maxAttempts: 3,
    });

    setTimeout(() => {
        const pending = pendingVerifications.get(username.toLowerCase());
        if (pending) {
            pendingVerifications.delete(username.toLowerCase());
            try {
                bot.chat('/msg ' + username + ' &#CA4E4E⏰ Время истекло. Используйте /rp снова.');
            } catch (e) {}
        }
    }, 120000);

    if (source === 'clan_chat' || source === 'cc') {
        setTimeout(() => cc(bot, '&#80C4C5📋 ' + username + ', инструкция в ЛС!'), 1500);
    }

    return msg(bot, username, '&#80C4C5📋 Инструкция отправлена в ЛС! Проверьте сообщения от бота. 2 минуты на ответ.');
}

// ==================== ГЕНЕРАЦИЯ ЧИСЛА ====================
function generateVerificationNumber(username) {
    let hash = 0;
    const str = username.toLowerCase() + Date.now().toString().slice(-4);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash % 9000) + 1000;
}

// ==================== ПРОВЕРКА ОТВЕТА ====================
function checkRpVerification(bot, username, message) {
    const pending = pendingVerifications.get(username.toLowerCase());
    if (!pending) return false;

    const userNumber = parseInt(message.trim());

    if (isNaN(userNumber)) {
        pending.attempts++;
        if (pending.attempts >= pending.maxAttempts) {
            pendingVerifications.delete(username.toLowerCase());
            bot.chat('/msg ' + username + ' &#CA4E4E❌ Попытки исчерпаны. Используйте /rp снова.');
            return true;
        }
        bot.chat('/msg ' + username + ' &#FFB800⚠ Отправьте только число. Попытка ' + pending.attempts + '/' + pending.maxAttempts);
        return true;
    }

    if (userNumber === pending.expectedNumber) {
        pendingVerifications.delete(username.toLowerCase());
        completeRpRegistration(bot, username);
        return true;
    }

    pending.attempts++;
    if (pending.attempts >= pending.maxAttempts) {
        pendingVerifications.delete(username.toLowerCase());
        bot.chat('/msg ' + username + ' &#CA4E4E❌ Неверно. Используйте /rp снова.');
        return true;
    }
    bot.chat('/msg ' + username + ' &#CA4E4E❌ Неверно. Попытка ' + pending.attempts + '/' + pending.maxAttempts);
    return true;
}

// ==================== ЗАВЕРШЕНИЕ РЕГИСТРАЦИИ ====================
function completeRpRegistration(bot, username) {
    const result = db.rpMembers.add(username);

    if (!result) {
        logger.error('Ошибка добавления ' + username + ' в RP');
        bot.chat('/msg ' + username + ' &#CA4E4EОшибка регистрации. Попробуйте позже.');
        return;
    }

    db.rpMembers.setCityStatus(username, true);
    const startingBalance = config.economy.startingBalance;
    db.rpMembers.updateBalance(username, startingBalance, 'starting_balance', 'Стартовый капитал', 'SYSTEM');
    db.bank.openAccount(username);

    logger.info('✅ ' + username + ' зарегистрировался в RP! (ID: ' + result.id + ')');

    // Поздравление
    const congrats = [
        '&#80C4C5══════════════════════════════',
        '&#76C519  ✅ РЕГИСТРАЦИЯ ЗАВЕРШЕНА!',
        '&#80C4C5══════════════════════════════',
        '',
        '&#D4D4D4Добро пожаловать в Resistance!',
        '',
        '&#FFB800📋 Ваши данные:',
        '&#D4D4D4  ID: &#76C519' + result.id,
        '&#D4D4D4  Баланс: &#76C519' + utils.formatMoney(startingBalance),
        '',
        '&#FFB800📌 Команды:',
        '&#D4D4D4  /help — список команд',
        '&#D4D4D4  /rp status — профиль',
        '&#D4D4D4  /balance — баланс',
        '',
        '&#D4D4D4Удачи в Resistance!',
    ];

    congrats.forEach((line, index) => {
        setTimeout(() => {
            try {
                if (line && line.trim().length > 0) {
                    bot.chat('/msg ' + username + ' ' + line);
                }
            } catch (e) {}
        }, index * 250);
    });

    setTimeout(() => {
        cc(bot, '&#76C519✅ ' + username + ' присоединился к RP Resistance!');
        cc(bot, '&#D4D4D4Добро пожаловать! Используйте &#FFB800/rp status &#D4D4D4для профиля.');
    }, 2000);
}

// ==================== ЭКСПОРТ ====================
module.exports = { registerRp, checkRpVerification, generateVerificationNumber, showRpStatus };