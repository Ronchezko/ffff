// src/minecraft/commands/orgHandler.js
// Единый обработчик всех /org команд

const orgCommands = require('./org');
const orgLeaderCommands = require('./org_leader');
const ministryCommands = require('./ministry');

async function handleOrgCommand(bot, sender, args, db, addLog) {
    if (!args || args.length === 0) {
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/org [подкоманда]`);
        bot.chat(`/msg ${sender} &7&l|&f Доступно: &epolice, army, hospital, academy, o, ministry`);
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    const restArgs = args.slice(1);
    
    // ========== ПОЛИЦИЯ ==========
    if (subCommand === 'police') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            case 'search':
                await orgCommands.search(bot, sender, actionArgs, db);
                break;
            case 'check':
                await orgCommands.check(bot, sender, actionArgs, db);
                break;
            case 'fine':
                await orgCommands.fine(bot, sender, actionArgs, db, addLog);
                break;
            case 'order':
                await orgCommands.order(bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org police [search/check/fine/order]`);
        }
        return;
    }
    
    // ========== АРМИЯ ==========
    if (subCommand === 'army') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            case 'tr':
                await orgCommands.tr(bot, sender, actionArgs, db);
                break;
            case 'border':
                await orgCommands.border(bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org army [tr/border]`);
        }
        return;
    }
    
    // ========== БОЛЬНИЦА ==========
    if (subCommand === 'hospital') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            case 'redcode':
                await orgCommands.redcode(bot, sender, actionArgs, db);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org hospital [redcode]`);
        }
        return;
    }
    
    // ========== АКАДЕМИЯ ==========
    if (subCommand === 'academy') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            case 'grade':
                await orgCommands.grade(bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org academy [grade]`);
        }
        return;
    }
    
    // ========== ЛИДЕРЫ ОРГАНИЗАЦИЙ (/org o) ==========
    if (subCommand === 'o') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            case 'invite':
                await orgLeaderCommands.invite(bot, sender, actionArgs, db, addLog);
                break;
            case 'accept':
                await orgLeaderCommands.accept(bot, sender, actionArgs, db, addLog);
                break;
            case 'kick':
                await orgLeaderCommands.kick(bot, sender, actionArgs, db, addLog);
                break;
            case 'rank':
                if (actionArgs[0] === 'set') {
                    await orgLeaderCommands.rankSet(bot, sender, actionArgs.slice(1), db, addLog);
                } else {
                    await orgLeaderCommands.rankinfo(bot, sender, actionArgs, db, addLog);
                }
                break;
            case 'setsalary':
                await orgLeaderCommands.setsalary(bot, sender, actionArgs, db, addLog);
                break;
            case 'paybonus':
                await orgLeaderCommands.paybonus(bot, sender, actionArgs, db, addLog);
                break;
            case 'vacation':
                await orgLeaderCommands.vacationList(bot, sender, actionArgs, db, addLog);
                break;
            case 'duty':
                await orgLeaderCommands.dutyList(bot, sender, actionArgs, db, addLog);
                break;
            case 'warn':
                await orgLeaderCommands.warn(bot, sender, actionArgs, db, addLog);
                break;
            case 'unwarn':
                await orgLeaderCommands.unwarn(bot, sender, actionArgs, db, addLog);
                break;
            case 'fine':
                await orgLeaderCommands.fine(bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org o [invite/accept/kick/rank/setsalary/paybonus/vacation/duty/warn/unwarn/fine]`);
        }
        return;
    }
    
    // ========== МИНИСТРЫ (/org ministry) ==========
    if (subCommand === 'ministry') {
        const action = restArgs[0]?.toLowerCase();
        const actionArgs = restArgs.slice(1);
        
        switch(action) {
            // Министр экономики
            case 'tax':
                if (actionArgs[0] === 'set') {
                    await ministryCommands.taxSet(bot, sender, actionArgs.slice(1), db, addLog);
                } else if (actionArgs[0] === 'list') {
                    await ministryCommands.taxList(bot, sender, actionArgs.slice(1), db);
                }
                break;
            case 'budget':
                await ministryCommands.budget(bot, sender, actionArgs, db);
                break;
            case 'bonus':
                await ministryCommands.bonus(bot, sender, actionArgs, db, addLog);
                break;
            case 'grant':
                await ministryCommands.grant(bot, sender, actionArgs, db, addLog);
                break;
            case 'idset':
                await ministryCommands.idSet(bot, sender, actionArgs, db, addLog);
                break;
            case 'imtake':
                await ministryCommands.imTake(bot, sender, actionArgs, db, addLog);
                break;
            // Министр обороны
            case 'defense':
                await ministryCommands.defenseBudget(bot, sender, actionArgs, db);
                break;
            case 'armystatus':
                await ministryCommands.armyStatus(bot, sender, actionArgs, db);
                break;
            // Министр МВД
            case 'mvdbudget':
                await ministryCommands.mvdBudget(bot, sender, actionArgs, db);
                break;
            case 'mvdstatus':
                await ministryCommands.mvdStatus(bot, sender, actionArgs, db);
                break;
            case 'crimelist':
                await ministryCommands.crimeList(bot, sender, actionArgs, db);
                break;
            // Министр здравоохранения
            case 'healthbudget':
                await ministryCommands.healthBudget(bot, sender, actionArgs, db);
                break;
            case 'hospitalstatus':
                await ministryCommands.hospitalStatus(bot, sender, actionArgs, db);
                break;
            // Министр образования
            case 'edubudget':
                await ministryCommands.eduBudget(bot, sender, actionArgs, db);
                break;
            case 'academystatus':
                await ministryCommands.academyStatus(bot, sender, actionArgs, db);
                break;
            // Мэр
            case 'mayorkick':
                await ministryCommands.mayorKick(bot, sender, actionArgs, db, addLog);
                break;
            case 'cityinfo':
                await ministryCommands.cityInfo(bot, sender, actionArgs, db);
                break;
            case 'setbudget':
                await ministryCommands.setBudget(bot, sender, actionArgs, db, addLog);
                break;
            default:
                bot.chat(`/msg ${sender} &7&l|&f /org ministry [tax/budget/bonus/grant/idset/imtake/defense/armystatus/mvdbudget/mvdstatus/crimelist/healthbudget/hospitalstatus/edubudget/academystatus/mayorkick/cityinfo/setbudget]`);
        }
        return;
    }
    
    bot.chat(`/msg ${sender} &7&l|&f Неизвестная подкоманда: &e${subCommand}`);
    bot.chat(`/msg ${sender} &7&l|&f Доступно: &epolice, army, hospital, academy, o, ministry`);
}

module.exports = { handleOrgCommand };