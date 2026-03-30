// src/minecraft/commands/org.js
const utils = require('../../shared/utils');
const database = require('../../database');
const permissions = require('../../shared/permissions');
const payday = require('../payday');

async function org(bot, player, args, db, logCallback, sendPrivate, sendClan, getRealName) {
    if (args.length < 2) {
        sendPrivate(player, utils.formatMessage('', { username: player, usage: '/org [команда]' }));
        return;
    }
    
    const rpPlayer = await db.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, `${utils.emojis.error} Вы не зарегистрированы в RolePlay.`);
        return;
    }
    
    const command = args[1];
    const subArgs = args.slice(2);
    
    // members - список участников
    if (command === 'members') {
        const members = db.getDb().prepare(`
            SELECT minecraft_nick, organization_rank FROM rp_players 
            WHERE structure = ? AND frozen = 0
        `).all(rpPlayer.structure);
        
        if (members.length === 0) {
            sendPrivate(player, `${utils.emojis.info} В вашей организации нет участников.`);
            return;
        }
        
        let message = `${utils.emojis.staff} &lСотрудники ${rpPlayer.structure} (${members.length}):&r\n`;
        for (const m of members.slice(0, 15)) {
            message += `${m.organization_rank || 'Участник'} - ${m.minecraft_nick}\n`;
        }
        if (members.length > 15) message += `и ещё ${members.length - 15}`;
        sendPrivate(player, message);
    }
    
    // balance - бюджет организации
    else if (command === 'balance') {
        const budget = db.getDb().prepare('SELECT balance FROM org_budgets WHERE structure = ?').get(rpPlayer.structure);
        const balance = budget ? budget.balance : 0;
        
        if (subArgs.length >= 2 && (subArgs[0] === 'deposit' || subArgs[0] === 'withdraw')) {
            const isLeader = await permissions.isStructureLeader(player, rpPlayer.structure);
            if (!isLeader) {
                sendPrivate(player, `${utils.emojis.error} Только лидер организации может пополнять/снимать бюджет.`);
                return;
            }
            
            const amount = parseInt(subArgs[1]);
            if (isNaN(amount) || amount <= 0) {
                sendPrivate(player, `${utils.emojis.error} Сумма должна быть положительной.`);
                return;
            }
            
            if (subArgs[0] === 'deposit') {
                if (rpPlayer.money < amount) {
                    sendPrivate(player, `${utils.emojis.error} Недостаточно средств.`);
                    return;
                }
                await db.updatePlayerMoney(player, -amount, `Пополнение бюджета ${rpPlayer.structure}`, player);
                db.getDb().prepare('UPDATE org_budgets SET balance = balance + ? WHERE structure = ?').run(amount, rpPlayer.structure);
                sendPrivate(player, `${utils.emojis.success} Бюджет ${rpPlayer.structure} пополнен на ${utils.formatMoney(amount)}`);
            } else if (subArgs[0] === 'withdraw') {
                if (balance < amount) {
                    sendPrivate(player, `${utils.emojis.error} Недостаточно средств в бюджете.`);
                    return;
                }
                await db.updatePlayerMoney(player, amount, `Вывод из бюджета ${rpPlayer.structure}`, player);
                db.getDb().prepare('UPDATE org_budgets SET balance = balance - ? WHERE structure = ?').run(amount, rpPlayer.structure);
                sendPrivate(player, `${utils.emojis.success} Выведено ${utils.formatMoney(amount)} из бюджета ${rpPlayer.structure}`);
            }
        } else {
            sendPrivate(player, `${utils.emojis.money} Бюджет ${rpPlayer.structure}: ${utils.formatMoney(balance)}`);
        }
    }
    
    // points - баллы активности
    else if (command === 'points') {
        sendPrivate(player, `${utils.emojis.stats} Ваши баллы активности: ${rpPlayer.unique_points || 0}`);
    }
    
    // wstatus - статистика рабочего времени
    else if (command === 'wstatus') {
        const todayMinutes = await payday.getDutyStats(player, db);
        sendPrivate(player, `${utils.emojis.time} Сегодня вы отработали: ${utils.formatTime(todayMinutes)}`);
    }
    
    // duty - встать/снять с дежурства
    else if (command === 'duty') {
        const member = db.getDb().prepare('SELECT on_duty, duty_start FROM structure_members WHERE minecraft_nick = ?').get(player);
        
        if (!member) {
            db.getDb().prepare('INSERT INTO structure_members (minecraft_nick, structure, rank) VALUES (?, ?, ?)').run(player, rpPlayer.structure, rpPlayer.organization_rank || 'Стажёр');
        }
        
        if (member && member.on_duty) {
            const minutes = await payday.endDuty(player, db);
            sendPrivate(player, `${utils.emojis.time} Дежурство завершено. Отработано: ${utils.formatTime(minutes)}`);
            if (logCallback) logCallback(`⏰ ${player} завершил дежурство (${minutes} мин)`, 'info');
        } else {
            await payday.startDuty(player, db);
            sendPrivate(player, `${utils.emojis.time} Вы заступили на дежурство!`);
            if (logCallback) logCallback(`⏰ ${player} начал дежурство`, 'info');
        }
    }
    
    // list - список организаций
    else if (command === 'list') {
        const structures = ['🏛️ Мэрия', '🚔 Полиция', '⚔️ Армия', '🏥 Больница', '📚 Академия'];
        sendPrivate(player, `${utils.emojis.info} Организации: ${structures.join(', ')}`);
    }
    
    // rank - информация о ранге (для сотрудников структур)
    else if (command === 'rank' && subArgs.length >= 1) {
        const rank = subArgs[0];
        const salary = utils.getSalaryForRank(rpPlayer.structure, rank);
        sendPrivate(player, `${utils.emojis.info} Ранг "${rank}" в ${rpPlayer.structure}: зарплата ${utils.formatMoney(salary)}/час`);
    }
    
    else {
        sendPrivate(player, `${utils.emojis.error} Доступные команды: members, balance, points, wstatus, duty, list, rank`);
    }
}

module.exports = { org };