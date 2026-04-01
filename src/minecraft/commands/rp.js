// src/minecraft/commands/rp.js
// RolePlay команды: организации, дежурства, структуры

const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');

// ============================================
// /arp - Административные RP команды
// ============================================
async function arp(bot, sender, args, db, addLog) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /arp [balance/rank/points/blacklist/payday/warn/stats/rp/idim/org]`);
        return;
    }
    
    const subCmd = args[0].toLowerCase();
    const subArgs = args.slice(1);
    
    // Проверка прав (требуется ранг модератора+)
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        bot.chat(`/msg ${sender} &cУ вас нет прав для использования /arp!`);
        return;
    }
    
    switch(subCmd) {
        case 'balance':
            await arpBalance(bot, sender, subArgs, db, addLog);
            break;
        case 'rank':
            await arpRank(bot, sender, subArgs, db, addLog);
            break;
        case 'points':
            await arpPoints(bot, sender, subArgs, db, addLog);
            break;
        case 'blacklist':
        case 'bl':
            await arpBlacklist(bot, sender, subArgs, db, addLog);
            break;
        case 'payday':
            await arpPayday(bot, sender, subArgs, db, addLog);
            break;
        case 'warn':
            await arpWarn(bot, sender, subArgs, db, addLog);
            break;
        case 'stats':
            await arpStats(bot, sender, subArgs, db);
            break;
        case 'rp':
            await arpRpDel(bot, sender, subArgs, db, addLog);
            break;
        case 'idim':
            await arpIdim(bot, sender, subArgs, db, addLog);
            break;
        case 'org':
            await arpOrg(bot, sender, subArgs, db, addLog);
            break;
        default:
            bot.chat(`/msg ${sender} &cНеизвестная подкоманда /arp ${subCmd}`);
    }
}

// /arp balance set/give/reset/del [ник] [сумма]
async function arpBalance(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp balance [set/give/reset/del] [ник] [сумма]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const amount = parseFloat(args[2]);
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    let newBalance = profile.money;
    let description = '';
    
    switch(action) {
        case 'set':
            if (isNaN(amount)) {
                bot.chat(`/msg ${sender} &cУкажите сумму!`);
                return;
            }
            newBalance = amount;
            description = `Установка баланса администратором ${sender}`;
            await db.updateMoney(target, newBalance - profile.money, 'admin_set', description, sender);
            bot.chat(`/msg ${sender} &a✅ Баланс ${target} установлен на ${utils.formatMoney(amount)}`);
            break;
            
        case 'give':
            if (isNaN(amount) || amount <= 0) {
                bot.chat(`/msg ${sender} &cУкажите корректную сумму!`);
                return;
            }
            await db.updateMoney(target, amount, 'admin_give', `Выдача от ${sender}`, sender);
            bot.chat(`/msg ${sender} &a✅ Выдано ${utils.formatMoney(amount)} игроку ${target}`);
            break;
            
        case 'reset':
            newBalance = 1000;
            await db.updateMoney(target, newBalance - profile.money, 'admin_reset', `Сброс баланса ${sender}`, sender);
            bot.chat(`/msg ${sender} &a✅ Баланс ${target} сброшен до 1000₽`);
            break;
            
        case 'del':
            await db.updateMoney(target, -profile.money, 'admin_remove', `Списание всех средств ${sender}`, sender);
            bot.chat(`/msg ${sender} &a✅ Все средства списаны у ${target}`);
            break;
            
        default:
            bot.chat(`/msg ${sender} &cНеизвестное действие. Используйте: set, give, reset, del`);
            return;
    }
    
    if (addLog) addLog(`💰 ${sender} изменил баланс ${target} (${action})`, 'info');
}

// /arp rank set/del [ник] [структура] [ранг]
async function arpRank(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp rank [set/del] [ник] [структура] [ранг]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    
    if (action === 'set') {
        if (args.length < 4) {
            bot.chat(`/msg ${sender} &cИспользование: /arp rank set [ник] [структура] [ранг]`);
            return;
        }
        
        const structure = args[2];
        const rank = args[3];
        
        // Проверяем существование организации
        const org = await db.getOrganization(structure);
        if (!org) {
            bot.chat(`/msg ${sender} &cСтруктура ${structure} не найдена!`);
            return;
        }
        
        // Проверяем ранг
        const orgRank = await db.getOrgRank(structure, rank);
        if (!orgRank) {
            bot.chat(`/msg ${sender} &cРанг ${rank} не найден в структуре ${structure}!`);
            return;
        }
        
        await db.addOrgMember(target, structure, rank);
        bot.chat(`/msg ${sender} &a✅ ${target} назначен на ${rank} в ${structure}`);
        bot.chat(`/msg ${target} &a🎉 Вы назначены на должность ${rank} в ${getStructureIcon(structure)}`);
        
        if (addLog) addLog(`📋 ${sender} назначил ${target} на ${rank} в ${structure}`, 'info');
        
    } else if (action === 'del') {
        // Получаем текущую структуру игрока
        const profile = await db.getRPProfile(target);
        if (!profile || profile.structure === 'Гражданин') {
            bot.chat(`/msg ${sender} &c${target} не состоит в организации!`);
            return;
        }
        
        await db.removeOrgMember(target, profile.structure);
        bot.chat(`/msg ${sender} &a✅ ${target} удалён из организации`);
        bot.chat(`/msg ${target} &cВы были уволены из организации ${sender}`);
        
        if (addLog) addLog(`📋 ${sender} уволил ${target} из организации`, 'warn');
    }
}

// /arp points add/del [ник] [количество]
async function arpPoints(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /arp points [add/del] [ник] [количество]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const points = parseInt(args[2]);
    
    if (isNaN(points) || points <= 0) {
        bot.chat(`/msg ${sender} &cУкажите корректное количество баллов!`);
        return;
    }
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    let newPoints = profile.rp_points;
    
    if (action === 'add') {
        newPoints = profile.rp_points + points;
        bot.chat(`/msg ${sender} &a✅ Добавлено ${points} баллов игроку ${target}`);
    } else if (action === 'del') {
        newPoints = Math.max(0, profile.rp_points - points);
        bot.chat(`/msg ${sender} &a✅ Снято ${points} баллов у игрока ${target}`);
    } else {
        bot.chat(`/msg ${sender} &cИспользуйте add или del`);
        return;
    }
    
    await db.run('UPDATE rp_players SET rp_points = ? WHERE minecraft_nick = ?', [newPoints, target]);
    
    if (addLog) addLog(`⭐ ${sender} ${action === 'add' ? 'добавил' : 'снял'} ${points} баллов у ${target}`, 'info');
}

// /arp blacklist add/del [ник] [структура]
async function arpBlacklist(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp blacklist [add/del] [ник] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const structure = args[2];
    
    if (action === 'add') {
        if (!structure) {
            bot.chat(`/msg ${sender} &cУкажите структуру для ЧС!`);
            return;
        }
        
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'true', sender);
        bot.chat(`/msg ${sender} &a✅ ${target} добавлен в ЧС структуры ${structure}`);
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС структуры ${structure}`, 'warn');
        
    } else if (action === 'del') {
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'false', sender);
        bot.chat(`/msg ${sender} &a✅ ${target} удалён из ЧС структуры ${structure}`);
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС структуры ${structure}`, 'info');
    }
}

// /arp payday - Внеплановый PayDay (только администратор)
async function arpPayday(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        bot.chat(`/msg ${sender} &cВнеплановый PayDay могут делать только администраторы!`);
        return;
    }
    
    bot.chat(`/cc &a💰 ${sender} запускает внеплановый PayDay!`);
    
    // Импортируем payday модуль
    const payday = require('../payday');
    await payday.processPayDay(bot, db, addLog);
    
    if (addLog) addLog(`💰 ${sender} запустил внеплановый PayDay`, 'info');
}

// /arp warn add/del [ник] [причина]
async function arpWarn(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp warn [add/del] [ник] [причина]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const reason = args.slice(2).join(' ');
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    if (action === 'add') {
        if (!reason) {
            bot.chat(`/msg ${sender} &cУкажите причину предупреждения!`);
            return;
        }
        
        const newWarnings = profile.warnings + 1;
        await db.run('UPDATE rp_players SET warnings = ? WHERE minecraft_nick = ?', [newWarnings, target]);
        await db.addPunishment(target, 'rp_warn', reason, sender, null);
        
        bot.chat(`/msg ${sender} &a✅ Выдано предупреждение ${target} (${newWarnings}/3)`);
        bot.chat(`/msg ${target} &c⚠️ Вы получили предупреждение от ${sender} Причина: ${reason}`);
        
        if (newWarnings >= 3) {
            await db.run('UPDATE rp_players SET is_frozen = 1 WHERE minecraft_nick = ?', [target]);
            bot.chat(`/cc &c🔒 ${target} заморожен в RP за 3 предупреждения!`);
        }
        
        if (addLog) addLog(`⚠️ ${sender} выдал предупреждение ${target} (${reason})`, 'warn');
        
    } else if (action === 'del') {
        const newWarnings = Math.max(0, profile.warnings - 1);
        await db.run('UPDATE rp_players SET warnings = ? WHERE minecraft_nick = ?', [newWarnings, target]);
        
        if (newWarnings < 3) {
            await db.run('UPDATE rp_players SET is_frozen = 0 WHERE minecraft_nick = ?', [target]);
        }
        
        bot.chat(`/msg ${sender} &a✅ Снято предупреждение с ${target}`);
        if (addLog) addLog(`✅ ${sender} снял предупреждение с ${target}`, 'info');
    }
}

// /arp stats [ник] - Показать статистику игрока
async function arpStats(bot, sender, args, db) {
    if (args.length < 1) {
        bot.chat(`/msg ${sender} &cИспользование: /arp stats [ник]`);
        return;
    }
    
    const target = args[0];
    const stats = await db.getPlayerStats(target);
    const rpProfile = await db.getRPProfile(target);
    
    if (!stats && !rpProfile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не найден!`);
        return;
    }
    
    bot.chat(`/msg ${sender} &6╔══════════════════════════════════════════╗`);
    bot.chat(`/msg ${sender} &6║ &l📊 СТАТИСТИКА ИГРОКА ${target} &6║`);
    bot.chat(`/msg ${sender} &6╠══════════════════════════════════════════╣`);
    
    if (stats) {
        bot.chat(`/msg ${sender} &6║ &7Ранг в клане: &e${stats.rank_name}`);
        bot.chat(`/msg ${sender} &6║ &7Убийств/Смертей: &e${stats.kills}🗡️ / ${stats.deaths}💀`);
        bot.chat(`/msg ${sender} &6║ &7В клане с: &e${new Date(stats.joined_at).toLocaleDateString()}`);
    }
    
    if (rpProfile) {
        bot.chat(`/msg ${sender} &6║ &7Структура: &e${rpProfile.structure}`);
        bot.chat(`/msg ${sender} &6║ &7Должность: &e${rpProfile.job_rank}`);
        bot.chat(`/msg ${sender} &6║ &7Баланс: &e${utils.formatMoney(rpProfile.money)}`);
        bot.chat(`/msg ${sender} &6║ &7Баллы RP: &e${rpProfile.rp_points}`);
        bot.chat(`/msg ${sender} &6║ &7Предупреждения: &e${rpProfile.warnings}/3`);
        bot.chat(`/msg ${sender} &6║ &7Дежурство: &e${rpProfile.on_duty ? '✅ На дежурстве' : '❌ Не на дежурстве'}`);
    }
    
    bot.chat(`/msg ${sender} &6╚══════════════════════════════════════════╝`);
}

// /arp rp del [ник] [причина] - Забрать доступ к RP
async function arpRpDel(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp rp del [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        bot.chat(`/msg ${sender} &cИгрок ${target} не зарегистрирован в RP!`);
        return;
    }
    
    // Сбрасываем RP профиль
    await db.run(`UPDATE rp_players SET 
        structure = 'Гражданин', 
        job_rank = 'Нет', 
        on_duty = 0, 
        duty_start_time = NULL,
        is_frozen = 1,
        warnings = 0
        WHERE minecraft_nick = ?`, [target]);
    
    // Удаляем из организаций
    await db.run('DELETE FROM org_members WHERE minecraft_nick = ?', [target]);
    
    bot.chat(`/msg ${sender} &a✅ Доступ к RP забран у ${target}`);
    bot.chat(`/msg ${target} &c❌ Вы лишены доступа к RolePlay! Причина: ${reason}`);
    bot.chat(`/cc &c🔒 ${target} лишён доступа к RP ${sender} Причина: ${reason}`);
    
    if (addLog) addLog(`🔒 ${sender} лишил ${target} доступа к RP (${reason})`, 'warn');
}

// /arp idim add/del [ник] [id] - Управление имуществом
async function arpIdim(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        bot.chat(`/msg ${sender} &cИспользование: /arp idim [add/del] [ник] [id]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const propertyId = args[2];
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        bot.chat(`/msg ${sender} &cИмущество с ID ${propertyId} не найдено!`);
        return;
    }
    
    if (action === 'add') {
        await db.run('UPDATE property SET owner_nick = ?, is_available = 0 WHERE id = ?', [target, propertyId]);
        bot.chat(`/msg ${sender} &a✅ Имущество ${propertyId} выдано ${target}`);
        bot.chat(`/msg ${target} &a✅ Вам выдано имущество #${propertyId} (${property.type})`);
        if (addLog) addLog(`🏠 ${sender} выдал имущество ${propertyId} игроку ${target}`, 'info');
        
    } else if (action === 'del') {
        await db.run('UPDATE property SET owner_nick = NULL, is_available = 1 WHERE id = ?', [propertyId]);
        bot.chat(`/msg ${sender} &a✅ Имущество ${propertyId} изъято у ${target}`);
        bot.chat(`/msg ${target} &c❌ У вас изъято имущество #${propertyId} ${sender}`);
        if (addLog) addLog(`🏠 ${sender} изъял имущество ${propertyId} у ${target}`, 'warn');
    }
}

// /arp org freeze/unfreeze [структура]
async function arpOrg(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        bot.chat(`/msg ${sender} &cИспользование: /arp org [freeze/unfreeze] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const structure = args[1];
    
    const org = await db.getOrganization(structure);
    if (!org) {
        bot.chat(`/msg ${sender} &cСтруктура ${structure} не найдена!`);
        return;
    }
    
    if (action === 'freeze') {
        await db.run('UPDATE organizations SET is_frozen = 1, frozen_at = CURRENT_TIMESTAMP, frozen_by = ? WHERE name = ?', [sender, structure]);
        bot.chat(`/cc &c❄️ ${sender} ЗАМОРОЗИЛ структуру ${getStructureIcon(structure)}!`);
        if (addLog) addLog(`❄️ ${sender} заморозил структуру ${structure}`, 'warn');
        
    } else if (action === 'unfreeze') {
        await db.run('UPDATE organizations SET is_frozen = 0, frozen_at = NULL, frozen_by = NULL WHERE name = ?', [structure]);
        bot.chat(`/cc &a✅ ${sender} РАЗМОРОЗИЛ структуру ${getStructureIcon(structure)}!`);
        if (addLog) addLog(`✅ ${sender} разморозил структуру ${structure}`, 'info');
    }
}

// ============================================
// /duty - Встать на дежурство
// ============================================
async function duty(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile) {
        bot.chat(`/msg ${sender} &cВы не зарегистрированы в RolePlay! Используйте /rp`);
        return;
    }
    
    if (profile.structure === 'Гражданин') {
        bot.chat(`/msg ${sender} &cВы не состоите в организации!`);
        return;
    }
    
    const isOnDuty = profile.on_duty === 1;
    
    if (!isOnDuty) {
        await db.setDuty(sender, profile.structure, true);
        bot.chat(`/msg ${sender} &a✅ Вы встали на дежурство в ${getStructureIcon(profile.structure)}`);
        bot.chat(`/cc &a👮 ${sender} заступил на дежурство!`);
    } else {
        // Снимаем с дежурства и начисляем зарплату
        await db.setDuty(sender, profile.structure, false);
        
        // Получаем отработанное время
        const dutyTime = await db.getDutyTime(sender);
        const salary = await db.calculateSalary(profile.structure, profile.job_rank, dutyTime);
        
        if (salary > 0) {
            await db.updateMoney(sender, salary, 'salary', `Зарплата за дежурство`, 'system');
            bot.chat(`/msg ${sender} &a✅ Вы получили ${utils.formatMoney(salary)} за ${Math.floor(dutyTime / 60)} минут дежурства`);
        }
        
        bot.chat(`/msg ${sender} &a✅ Вы снялись с дежурства`);
        bot.chat(`/cc &a👮 ${sender} снялся с дежурства`);
    }
}

// ============================================
// /status - Статус организации
// ============================================
async function status(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        bot.chat(`/msg ${sender} &cВы не состоите в организации!`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const members = await db.getOrgMembers(profile.structure);
    const onDuty = members.filter(m => m.on_duty === 1).length;
    
    bot.chat(`/msg ${sender} &6╔══════════════════════════════════════╗`);
    bot.chat(`/msg ${sender} &6║ &l${getStructureIcon(profile.structure)} СТАТУС &6║`);
    bot.chat(`/msg ${sender} &6╠══════════════════════════════════════╣`);
    bot.chat(`/msg ${sender} &6║ &7Всего сотрудников: &e${members.length}`);
    bot.chat(`/msg ${sender} &6║ &7На дежурстве: &e${onDuty}`);
    bot.chat(`/msg ${sender} &6║ &7Бюджет: &e${utils.formatMoney(org?.budget || 0)}`);
    bot.chat(`/msg ${sender} &6║ &7Ставка налога: &e${((org?.tax_rate || 0) * 100)}%`);
    bot.chat(`/msg ${sender} &6╚══════════════════════════════════════╝`);
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getStructureIcon(structure) {
    const icons = {
        'police': '👮 Полиция',
        'army': '⚔️ Армия',
        'hospital': '🏥 Больница',
        'academy': '📚 Академия',
        'government': '🏛️ Правительство'
    };
    return icons[structure] || structure;
}

// ============================================
// ЭКСПОРТ
// ============================================
module.exports = {
    arp,
    duty,
    status
};