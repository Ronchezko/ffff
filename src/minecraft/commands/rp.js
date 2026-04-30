// src/minecraft/commands/rp.js
// RolePlay команды: организации, дежурства, структуры

const utils = require('../../shared/utils');

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/&#[0-9a-fA-F]{6}/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}

async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}

// ============================================
// /arp - Административные RP команды
// ============================================

async function arp(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования &e/arp`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp [подкоманда]`);
        await sendMessage(bot, sender, `&7&l|&f Подкоманды: &ebalance, rank, points, blacklist, payday, warn, stats, rp, idim, org`);
        return;
    }
    
    const subCmd = args[0].toLowerCase();
    const subArgs = args.slice(1);
    
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
            await sendMessage(bot, sender, `&4&l|&c Неизвестная подкоманда &e${subCmd}`);
    }
}

// ============================================
// /arp balance set/give/reset/del [ник] [сумма]
// ============================================

async function arpBalance(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 3) {
        await sendMessage(bot, sender, `&4&l|&c Управление балансом доступно с Ст.Модератора`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp balance [set/give/reset/del] [ник] [сумма]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const amount = parseFloat(args[2]);
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    switch(action) {
        case 'set':
            if (isNaN(amount)) { await sendMessage(bot, sender, `&4&l|&c Укажите сумму`); return; }
            await db.updateMoney(target, amount - profile.money, 'admin_set', `Установка баланса администратором ${sender}`, sender);
            await sendMessage(bot, sender, `&a&l|&f Баланс &e${target} &aустановлен на &e${amount.toLocaleString()}₽`);
            break;
        case 'give':
            if (isNaN(amount) || amount <= 0) { await sendMessage(bot, sender, `&4&l|&c Укажите сумму`); return; }
            await db.updateMoney(target, amount, 'admin_give', `Выдача от ${sender}`, sender);
            await sendMessage(bot, sender, `&a&l|&f Выдано &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
            break;
        case 'reset':
            await db.updateMoney(target, 1000 - profile.money, 'admin_reset', `Сброс баланса ${sender}`, sender);
            await sendMessage(bot, sender, `&a&l|&f Баланс &e${target} &aсброшен до &e1000₽`);
            break;
        case 'del':
            await db.updateMoney(target, -profile.money, 'admin_remove', `Списание всех средств ${sender}`, sender);
            await sendMessage(bot, sender, `&a&l|&f Все средства списаны у &e${target}`);
            break;
        default:
            await sendMessage(bot, sender, `&4&l|&c Неизвестное действие. Используйте: &eset, give, reset, del`);
    }
    if (addLog) addLog(`💰 ${sender} изменил баланс ${target} (${action})`, 'info');
}

// ============================================
// /arp rank set/del [ник] [структура] [ранг]
// ============================================

async function arpRank(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c Выдача рангов доступна с Модератора`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp rank set [ник] [структура] [ранг]`);
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp rank del [ник]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    
    if (action === 'set') {
        if (args.length < 4) {
            await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp rank set [ник] [структура] [ранг]`);
            return;
        }
        const structure = args[2];
        const rank = args.slice(3).join(' ');
        
        const org = await db.getOrganization(structure);
        if (!org) {
            await sendMessage(bot, sender, `&4&l|&c Структура &e${structure} &cне найдена`);
            return;
        }
        
        const existing = await db.getRPProfile(target);
        if (existing && existing.structure !== 'Гражданин' && existing.structure.toLowerCase() !== structure.toLowerCase()) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cуже состоит в организации &e${existing.structure}`);
            return;
        }
        
        const clanMember = await db.getClanMember(target);
        if (!clanMember) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне состоит в клане Resistance!`);
            return;
        }
        
        await db.addOrgMember(target, structure, rank);
        await sendMessage(bot, sender, `&a&l|&f ${target} &aназначен на &e${rank} &aв &e${structure}`);
        await sendMessage(bot, target, `&a&l|&f Вы назначены на должность &e${rank} &aв &e${structure}`);
        if (addLog) addLog(`📋 ${sender} назначил ${target} на ${rank} в ${structure}`, 'info');
        
    } else if (action === 'del') {
        const profile = await db.getRPProfile(target);
        if (!profile || profile.structure === 'Гражданин') {
            await sendMessage(bot, sender, `&4&l|&c ${target} &cне состоит в организации`);
            return;
        }
        await db.removeOrgMember(target, profile.structure);
        await sendMessage(bot, sender, `&a&l|&f ${target} &aудалён из организации`);
        await sendMessage(bot, target, `&c&l|&f Вы уволены из организации &e${sender}`);
        if (addLog) addLog(`📋 ${sender} уволил ${target} из организации`, 'warn');
    }
}

// ============================================
// /arp points add/del [ник] [количество]
// ============================================

async function arpPoints(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c Управление баллами доступно с Модератора`);
        return;
    }
    
    if (args.length < 3) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp points [add/del] [ник] [количество]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const points = parseInt(args[2]);
    
    if (isNaN(points) || points <= 0) {
        await sendMessage(bot, sender, `&4&l|&c Укажите количество баллов`);
        return;
    }
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    if (action === 'add') {
        await db.run('UPDATE rp_players SET rp_points = rp_points + ? WHERE LOWER(minecraft_nick) = LOWER(?)', [points, target]);
        await sendMessage(bot, sender, `&a&l|&f Добавлено &e${points} &aбаллов игроку &e${target}`);
    } else if (action === 'del') {
        await db.run('UPDATE rp_players SET rp_points = MAX(0, rp_points - ?) WHERE LOWER(minecraft_nick) = LOWER(?)', [points, target]);
        await sendMessage(bot, sender, `&a&l|&f Снято &e${points} &aбаллов у игрока &e${target}`);
    } else {
        await sendMessage(bot, sender, `&4&l|&c Используйте &eadd&c или &edel`);
        return;
    }
    if (addLog) addLog(`⭐ ${sender} ${action === 'add' ? 'добавил' : 'снял'} ${points} баллов у ${target}`, 'info');
}

// ============================================
// /arp blacklist add/del [ник] [структура]
// ============================================

async function arpBlacklist(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c Управление ЧС структур доступно с Модератора`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp blacklist [add/del] [ник] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const structure = args[2];
    
    if (action === 'add') {
        if (!structure) {
            await sendMessage(bot, sender, `&4&l|&c Укажите структуру для ЧС`);
            return;
        }
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'true', sender);
        await sendMessage(bot, sender, `&a&l|&f ${target} &aдобавлен в ЧС структуры &e${structure}`);
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС структуры ${structure}`, 'warn');
    } else if (action === 'del') {
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'false', sender);
        await sendMessage(bot, sender, `&a&l|&f ${target} &aудалён из ЧС структуры &e${structure}`);
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС структуры ${structure}`, 'info');
    }
}

// ============================================
// /arp payday - Внеплановый PayDay
// ============================================

async function arpPayday(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        await sendMessage(bot, sender, `&4&l|&c Внеплановый PayDay могут делать только Администраторы`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Запуск внепланового PayDay...`);
    bot.chat(`/cc &a💰 ${sender} запускает внеплановый PayDay!`);
    
    const payday = require('../payday');
    await payday.processPayDay(bot, db, addLog);
    if (addLog) addLog(`💰 ${sender} запустил внеплановый PayDay`, 'info');
}

// ============================================
// /arp warn add/del [ник] [причина]
// ============================================

async function arpWarn(bot, sender, args, db, addLog) {
    if (!Array.isArray(args) || args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp warn add/del [ник] [причина]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const reason = args.slice(2).join(' ');
    
    if (!target) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp warn add/del [ник] [причина]`);
        return;
    }
    
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для выдачи предупреждений`);
        return;
    }
    
    try {
        if (action === 'add') {
            if (!reason) {
                await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp warn add ${target} <причина>`);
                return;
            }
            
            const rpProfile = await db.getRPProfile(target);
            if (!rpProfile) {
                await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay!`);
                return;
            }
            
            await db.run(`INSERT INTO rp_warnings (player, reason, issued_by) VALUES (?, ?, ?)`, [target, reason, sender]);
            
            const warnings = await db.get(`SELECT COUNT(*) as count FROM rp_warnings WHERE player = ? AND active = 1`, [target]);
            
            await sendMessage(bot, sender, `&a&l|&f Вы &2успешно&f выдали предупреждение игроку &e${target}`);
            await sendMessage(bot, target, `&4&l|&c Вы получили предупреждение от &e${sender}`);
            await sendMessage(bot, target, `&4&l|&c Причина: &e${reason}`);
            await sendMessage(bot, target, `&7&l|&f У вас &e${warnings.count}/3 &fпредупреждений`);
            
            if (warnings.count >= 3) {
                await db.run(`UPDATE rp_players SET is_frozen = 1 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
                await db.run(`UPDATE rp_players SET on_duty = 0, duty_start_time = NULL, structure = 'Заморожен', job_rank = 'Заблокирован' WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
                
                await sendMessage(bot, target, `&4&l|&c ВАШ RP ПРОФИЛЬ ЗАМОРОЖЕН!`);
                await sendMessage(bot, target, `&4&l|&c Причина: 3 предупреждения`);
                await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &2заблокирован &fв RP (3 предупреждения)`);
                bot.chat(`/cc &4&l|⚠️ Игрок &e${target} &cзаблокирован в RP за 3 предупреждения!`);
            }
            
            const discord = global.botComponents?.discord;
            if (discord && discord.client) {
                const channel = discord.client.channels.cache.get('1474633679442804798');
                if (channel) {
                    channel.send(`⚠️ **RP Предупреждение**\nИгрок: ${target}\nВыдал: ${sender}\nПричина: ${reason}\nВсего: ${warnings.count}/3`);
                }
            }
            
        } else if (action === 'del') {
            const lastWarn = await db.get(`SELECT id FROM rp_warnings WHERE player = ? AND active = 1 ORDER BY issued_at DESC LIMIT 1`, [target]);
            
            if (lastWarn) {
                await db.run(`UPDATE rp_warnings SET active = 0 WHERE id = ?`, [lastWarn.id]);
                
                const remainingWarns = await db.get(`SELECT COUNT(*) as count FROM rp_warnings WHERE player = ? AND active = 1`, [target]);
                
                if (remainingWarns.count < 3) {
                    await db.run(`UPDATE rp_players SET is_frozen = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
                }
                
                await sendMessage(bot, sender, `&a&l|&f Вы &2успешно&f сняли предупреждение с &e${target}`);
                await sendMessage(bot, target, `&a&l|&f С вас снято предупреждение от &e${sender}`);
            } else {
                await sendMessage(bot, sender, `&4&l|&c У игрока &e${target} &cнет активных предупреждений`);
            }
        } else {
            await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp warn add/del [ник] [причина]`);
        }
        
    } catch (error) {
        console.error('Ошибка в arpWarn:', error);
        await sendMessage(bot, sender, `&4&l|&c Ошибка: ${error.message}`);
    }
}

// ============================================
// /arp stats [ник] - Показать статистику игрока
// ============================================

async function arpStats(bot, sender, args, db) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 1) {
        await sendMessage(bot, sender, `&4&l|&c У вас нет прав для просмотра статистики`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp stats [ник]`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const stats = await db.getPlayerStats(target);
    const rpProfile = await db.getRPProfile(target);
    
    if (!stats && !rpProfile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне найден`);
        return;
    }
    
    await sendMessage(bot, sender, `&a&l|&f Статистика игрока &e${target}`);
    if (stats) await sendMessage(bot, sender, `&7&l|&f Ранг в клане: &e${stats.rank_name} &7| Убийств/Смертей: &e${stats.kills}/${stats.deaths}`);
    if (rpProfile) await sendMessage(bot, sender, `&7&l|&f Структура: &e${rpProfile.structure} &7| Ранг: &e${rpProfile.job_rank}`);
    if (rpProfile) await sendMessage(bot, sender, `&7&l|&f Баланс: &e${rpProfile.money?.toLocaleString()}₽ &7| Баллы RP: &e${rpProfile.rp_points || 0}`);
    if (rpProfile) await sendMessage(bot, sender, `&7&l|&f Предупреждения: &e${rpProfile.warnings || 0}/3 &7| Заморожен: ${rpProfile.is_frozen ? '✅ Да' : '❌ Нет'}`);
}

// ============================================
// /arp rp del [ник] [причина] - Забрать доступ к RP
// ============================================

async function arpRpDel(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        await sendMessage(bot, sender, `&4&l|&c Управление RP доступно с Модератора`);
        return;
    }
    
    if (args.length < 1) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp rp del [ник] [причина]`);
        return;
    }
    
    const target = cleanNick(args[0]);
    const reason = args.slice(1).join(' ') || 'Не указана';
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    await db.run(`UPDATE rp_players SET structure = 'Гражданин', job_rank = 'Нет', on_duty = 0, is_frozen = 1, warnings = 0 WHERE LOWER(minecraft_nick) = LOWER(?)`, [target]);
    await db.run('DELETE FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?)', [target]);
    
    await sendMessage(bot, sender, `&a&l|&f Доступ к RP забран у &e${target}`);
    await sendMessage(bot, target, `&4&l|&f Вы лишены доступа к RolePlay! Причина: &e${reason}`);
    bot.chat(`/cc &c🔒 ${target} лишён доступа к RP &e${sender}`);
    if (addLog) addLog(`🔒 ${sender} лишил ${target} доступа к RP (${reason})`, 'warn');
}

// ============================================
// /arp idim add/del [ник] [id] - Управление имуществом
// ============================================

async function arpIdim(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 3) {
        await sendMessage(bot, sender, `&4&l|&c Управление имуществом доступно с Ст.Модератора`);
        return;
    }
    
    if (args.length < 3) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp idim [add/del] [ник] [id]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = cleanNick(args[1]);
    const propertyId = args[2];
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        await sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
        return;
    }
    
    if (action === 'add') {
        await db.run('UPDATE property SET owner_nick = ?, is_available = 0 WHERE id = ?', [target, propertyId]);
        await sendMessage(bot, sender, `&a&l|&f Имущество &e${propertyId} &aвыдано &e${target}`);
        await sendMessage(bot, target, `&a&l|&f Вам выдано имущество #&e${propertyId} &7(${property.type})`);
        if (addLog) addLog(`🏠 ${sender} выдал имущество ${propertyId} игроку ${target}`, 'info');
    } else if (action === 'del') {
        await db.run('UPDATE property SET owner_nick = NULL, is_available = 1 WHERE id = ?', [propertyId]);
        await sendMessage(bot, sender, `&a&l|&f Имущество &e${propertyId} &aизъято у &e${target}`);
        await sendMessage(bot, target, `&4&l|&f У вас изъято имущество #&e${propertyId} &c${sender}`);
        if (addLog) addLog(`🏠 ${sender} изъял имущество ${propertyId} у ${target}`, 'warn');
    }
}

// ============================================
// /arp org freeze/unfreeze [структура]
// ============================================

async function arpOrg(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 4) {
        await sendMessage(bot, sender, `&4&l|&c Заморозка организаций доступна с Гл.Модератора`);
        return;
    }
    
    if (args.length < 2) {
        await sendMessage(bot, sender, `&7&l|&f Использование: &e/arp org [freeze/unfreeze] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const structure = args[1];
    
    const org = await db.getOrganization(structure);
    if (!org) {
        await sendMessage(bot, sender, `&4&l|&c Структура &e${structure} &cне найдена`);
        return;
    }
    
    if (action === 'freeze') {
        await db.run('UPDATE organizations SET is_frozen = 1, frozen_at = CURRENT_TIMESTAMP, frozen_by = ? WHERE name = ?', [sender, structure]);
        bot.chat(`/cc &c❄️ ${sender} ЗАМОРОЗИЛ структуру ${structure}`);
        if (addLog) addLog(`❄️ ${sender} заморозил структуру ${structure}`, 'warn');
    } else if (action === 'unfreeze') {
        await db.run('UPDATE organizations SET is_frozen = 0, frozen_at = NULL, frozen_by = NULL WHERE name = ?', [structure]);
        bot.chat(`/cc &a✅ ${sender} РАЗМОРОЗИЛ структуру ${structure}`);
        if (addLog) addLog(`✅ ${sender} разморозил структуру ${structure}`, 'info');
    }
}

// ============================================
// /duty - Встать на дежурство
// ============================================

async function duty(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Вы не зарегистрированы в RolePlay! Используйте &e/rp`);
        return;
    }
    
    if (profile.is_frozen === 1) {
        await sendMessage(bot, sender, `&4&l|&c Ваш RP профиль заморожен!`);
        return;
    }
    
    if (profile.structure === 'Гражданин') {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации!`);
        return;
    }
    
    const isOnDuty = profile.on_duty === 1;
    
    if (!isOnDuty) {
        await db.setDuty(cleanNickname, profile.structure, true);
        await sendMessage(bot, sender, `&a&l|&f Вы встали на дежурство в &e${profile.structure}`);
        bot.chat(`/cc &a👮 ${sender} заступил на дежурство`);
    } else {
        await db.setDuty(cleanNickname, profile.structure, false);
        await sendMessage(bot, sender, `&a&l|&f Вы снялись с дежурства`);
        bot.chat(`/cc &a👮 ${sender} снялся с дежурства`);
    }
}

// ============================================
// /status - Статус организации
// ============================================

async function status(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile || profile.structure === 'Гражданин') {
        await sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const members = await db.getOrgMembers(profile.structure);
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    
    await sendMessage(bot, sender, `&a&l|&f Статус &e${profile.structure}`);
    await sendMessage(bot, sender, `&7&l|&f Сотрудников: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
    await sendMessage(bot, sender, `&7&l|&f Бюджет: &e${org?.budget?.toLocaleString() || 0}₽ &7| Налог: &e${((org?.tax_rate || 0) * 100)}%`);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    arp,
    duty,
    status
};