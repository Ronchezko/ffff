// src/minecraft/commands/org_leader.js
// Команды лидеров организаций (с Discord интеграцией)

const utils = require('../../shared/utils');

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}

async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

async function sendClanMessage(bot, message) {
    bot.chat(`/cc ${message}`);
    await utils.sleep(300);
}

// Отправка сообщения о необходимости использовать Discord
async function sendDiscordRedirect(bot, sender, commandName) {
    const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/resistance';
    await sendMessage(bot, sender, `&e&l|&f Для использования команды &e/${commandName} &fперейдите в Discord сервер Resistance`);
    await sendMessage(bot, sender, `&7&l|&f Ссылка: &e${discordLink}`);
    await sendMessage(bot, sender, `&7&l|&f В Discord доступна полная информация и статистика`);
}

// Проверка, является ли игрок лидером организации
async function isLeader(nick, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile || profile.structure === 'Гражданин') return false;
    
    const org = await db.getOrganization(profile.structure);
    return org && org.leader_nick === cleanNickname;
}

// Получение организации игрока
async function getPlayerOrg(nick, db) {
    const cleanNickname = cleanNick(nick);
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile || profile.structure === 'Гражданин') return null;
    return profile.structure;
}

// ============================================
// /org/o invite [ник] - Пригласить в организацию
// ============================================

async function invite(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер организации может приглашать игроков!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o invite [ник]`);
        return;
    }
    
    const target = args[0];
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    const targetProfile = await db.getRPProfile(cleanTarget);
    if (!targetProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay!`);
        return;
    }
    
    if (targetProfile.structure !== 'Гражданин') {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cуже состоит в организации!`);
        return;
    }
    
    const isBlacklisted = await db.getSetting(`org_blacklist_${orgName}_${cleanTarget}`) === 'true';
    if (isBlacklisted) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cнаходится в чёрном списке организации!`);
        return;
    }
    
    await db.run(`INSERT OR REPLACE INTO org_invites (player, org_name, invited_by, expires_at) 
        VALUES (?, ?, ?, datetime('now', '+1 hour'))`, [cleanTarget, orgName, cleanSender]);
    
    await sendMessage(bot, sender, `&a&l|&f Приглашение отправлено игроку &e${target}`);
    await sendMessage(bot, target, `&a&l|&f Лидер &e${sender} &aприглашает вас в организацию &e${orgName}`);
    await sendMessage(bot, target, `&7&l|&f Для принятия используйте &e/org/o accept`);
    
    if (addLog) addLog(`📋 ${sender} пригласил ${target} в ${orgName}`, 'info');
}

// ============================================
// /org/o accept - Принять приглашение
// ============================================

async function accept(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    
    const invite = await db.get(`SELECT * FROM org_invites WHERE player = ? AND expires_at > CURRENT_TIMESTAMP`, [cleanSender]);
    
    if (!invite) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет активных приглашений!`);
        return;
    }
    
    const profile = await db.getRPProfile(cleanSender);
    if (profile && profile.structure !== 'Гражданин') {
        await sendMessage(bot, sender, `&4&l|&c Вы уже состоите в организации!`);
        return;
    }
    
    await db.addOrgMember(cleanSender, invite.org_name, 'Стажёр');
    await db.run(`DELETE FROM org_invites WHERE player = ?`, [cleanSender]);
    
    await sendMessage(bot, sender, `&a&l|&f Вы вступили в организацию &e${invite.org_name}`);
    await sendClanMessage(bot, `&a&l|&f ${sender} &aвступил в организацию &e${invite.org_name}`);
    
    if (addLog) addLog(`➕ ${sender} вступил в ${invite.org_name}`, 'success');
}

// ============================================
// /org/o kick [ник] [причина] - Исключить из организации
// ============================================

async function kick(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может исключать игроков!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o kick [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ') || 'Не указана';
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    if (cleanSender === cleanTarget) {
        await sendMessage(bot, sender, `&4&l|&c Нельзя исключить самого себя!`);
        return;
    }
    
    await db.removeOrgMember(cleanTarget, orgName);
    
    await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aисключён из организации`);
    await sendMessage(bot, target, `&c&l|&f Вы исключены из организации &e${orgName}&f. Причина: &e${reason}`);
    await sendClanMessage(bot, `&c👢 &e${target} &cисключён из &e${orgName} &cлидером ${sender}`);
    
    if (addLog) addLog(`👢 ${sender} исключил ${target} из ${orgName}`, 'warn');
}
// ============================================
// /org/o rank set [ник] [звание] - Выдать звание
// ============================================

async function rankSet(bot, sender, args, db, addLog) {
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может выдавать звания!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o rank set [ник] [звание]`);
        return;
    }
    
    const target = args[0];
    const newRank = args[1];
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    const rankExists = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [orgName, newRank]);
    if (!rankExists) {
        await sendMessage(bot, sender, `&4&l|&c Звание &e${newRank} &cне найдено в организации!`);
        return;
    }
    
    await db.run(`UPDATE org_members SET rank_name = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [newRank, cleanTarget, orgName]);
    await db.run(`UPDATE rp_players SET job_rank = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [newRank, cleanTarget]);
    
    await sendMessage(bot, sender, `&a&l|&f Игроку &e${target} &aвыдано звание &e${newRank}`);
    await sendMessage(bot, target, `&a&l|&f Лидер &e${sender} &aповысил вас до звания &e${newRank} &aв организации &e${orgName}`);
    await sendClanMessage(bot, `&a⭐ &e${target} &aповышен до звания &e${newRank} &aв &e${orgName}`);
    
    if (addLog) addLog(`⭐ ${sender} повысил ${target} до ${newRank} в ${orgName}`, 'info');
}

// ============================================
// /org/o rankinfo [ранг] - Информация о звании (→ Discord)
// ============================================

async function rankinfo(bot, sender, args, db, addLog) {
    const orgName = await getPlayerOrg(sender, db);
    if (!orgName) {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации!`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o rankinfo [ранг]`);
        return;
    }
    
    // Отправляем в Discord
    await sendDiscordRedirect(bot, sender, 'org/o rankinfo');
}

// ============================================
// /org/o setsalary [ранг] [сумма] - Изменить зарплату
// ============================================

async function setsalary(bot, sender, args, db, addLog) {
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может изменять зарплаты!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o setsalary [ранг] [сумма]`);
        return;
    }
    
    const rankName = args[0];
    const salary = parseInt(args[1]);
    const orgName = await getPlayerOrg(sender, db);
    
    if (isNaN(salary) || salary < 0) {
        await sendMessage(bot, sender, `&4&l|&c Укажите корректную сумму!`);
        return;
    }
    
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [orgName, rankName]);
    if (!rank) {
        await sendMessage(bot, sender, `&4&l|&c Звание &e${rankName} &cне найдено!`);
        return;
    }
    
    const org = await db.getOrganization(orgName);
    const membersCount = await db.get(`SELECT COUNT(*) as count FROM org_members WHERE org_name = ? AND rank_name = ?`, [orgName, rankName]);
    const totalSalaryIncrease = (salary - rank.base_salary) * (membersCount?.count || 0);
    
    if (totalSalaryIncrease > 0 && org.budget < totalSalaryIncrease * 4) {
        await sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете организации для повышения зарплаты!`);
        return;
    }
    
    await db.run(`UPDATE org_ranks SET base_salary = ? WHERE org_name = ? AND rank_name = ?`, [salary, orgName, rankName]);
    
    await sendMessage(bot, sender, `&a&l|&f Зарплата для звания &e${rankName} &aустановлена на &e${salary.toLocaleString()}₽/час`);
    await sendClanMessage(bot, `&a💰 Лидер ${sender} изменил зарплату для звания ${rankName} на ${salary.toLocaleString()}₽/час`);
    
    if (addLog) addLog(`💰 ${sender} изменил зарплату для ${rankName} на ${salary} в ${orgName}`, 'info');
}

// ============================================
// /org/o paybonus [ник] [сумма] [причина] - Премия
// ============================================

const bonusCooldowns = new Map();

async function paybonus(bot, sender, args, db, addLog) {
    const cleanSender = cleanNick(sender);
    const orgName = await getPlayerOrg(sender, db);
    
    if (!orgName) {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации!`);
        return;
    }
    
    const isLeaderFlag = await isLeader(sender, db);
    const member = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanSender, orgName]);
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [orgName, member?.rank_name]);
    const canPayBonus = isLeaderFlag || (rank?.can_promote === 1);
    
    if (!canPayBonus) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для выдачи премий!`);
        return;
    }
    
    const lastBonus = bonusCooldowns.get(cleanSender) || 0;
    if (Date.now() - lastBonus < 15000) {
        const remaining = Math.ceil((15000 - (Date.now() - lastBonus)) / 1000);
        await sendMessage(bot, sender, `&4&l|&c Подождите &e${remaining}&c секунд перед следующей премией`);
        return;
    }
    
    if (args.length < 3) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o paybonus [ник] [сумма] [причина]`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        await sendMessage(bot, sender, `&4&l|&c Сумма премии должна быть от 1 до 50 000₽!`);
        return;
    }
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    const org = await db.getOrganization(orgName);
    if (org.budget < amount) {
        await sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете организации!`);
        return;
    }
    
    bonusCooldowns.set(cleanSender, Date.now());
    
    await db.run(`UPDATE organizations SET budget = budget - ? WHERE name = ?`, [amount, orgName]);
    await db.updateMoney(cleanTarget, amount, 'bonus', `Премия от ${sender}: ${reason}`, sender);
    
    await sendMessage(bot, sender, `&a&l|&f Выдана премия &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
    await sendMessage(bot, target, `&a&l|&f Вы получили премию &e${amount.toLocaleString()}₽ &aот &e${sender}&f. Причина: &e${reason}`);
    await sendClanMessage(bot, `&a💰 &e${target} &aполучил премию ${amount.toLocaleString()}₽ от ${sender}`);
    
    if (addLog) addLog(`💰 ${sender} выдал премию ${amount} ${target} (${reason})`, 'info');
}
// ============================================
// /org/o vacation list - Список в отпуске (→ Discord)
// ============================================

async function vacationList(bot, sender, args, db, addLog) {
    const orgName = await getPlayerOrg(sender, db);
    if (!orgName) {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации!`);
        return;
    }
    
    // Отправляем в Discord
    await sendDiscordRedirect(bot, sender, 'org/o vacation list');
}

// ============================================
// /org/o duty list - Список на дежурстве (→ Discord)
// ============================================

async function dutyList(bot, sender, args, db, addLog) {
    const orgName = await getPlayerOrg(sender, db);
    if (!orgName) {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации!`);
        return;
    }
    
    // Отправляем в Discord
    await sendDiscordRedirect(bot, sender, 'org/o duty list');
}

// ============================================
// /org/o warn [ник] [причина] - Выговор сотруднику
// ============================================

async function warn(bot, sender, args, db, addLog) {
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может выдавать выговоры!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o warn [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    const newWarnings = (targetMember.warnings || 0) + 1;
    await db.run(`UPDATE org_members SET warnings = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [newWarnings, cleanTarget, orgName]);
    
    await sendMessage(bot, sender, `&a&l|&f Выговор выдан &e${target} &7(${newWarnings}/3)`);
    await sendMessage(bot, target, `&c&l|&f Вы получили выговор от &e${sender}&f. Причина: &e${reason}`);
    await sendClanMessage(bot, `&c⚠️ &e${target} &cполучил выговор в ${orgName} (${newWarnings}/3)`);
    
    if (newWarnings >= 3) {
        await db.removeOrgMember(cleanTarget, orgName);
        await sendMessage(bot, target, `&c&l|&f Вы уволены из организации за 3 выговора!`);
        await sendClanMessage(bot, `&c🔻 &e${target} &cуволен из ${orgName} за 3 выговора`);
        if (addLog) addLog(`🔻 ${target} уволен из ${orgName} за 3 выговора`, 'warn');
    }
    
    if (addLog) addLog(`⚠️ ${sender} выдал выговор ${target} в ${orgName} (${reason})`, 'warn');
}

// ============================================
// /org/o unwarn [ник] [причина] - Снять выговор
// ============================================

async function unwarn(bot, sender, args, db, addLog) {
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может снимать выговоры!`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o unwarn [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    const newWarnings = Math.max(0, (targetMember.warnings || 0) - 1);
    await db.run(`UPDATE org_members SET warnings = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [newWarnings, cleanTarget, orgName]);
    
    await sendMessage(bot, sender, `&a&l|&f Выговор снят с &e${target}`);
    await sendMessage(bot, target, `&a&l|&f С вас снят выговор &e${sender}&f. Причина: &e${reason}`);
    
    if (addLog) addLog(`✅ ${sender} снял выговор с ${target} в ${orgName}`, 'info');
}

// ============================================
// /org/o fine [ник] [сумма] [причина] - Штраф сотруднику
// ============================================

async function fine(bot, sender, args, db, addLog) {
    if (!await isLeader(sender, db)) {
        await sendMessage(bot, sender, `&4&l|&c Только лидер может выдавать штрафы!`);
        return;
    }
    
    if (args.length < 3) {
        await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o fine [ник] [сумма] [причина]`);
        return;
    }
    
    const target = args[0];
    const amount = parseInt(args[1]);
    const reason = args.slice(2).join(' ');
    const cleanTarget = cleanNick(target);
    const orgName = await getPlayerOrg(sender, db);
    
    if (isNaN(amount) || amount <= 0 || amount > 50000) {
        await sendMessage(bot, sender, `&4&l|&c Сумма штрафа должна быть от 1 до 50 000₽!`);
        return;
    }
    
    const targetMember = await db.get(`SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND org_name = ?`, [cleanTarget, orgName]);
    if (!targetMember) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в вашей организации!`);
        return;
    }
    
    const success = await db.updateMoney(cleanTarget, -amount, 'fine', reason, sender);
    
    if (success) {
        await db.run(`UPDATE organizations SET budget = budget + ? WHERE name = ?`, [amount, orgName]);
        
        await sendMessage(bot, sender, `&a&l|&f Штраф &e${amount.toLocaleString()}₽ &aвыписан &e${target}`);
        await sendMessage(bot, target, `&c&l|&f Вам выписан штраф &e${amount.toLocaleString()}₽ &cот &e${sender}&f. Причина: &e${reason}`);
        await sendClanMessage(bot, `&c💰 &e${target} &cоштрафован на ${amount.toLocaleString()}₽ в ${orgName}`);
        
        if (addLog) addLog(`💰 ${sender} оштрафовал ${target} на ${amount} в ${orgName}`, 'info');
    } else {
        await sendMessage(bot, sender, `&4&l|&c У игрока &e${target} &cнедостаточно средств!`);
    }
}
// ============================================
// ЭКСПОРТ ВСЕХ КОМАНД
// ============================================

module.exports = {
    // Основные команды
    invite,
    accept,
    kick,
    
    // Управление рангами
    rankSet,
    rankinfo,      // → Discord
    setsalary,
    
    // Финансы
    paybonus,
    
    // Списки (→ Discord)
    vacationList,  // → Discord
    dutyList,      // → Discord
    
    // Дисциплина
    warn,
    unwarn,
    fine
};