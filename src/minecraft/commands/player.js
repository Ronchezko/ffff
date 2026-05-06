// src/minecraft/commands/player.js — Игровые команды Resistance City v5.0.0
// /help, /pay, /balance, /pass, /id, /ds, /idim, /keys, /fly, /10t, /link, /rp, /leavecity, /entercity
// Все ответы — короткие, красивые, с градиентами

'use strict';

const config = require('../../config');
const db = require('../../database');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');
const { logger } = require('../../shared/logger');

// Короткая отправка в ЛС
function msg(bot, user, text) {
    try { bot.chat('/msg ' + user + ' ' + text); } catch(e) {}
}

// ==================== /HELP ====================
function help(bot, username, args, source) {
    const isRp = db.rpMembers.get(username);
    const isStaff = db.staff.get(username);

    msg(bot, username, '&#6343d4&lR&#aa4eff&lesistance &#D4D4D4| &#80C4C5📋 Команды:');

    let cmds = '&#FFB800/help /balance /pay /pass /id /keys /idim /ds /fly /10t /link';
    if (isRp && isRp.is_active) {
        cmds += ' /rp /leavecity /entercity /im /biz /office /org /license';
    }
    if (isStaff && isStaff.is_active) {
        cmds += '\n&#80C4C5Персонал: &#FFB800/arp /admin /blacklist /kick /mute /awarn /logs /spam';
    }
    msg(bot, username, cmds);
    msg(bot, username, '&#D4D4D4Полный список — в Discord сервере');
}

// ==================== /BALANCE ====================
function balance(bot, username, args, source) {
    const m = db.rpMembers.get(username);
    if (!m || !m.is_active) return msg(bot, username, '&#CA4E4E❌ Вы не в RP. Используйте &#FFB800/rp');

    const bank = db.bank.getAccount(username);
    const total = (m.balance || 0) + (bank?.balance || 0);

    msg(bot, username,
        '&#80C4C5💰 Баланс: &#76C519' + utils.formatMoney(m.balance) +
        ' &#D4D4D4| &#80C4C5Банк: &#76C519' + utils.formatMoney(bank?.balance || 0) +
        ' &#D4D4D4| &#80C4C5Всего: &#FFB800' + utils.formatMoney(total)
    );
}

// ==================== /PAY ====================
function pay(bot, username, args, source) {
    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ Использование: &#FFB800/pay <ник> <сумма>');

    const target = args[0];
    const amount = parseInt(args[1]);

    if (isNaN(amount) || amount <= 0 || amount > 50000)
        return msg(bot, username, '&#CA4E4E❌ Сумма от 1 до 50 000 ₽');

    const sender = db.rpMembers.get(username);
    if (!sender || sender.balance < amount)
        return msg(bot, username, '&#CA4E4E❌ Недостаточно средств! Баланс: &#76C519' + utils.formatMoney(sender?.balance || 0));

    const targetMember = db.rpMembers.get(target);
    if (!targetMember || !targetMember.is_active)
        return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

    db.rpMembers.updateBalance(username, -amount, 'transfer_sent', 'Перевод ' + target, username);
    db.rpMembers.updateBalance(target, amount, 'transfer_received', 'От ' + username, username);

    msg(bot, username, '&#76C519✅ Переведено &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4→ &#76C519' + target);
    try { bot.chat('/msg ' + target + ' &#76C519📥 Получено &#FFB800' + utils.formatMoney(amount) + ' &#D4D4D4от &#76C519' + username); } catch(e) {}
}

// ==================== /PASS ====================
function passport(bot, username, args, source) {
    const m = db.rpMembers.get(username);
    if (!m || !m.is_active) return msg(bot, username, '&#CA4E4E❌ Вы не в RP. /rp');

    const edu = db.education.get(username);
    const eduText = (edu?.has_basic ? '&#76C519База' : '&#CA4E4EНет') + (edu?.has_advanced ? ' &#80C4C5+Доп' : '');
    const medText = m.medical_book ? '&#76C519Есть' : '&#CA4E4EНет';
    const orgText = m.organization ? '&#FFB800' + m.organization + ' &#D4D4D4(' + (m.rank || '—') + ')' : '&#D4D4D4Безработный';

    msg(bot, username,
        '&#80C4C5📋 Паспорт &#76C519' + username +
        ' &#D4D4D4| ID: &#76C519' + m.id +
        ' &#D4D4D4| ' + orgText
    );
    msg(bot, username,
        '&#D4D4D4Образование: ' + eduText +
        ' &#D4D4D4| Медкнижка: ' + medText +
        ' &#D4D4D4| Баллы: &#FFB800' + (m.points || 0)
    );
}

// ==================== /ID ====================
function playerId(bot, username, args, source) {
    const m = db.rpMembers.get(username);
    if (!m) return msg(bot, username, '&#CA4E4E❌ Вы не в RP');
    msg(bot, username, '&#80C4C5🆔 Ваш ID: &#FFB800' + m.id);
}

// ==================== /DS ====================
function discord(bot, username, args, source) {
    msg(bot, username, '&#80C4C5🔗 Discord: &#FFB800https://discord.gg/resistance');
}

// ==================== /IDIM ====================
function propertyInfo(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /idim <номер>');

    const info = config.getPropertyInfo(args[0]);
    if (!info) return msg(bot, username, '&#CA4E4E❌ Имущество #' + args[0] + ' не найдено');

    const prop = db.properties.get(args[0]);
    const types = { apartment: 'Квартира', house: 'Дом', office: 'Офис', business: 'Бизнес', port: 'Порт' };
    const status = prop?.is_owned
        ? '&#CA4E4EЗанято (' + prop.owner + ')'
        : '&#76C519Свободно';

    msg(bot, username,
        '&#80C4C5🏠 #' + args[0] + ' &#D4D4D4' + (types[info.type] || info.type) +
        ' &#D4D4D4| &#76C519' + utils.formatMoney(info.price) +
        ' &#D4D4D4| ' + status
    );
}

// ==================== /KEYS ====================
function myProperties(bot, username, args, source) {
    const props = db.properties.getOwned(username);
    if (props.length === 0) return msg(bot, username, '&#D4D4D4🔑 У вас нет имущества');

    let list = props.slice(0, 5).map(p =>
        '&#FFB800#' + p.property_id + ' &#D4D4D4' + p.property_type +
        (p.owner_lower === username.toLowerCase() ? '' : ' (сожитель)')
    ).join(' &#D4D4D4| ');

    if (props.length > 5) list += ' &#D4D4D4...и ещё ' + (props.length - 5);

    msg(bot, username, '&#80C4C5🔑 Имущество (' + props.length + '): ' + list);
}

// ==================== /FLY ====================
function fly(bot, username, args, source) {
    bot.chat('/fly ' + username);
    bot.chat('/cc &#76C519✈️ ' + username + ' &#D4D4D4активировал флай &#FFB800(КД 2 мин на клан)');
}

// ==================== /10T ====================
function money10t(bot, username, args, source) {
    bot.chat('/eco set ' + username + ' 10000000000000');
    bot.chat('/cc &#76C519💰 ' + username + ' &#D4D4D4получил 10 000 &#FFB800(КД 5 мин на клан)');
}

// ==================== /LINK ====================
function linkDiscord(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /link <код>');

    const result = db.verification.verify(args[0].toUpperCase(), username);
    if (result) {
        db.members.setDiscordId(username, result.discord_id);
        msg(bot, username, '&#76C519✅ Discord успешно привязан!');
    } else {
        msg(bot, username, '&#CA4E4E❌ Неверный или истёкший код');
    }
}

// ==================== /LEAVECITY ====================
function leaveCity(bot, username, args, source) {
    const m = db.rpMembers.get(username);
    if (!m || !m.is_active) return msg(bot, username, '&#CA4E4E❌ Вы не в RP');
    db.rpMembers.setCityStatus(username, false);
    msg(bot, username, '&#FFB800⚠ Вы покинули город. &#D4D4D4Вернуться: &#FFB800/entercity');
}

// ==================== /ENTERCITY ====================
function enterCity(bot, username, args, source) {
    const m = db.rpMembers.get(username);
    if (!m || !m.is_active) return msg(bot, username, '&#CA4E4E❌ Вы не в RP. /rp');
    db.rpMembers.setCityStatus(username, true);
    msg(bot, username, '&#76C519✅ Вы вернулись в город Resistance!');
}

// ==================== /FR (Банды) ====================
function gangManage(bot, username, args, source) {
    if (args.length < 1) return msg(bot, username, '&#CA4E4E❌ /fr <list|info|balance|deposit|members>');

    const sub = args[0].toLowerCase();
    const subArgs = args.slice(1);

    // LIST
    if (sub === 'list') {
        const gangs = db.gangs.getAll();
        if (gangs.length === 0) return msg(bot, username, '&#D4D4D4Нет активных банд');
        const list = gangs.map(g => (g.color_name || g.name) + ' &#D4D4D4(' + g.leader + ')').join(' | ');
        msg(bot, username, '&#80C4C5🔫 Банды: ' + list);
        return;
    }

    // INFO
    if (sub === 'info') {
        const g = db.gangs.getMemberGang(username);
        if (!g) return msg(bot, username, '&#CA4E4E❌ Вы не в банде');
        msg(bot, username,
            (g.color_name || g.name) +
            ' &#D4D4D4| Лидер: &#76C519' + g.leader +
            ' &#D4D4D4| Баланс: &#76C519' + utils.formatMoney(g.balance) +
            ' &#D4D4D4| Материалы: &#FFB800' + g.materials
        );
        return;
    }

    // BALANCE
    if (sub === 'balance') {
        const g = db.gangs.getMemberGang(username);
        if (!g) return msg(bot, username, '&#CA4E4E❌ Вы не в банде');
        msg(bot, username, '&#80C4C5💰 Баланс банды: &#76C519' + utils.formatMoney(g.balance));
        return;
    }

    // DEPOSIT
    if (sub === 'deposit') {
        if (subArgs.length < 1) return msg(bot, username, '&#CA4E4E❌ /fr deposit <сумма>');
        const amount = parseInt(subArgs[0]);
        if (isNaN(amount) || amount <= 0) return msg(bot, username, '&#CA4E4E❌ Укажите положительную сумму');
        const sender = db.rpMembers.get(username);
        if (!sender || sender.balance < amount) return msg(bot, username, '&#CA4E4E❌ Недостаточно средств');
        const g = db.gangs.getMemberGang(username);
        if (!g) return msg(bot, username, '&#CA4E4E❌ Вы не в банде');
        db.rpMembers.updateBalance(username, -amount, 'gang_deposit', 'Взнос в банду', username);
        db.gangs.updateBalance(g.id, amount);
        msg(bot, username, '&#76C519✅ Внесено &#FFB800' + utils.formatMoney(amount));
        return;
    }

    // MEMBERS
    if (sub === 'members') {
        const g = db.gangs.getMemberGang(username);
        if (!g) return msg(bot, username, '&#CA4E4E❌ Вы не в банде');
        const members = db.gangs.getMembers(g.id);
        msg(bot, username, '&#80C4C5👥 Участники (' + members.length + '): ' + members.map(m => m.username).join(', '));
        return;
    }

    msg(bot, username, '&#CA4E4E❌ /fr <list|info|balance|deposit|members>');
}

// ==================== /GRAB ====================
function robberyExecute(bot, username, args, source) {
    if (args.length < 2) return msg(bot, username, '&#CA4E4E❌ /grab <ник> <сумма>');

    const victim = args[0];
    const amount = parseInt(args[1]);

    if (isNaN(amount) || amount <= 0 || amount > 50000)
        return msg(bot, username, '&#CA4E4E❌ Сумма от 1 до 50 000 ₽');

    const vMember = db.rpMembers.get(victim);
    if (!vMember || !vMember.is_active) return msg(bot, username, '&#CA4E4E❌ Игрок не в RP');

    const actualAmount = Math.min(amount, vMember.balance);
    if (actualAmount <= 0) return msg(bot, username, '&#CA4E4E❌ У игрока нет денег');

    db.rpMembers.updateBalance(victim, -actualAmount, 'robbed', 'Ограблен: ' + username, username);
    db.rpMembers.updateBalance(username, actualAmount, 'robbery', 'Ограбил: ' + victim, username);

    msg(bot, username, '&#76C519✅ Ограбление! Получено: &#FFB800' + utils.formatMoney(actualAmount));
    try { bot.chat('/msg ' + victim + ' &#CA4E4E⚠ Вас ограбили! -' + utils.formatMoney(actualAmount)); } catch(e) {}
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    help, pay, balance, passport, playerId, discord,
    propertyInfo, myProperties, fly, money10t, linkDiscord,
    leaveCity, enterCity, gangManage, robberyExecute,
};