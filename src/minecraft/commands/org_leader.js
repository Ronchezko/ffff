// src/minecraft/commands/org_leader.js
// Команды для лидеров организаций

const utils = require('../../shared/utils');

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// /org/o invite [ник] - Пригласить в организацию
// ============================================

async function invite(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o invite [ник]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    if (org.leader_nick !== sender) {
        sendMessage(bot, sender, `&4&l|&c Только лидер организации может приглашать игроков`);
        return;
    }
    
    const target = args[0];
    const targetProfile = await db.getRPProfile(target);
    if (!targetProfile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay`);
        return;
    }
    
    if (targetProfile.structure !== 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cуже состоит в организации`);
        return;
    }
    
    // Проверка чёрного списка
    const isBlacklisted = await db.getSetting(`org_blacklist_${profile.structure}_${target}`) === 'true';
    if (isBlacklisted) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cнаходится в чёрном списке организации`);
        return;
    }
    
    // Сохраняем приглашение
    await db.run(`INSERT OR REPLACE INTO org_invites (player, org_name, invited_by, expires_at) VALUES (?, ?, ?, datetime('now', '+1 hour'))`, 
        [target, profile.structure, sender]);
    
    sendMessage(bot, sender, `&a&l|&f Приглашение отправлено игроку &e${target}`);
    sendMessage(bot, target, `&a&l|&f ${sender} приглашает вас в организацию &e${profile.structure}`);
    sendMessage(bot, target, `&7&l|&f Для принятия используйте &e/org/o accept`);
    if (addLog) addLog(`📋 ${sender} пригласил ${target} в ${profile.structure}`, 'info');
}

// ============================================
// /org/o kick [ник] [причина] - Исключить из организации
// ============================================

async function kickOrg(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o kick [ник] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    // Проверка прав (лидер или сотрудник с правом кика)
    const member = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [sender, profile.structure]);
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, member?.rank_name]);
    const canKick = isLeader || (rank?.can_kick === 1);
    
    if (!canKick) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для исключения игроков`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    await db.removeOrgMember(target, profile.structure);
    
    sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aисключён из организации`);
    sendMessage(bot, target, `&c&l|&f Вы исключены из организации &e${profile.structure}&f. Причина: &e${reason}`);
    bot.chat(`/cc &c👢 ${target} исключён из ${profile.structure} (${sender})`);
    if (addLog) addLog(`👢 ${sender} исключил ${target} из ${profile.structure}`, 'warn');
}

// ============================================
// /org/o rank set [ник] [звание] - Выдать звание
// ============================================

async function rankSet(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o rank set [ник] [звание]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    const member = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [sender, profile.structure]);
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, member?.rank_name]);
    const canPromote = isLeader || (rank?.can_promote === 1);
    
    if (!canPromote) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для выдачи званий`);
        return;
    }
    
    const target = args[1];
    const newRank = args[2];
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    const rankExists = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, newRank]);
    if (!rankExists) {
        sendMessage(bot, sender, `&4&l|&c Звание &e${newRank} &cне найдено в организации`);
        return;
    }
    
    await db.run(`UPDATE org_members SET rank_name = ? WHERE minecraft_nick = ? AND org_name = ?`, [newRank, target, profile.structure]);
    await db.run(`UPDATE rp_players SET job_rank = ? WHERE minecraft_nick = ?`, [newRank, target]);
    
    sendMessage(bot, sender, `&a&l|&f Игроку &e${target} &aвыдано звание &e${newRank}`);
    sendMessage(bot, target, `&a&l|&f Вам выдано звание &e${newRank} &aв организации &e${profile.structure}`);
    if (addLog) addLog(`📋 ${sender} выдал звание ${newRank} ${target} в ${profile.structure}`, 'info');
}

// ============================================
// /org/o rankinfo [ранг] - Информация о ранге
// ============================================

async function rankinfo(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o rankinfo [ранг]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const rankName = args[0];
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, rankName]);
    
    if (!rank) {
        sendMessage(bot, sender, `&4&l|&c Звание &e${rankName} &cне найдено`);
        return;
    }
    
    const membersCount = await db.get(`SELECT COUNT(*) as count FROM org_members WHERE org_name = ? AND rank_name = ?`, [profile.structure, rankName]);
    
    sendMessage(bot, sender, `&a&l|&f Звание &e${rank.rank_name}`);
    sendMessage(bot, sender, `&7&l|&f Зарплата: &e${rank.base_salary.toLocaleString()}₽/час &7| Сотрудников: &e${membersCount?.count || 0}`);
}

// ============================================
// /org/o setsalary [ранг] [сумма] - Изменить зарплату
// ============================================

async function setsalary(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o setsalary [ранг] [сумма]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    if (org.leader_nick !== sender) {
        sendMessage(bot, sender, `&4&l|&c Только лидер организации может изменять зарплаты`);
        return;
    }
    
    const rankName = args[0];
    const salary = parseInt(args[1]);
    
    if (isNaN(salary) || salary < 0) {
        sendMessage(bot, sender, `&4&l|&c Укажите корректную сумму`);
        return;
    }
    
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, rankName]);
    if (!rank) {
        sendMessage(bot, sender, `&4&l|&c Звание &e${rankName} &cне найдено`);
        return;
    }
    
    await db.run(`UPDATE org_ranks SET base_salary = ? WHERE org_name = ? AND rank_name = ?`, [salary, profile.structure, rankName]);
    
    sendMessage(bot, sender, `&a&l|&f Зарплата для звания &e${rankName} &aустановлена на &e${salary.toLocaleString()}₽/час`);
    if (addLog) addLog(`💰 ${sender} изменил зарплату для ${rankName} на ${salary} в ${profile.structure}`, 'info');
}

// ============================================
// /org/o paybonus [ник] [сумма] [причина] - Премия
// ============================================

let lastBonusTime = new Map();

async function paybonus(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o paybonus [ник] [сумма] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    const member = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [sender, profile.structure]);
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, member?.rank_name]);
    const canPayBonus = isLeader || (rank?.can_promote === 1);
    
    if (!canPayBonus) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для выдачи премий`);
        return;
    }
    
    // Кулдаун 15 секунд
    const lastBonus = lastBonusTime.get(sender) || 0;
    if (Date.now() - lastBonus < 15000) {
        const remaining = Math.ceil((15000 - (Date.now() - lastBonus)) / 1000);
        sendMessage(bot, sender, `&4&l|&c Подождите &e${remaining}&c секунд перед следующей премией`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        sendMessage(bot, sender, `&4&l|&c Сумма премии должна быть от 1 до 50 000₽`);
        return;
    }
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    const orgBudget = org.budget || 0;
    if (orgBudget < amount) {
        sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете организации`);
        return;
    }
    
    lastBonusTime.set(sender, Date.now());
    
    await db.run(`UPDATE organizations SET budget = budget - ? WHERE name = ?`, [amount, profile.structure]);
    await db.updateMoney(target, amount, 'bonus', `Премия от ${sender}: ${reason}`, sender);
    
    sendMessage(bot, sender, `&a&l|&f Выдана премия &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
    sendMessage(bot, target, `&a&l|&f Вы получили премию &e${amount.toLocaleString()}₽ &aот &e${sender}&f. Причина: &e${reason}`);
    bot.chat(`/cc &a💰 ${target} получил премию ${amount.toLocaleString()}₽ от ${sender}`);
    if (addLog) addLog(`💰 ${sender} выдал премию ${amount} ${target} (${reason})`, 'info');
}

// ============================================
// /org/o vacation list - Список в отпуске
// ============================================

async function vacationList(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const members = await db.all(`SELECT minecraft_nick, vacation_until FROM org_members WHERE org_name = ? AND is_on_vacation = 1`, [profile.structure]);
    
    if (!members || members.length === 0) {
        sendMessage(bot, sender, `&4&l|&c Нет сотрудников в отпуске`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Сотрудники в отпуске (&e${members.length}&f):`);
    for (const member of members) {
        const until = new Date(member.vacation_until).toLocaleDateString();
        sendMessage(bot, sender, `&7&l|&f ${member.minecraft_nick} &7- до &e${until}`);
    }
}

// ============================================
// /org/o duty list - Список на дежурстве
// ============================================

async function dutyList(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const members = await db.all(`SELECT minecraft_nick FROM org_members WHERE org_name = ? AND on_duty = 1`, [profile.structure]);
    
    if (!members || members.length === 0) {
        sendMessage(bot, sender, `&4&l|&c Нет сотрудников на дежурстве`);
        return;
    }
    
    const list = members.map(m => m.minecraft_nick).join(', ');
    sendMessage(bot, sender, `&a&l|&f На дежурстве (&e${members.length}&f): &e${list}`);
}

// ============================================
// /org/o warn [ник] [причина] - Выговор сотруднику
// ============================================

async function warn(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o warn [ник] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    if (!isLeader) {
        sendMessage(bot, sender, `&4&l|&c Только лидер организации может выдавать выговоры`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    const newWarnings = (targetMember.warnings || 0) + 1;
    await db.run(`UPDATE org_members SET warnings = ? WHERE minecraft_nick = ? AND org_name = ?`, [newWarnings, target, profile.structure]);
    
    sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnings}/3)`);
    sendMessage(bot, target, `&c&l|&f Вы получили выговор от &e${sender}&f. Причина: &e${reason}`);
    bot.chat(`/cc &c⚠️ ${target} получил выговор в ${profile.structure} (${newWarnings}/3)`);
    
    if (newWarnings >= 3) {
        await db.removeOrgMember(target, profile.structure);
        sendMessage(bot, target, `&c&l|&f Вы уволены из организации за 3 выговора`);
        bot.chat(`/cc &c🔻 ${target} уволен из ${profile.structure} за 3 выговора`);
    }
    
    if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} в ${profile.structure} (${reason})`, 'warn');
}

// ============================================
// /org/o unwarn [ник] [причина] - Снять выговор
// ============================================

async function unwarn(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o unwarn [ник] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    if (!isLeader) {
        sendMessage(bot, sender, `&4&l|&c Только лидер организации может снимать выговоры`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    const newWarnings = Math.max(0, (targetMember.warnings || 0) - 1);
    await db.run(`UPDATE org_members SET warnings = ? WHERE minecraft_nick = ? AND org_name = ?`, [newWarnings, target, profile.structure]);
    
    sendMessage(bot, sender, `&a&l|&f Выговор снят с &e${target}`);
    sendMessage(bot, target, `&a&l|&f С вас снят выговор &e${sender}&f. Причина: &e${reason}`);
    if (addLog) addLog(`✅ ${sender} снял выговор с ${target} в ${profile.structure}`, 'info');
}

// ============================================
// /org/o fine [ник] [сумма] [причина] - Штраф сотруднику
// ============================================

async function fineOrg(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o fine [ник] [сумма] [причина]`);
        return;
    }
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const isLeader = org.leader_nick === sender;
    
    if (!isLeader) {
        sendMessage(bot, sender, `&4&l|&c Только лидер организации может выдавать штрафы`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        sendMessage(bot, sender, `&4&l|&c Сумма штрафа должна быть от 1 до 50 000₽`);
        return;
    }
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?`, [target, profile.structure]);
    if (!targetMember) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации`);
        return;
    }
    
    const success = await db.updateMoney(target, -amount, 'fine', reason, sender);
    
    if (success) {
        sendMessage(bot, sender, `&a&l|&f Штраф &e${amount.toLocaleString()}₽ &aвыписан &e${target}`);
        sendMessage(bot, target, `&c&l|&f Вам выписан штраф &e${amount.toLocaleString()}₽ &cот &e${sender}&f. Причина: &e${reason}`);
        bot.chat(`/cc &c💰 ${target} оштрафован на ${amount.toLocaleString()}₽ (${profile.structure})`);
        if (addLog) addLog(`💰 ${sender} оштрафовал ${target} на ${amount} в ${profile.structure}`, 'info');
    } else {
        sendMessage(bot, sender, `&4&l|&c У игрока &e${target} &cнедостаточно средств`);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    invite,
    kick: kickOrg,
    rankSet,
    rankinfo,
    setsalary,
    paybonus,
    vacationList,
    dutyList,
    warn,
    unwarn,
    fine: fineOrg
};