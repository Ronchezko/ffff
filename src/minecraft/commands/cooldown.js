// src/minecraft/commands/cooldown.js
// Система кулдаунов для команд

const cooldowns = new Map();
// Кулдауны для КАЖДОЙ отдельной подкоманды (в секундах)
const cooldownSettings = {
    // ===== ПОЛИЦИЯ =====
    'org_police_search': 3,
    'org_police_check': 3,
    'org_police_fine': 5,
    'org_police_order': 10,
    
    // ===== АРМИЯ =====
    'org_army_tr': 3,
    'org_army_border': 3,
    
    // ===== БОЛЬНИЦА =====
    'org_hospital_redcode': 5,
    
    // ===== АКАДЕМИЯ =====
    'org_academy_grade': 5,
    
    // ===== ЛИДЕРЫ (/org o) =====
    'org_o_invite': 5,
    'org_o_accept': 2,
    'org_o_kick': 10,
    'org_o_rank_set': 10,
    'org_o_rankinfo': 5,
    'org_o_setsalary': 15,
    'org_o_paybonus': 10,
    'org_o_vacation': 30,
    'org_o_duty': 30,
    'org_o_warn': 10,
    'org_o_unwarn': 10,
    'org_o_fine': 10,
    
    // ===== МИНИСТРЫ (/org ministry) =====
    'org_ministry_tax_set': 30,
    'org_ministry_tax_list': 30,
    'org_ministry_budget': 30,
    'org_ministry_bonus': 20,
    'org_ministry_grant': 15,
    'org_ministry_idset': 10,
    'org_ministry_imtake': 10,
    'org_ministry_defense': 30,
    'org_ministry_armystatus': 30,
    'org_ministry_mvdbudget': 30,
    'org_ministry_mvdstatus': 30,
    'org_ministry_crimelist': 30,
    'org_ministry_healthbudget': 30,
    'org_ministry_hospitalstatus': 30,
    'org_ministry_edubudget': 30,
    'org_ministry_academystatus': 30,
    'org_ministry_mayorkick': 20,
    'org_ministry_cityinfo': 30,
    'org_ministry_setbudget': 30,
};

function checkCooldown(sender, commandKey) {
    const key = `${sender}_${commandKey}`;
    const cooldown = cooldowns.get(key);
    
    if (cooldown) {
        const remaining = Math.ceil((cooldown - Date.now()) / 1000);
        if (remaining > 0) {
            return { allowed: false, remaining };
        }
    }
    
    return { allowed: true, remaining: 0 };
}

function setCooldown(sender, commandKey) {
    const duration = cooldownSettings[commandKey];
    if (!duration || duration <= 0) return;
    
    const key = `${sender}_${commandKey}`;
    cooldowns.set(key, Date.now() + (duration * 1000));
    
    setTimeout(() => {
        if (cooldowns.get(key) <= Date.now()) {
            cooldowns.delete(key);
        }
    }, (duration * 1000) + 100);
}

function clearCooldowns(sender) {
    for (const [key, value] of cooldowns) {
        if (key.startsWith(`${sender}_`)) {
            cooldowns.delete(key);
        }
    }
}

module.exports = { checkCooldown, setCooldown, clearCooldowns, cooldownSettings };