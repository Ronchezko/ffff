// src/minecraft/commands/rp.js
// RolePlay команды: организации, дежурства, структуры

const utils = require('../../shared/utils');

function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
}

// ============================================
// /arp - Административные RP команды
// ============================================
function cleanNick(nick) {
    if (!nick) return '';
    let cleaned = nick;
    cleaned = cleaned.replace(/[&§][0-9a-fk-or]/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned.toLowerCase();
}

// Вспомогательная функция отправки сообщений
async function sendMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await new Promise(resolve => setTimeout(resolve, 300));
}
async function arp(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 2) {
        sendMessage(bot, sender, `&4&l|&c У вас нет прав для использования &e/arp`);
        return;
    }
    
    if (args.length < 1) {
        sendMessage(bot, sender, `&7&l|&f Использование: &4'&c/arp функция подфункция&4'`);
        sendMessage(bot, sender, `&7&l|&f Список функций: &4'&cbalance&8/&crank&8/&cpoints&8/&cblacklist&8/&cpayday&8/&cwarn&8/&cstats&8/&crp&8/&cidim&8/&corg&4'`);
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
            await arpWarn(sender, args, bot, db, addLog);
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
            sendMessage(bot, sender, `&4&l|&c Неизвестная подкоманда &e/arp ${subCmd}`);
    }
}

// /arp balance set/give/reset/del [ник] [сумма]
async function arpBalance(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp balance [set/give/reset/del] [ник] [сумма]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const amount = parseFloat(args[2]);
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    switch(action) {
        case 'set':
            if (isNaN(amount)) { sendMessage(bot, sender, `&4&l|&c Укажите сумму`); return; }
            await db.updateMoney(target, amount - profile.money, 'admin_set', `Установка баланса администратором ${sender}`, sender);
            sendMessage(bot, sender, `&a&l|&f Баланс &e${target} &aустановлен на &e${amount.toLocaleString()}₽`);
            break;
        case 'give':
            if (isNaN(amount) || amount <= 0) { sendMessage(bot, sender, `&4&l|&c Укажите сумму`); return; }
            await db.updateMoney(target, amount, 'admin_give', `Выдача от ${sender}`, sender);
            sendMessage(bot, sender, `&a&l|&f Выдано &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
            break;
        case 'reset':
            await db.updateMoney(target, 1000 - profile.money, 'admin_reset', `Сброс баланса ${sender}`, sender);
            sendMessage(bot, sender, `&a&l|&f Баланс &e${target} &aсброшен до &e1000₽`);
            break;
        case 'del':
            await db.updateMoney(target, -profile.money, 'admin_remove', `Списание всех средств ${sender}`, sender);
            sendMessage(bot, sender, `&a&l|&f Все средства списаны у &e${target}`);
            break;
        default:
            sendMessage(bot, sender, `&4&l|&c Неизвестное действие. Используйте: &eset, give, reset, del`);
    }
    if (addLog) addLog(`💰 ${sender} изменил баланс ${target} (${action})`, 'info');
}

// /arp rank set/del [ник] [структура] [ранг]
async function arpRank(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp rank [set/del] [ник] [структура] [ранг]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    
    if (action === 'set') {
        if (args.length < 4) {
            sendMessage(bot, sender, `&4&l|&c Использование: &e/arp rank set [ник] [структура] [ранг]`);
            return;
        }
        const structure = args[2];
        const rank = args[3];
        
        const org = await db.getOrganization(structure);
        if (!org) {
            sendMessage(bot, sender, `&4&l|&c Структура &e${structure} &cне найдена`);
            return;
        }
        
        await db.addOrgMember(target, structure, rank);
        sendMessage(bot, sender, `&a&l|&f ${target} &aназначен на &e${rank} &aв &e${structure}`);
        sendMessage(bot, target, `&a&l|&f Вы назначены на должность &e${rank} &aв &e${structure}`);
        if (addLog) addLog(`📋 ${sender} назначил ${target} на ${rank} в ${structure}`, 'info');
        
    } else if (action === 'del') {
        const profile = await db.getRPProfile(target);
        if (!profile || profile.structure === 'Гражданин') {
            sendMessage(bot, sender, `&4&l|&c ${target} &cне состоит в организации`);
            return;
        }
        await db.removeOrgMember(target, profile.structure);
        sendMessage(bot, sender, `&a&l|&f ${target} &aудалён из организации`);
        sendMessage(bot, target, `&c&l|&f Вы уволены из организации &e${sender}`);
        if (addLog) addLog(`📋 ${sender} уволил ${target} из организации`, 'warn');
    }
}

// /arp points add/del [ник] [количество]
async function arpPoints(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp points [add/del] [ник] [количество]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const points = parseInt(args[2]);
    
    if (isNaN(points) || points <= 0) {
        sendMessage(bot, sender, `&4&l|&c Укажите количество баллов`);
        return;
    }
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    if (action === 'add') {
        await db.run('UPDATE rp_players SET rp_points = rp_points + ? WHERE minecraft_nick = ?', [points, target]);
        sendMessage(bot, sender, `&a&l|&f Добавлено &e${points} &aбаллов игроку &e${target}`);
    } else if (action === 'del') {
        await db.run('UPDATE rp_players SET rp_points = MAX(0, rp_points - ?) WHERE minecraft_nick = ?', [points, target]);
        sendMessage(bot, sender, `&a&l|&f Снято &e${points} &aбаллов у игрока &e${target}`);
    } else {
        sendMessage(bot, sender, `&4&l|&c Используйте &eadd&c или &edel`);
        return;
    }
    if (addLog) addLog(`⭐ ${sender} ${action === 'add' ? 'добавил' : 'снял'} ${points} баллов у ${target}`, 'info');
}

// /arp blacklist add/del [ник] [структура]
async function arpBlacklist(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp blacklist [add/del] [ник] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const structure = args[2];
    
    if (action === 'add') {
        if (!structure) {
            sendMessage(bot, sender, `&4&l|&c Укажите структуру для ЧС`);
            return;
        }
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'true', sender);
        sendMessage(bot, sender, `&a&l|&f ${target} &aдобавлен в ЧС структуры &e${structure}`);
        if (addLog) addLog(`⛔ ${sender} добавил ${target} в ЧС структуры ${structure}`, 'warn');
    } else if (action === 'del') {
        await db.setSetting(`org_blacklist_${structure}_${target}`, 'false', sender);
        sendMessage(bot, sender, `&a&l|&f ${target} &aудалён из ЧС структуры &e${structure}`);
        if (addLog) addLog(`✅ ${sender} удалил ${target} из ЧС структуры ${structure}`, 'info');
    }
}

// /arp payday - Внеплановый PayDay
async function arpPayday(bot, sender, args, db, addLog) {
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 6) {
        sendMessage(bot, sender, `&4&l|&c Внеплановый PayDay могут делать только администраторы`);
        return;
    }
    
    bot.chat(`/cc &a💰 ${sender} запускает внеплановый PayDay!`);
    const payday = require('../payday');
    await payday.processPayDay(bot, db, addLog);
    if (addLog) addLog(`💰 ${sender} запустил внеплановый PayDay`, 'info');
}

// /arp warn add/del [ник] [причина]
async function arpWarn(sender, args, bot, db, addBotLog) {
    if (!Array.isArray(args)) {
        bot.chat(`/msg ${sender} &4&l|&c Ошибка: неверный формат аргументов`);
        return;
    }
    
    const action = args[1];
    const target = args[2];
    const reason = args.slice(3).join(' ');
    
    if (!target) {
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/arp warn add <ник> <причина>`);
        bot.chat(`/msg ${sender} &7&l|&f Использование: &e/arp warn del <ник>`);
        return;
    }
    
    // Проверяем права (минимум модератор)
    const staffRank = await db.getStaffRank(sender);
    if (staffRank.rank_level < 1) {
        bot.chat(`/msg ${sender} &4&l|&c У вас нет прав для выдачи предупреждений`);
        return;
    }
    
    try {
        if (action === 'add') {
            if (!reason) {
                bot.chat(`/msg ${sender} &7&l|&f Использование: &e/arp warn add ${target} <причина>`);
                return;
            }
            
            // Добавляем предупреждение
            await db.run(
                `INSERT INTO rp_warnings (player, reason, issued_by) VALUES (?, ?, ?)`,
                [target.toLowerCase(), reason, sender]
            );
            
            // Проверяем количество предупреждений
            const warnings = await db.get(
                `SELECT COUNT(*) as count FROM rp_warnings WHERE player = ? AND active = 1`,
                [target.toLowerCase()]
            );
            
            bot.chat(`/msg ${sender} &a&l|&f Вы &2успешно&f выдали предупреждение игроку &e${target}`);
            bot.chat(`/msg ${target} &4&l|&c Вы получили предупреждение от &e${sender}&c: ${reason}`);
            bot.chat(`/msg ${target} &7&l|&f У вас &e${warnings.count}/3 &fпредупреждений`);
            
            if (warnings.count >= 3) {
                // Полная блокировка RP
                await db.run(
                    `UPDATE rp_players SET is_frozen = 1 WHERE LOWER(minecraft_nick) = LOWER(?)`,
                    [target]
                );
                
                // Очищаем данные игрока (опционально)
                await db.run(
                    `UPDATE rp_players SET 
                        on_duty = 0, 
                        duty_start_time = NULL,
                        structure = 'Заморожен',
                        job_rank = 'Заблокирован'
                    WHERE LOWER(minecraft_nick) = LOWER(?)`,
                    [target]
                );
                

                bot.chat(`/msg ${target} &7&l|&f Вы достигнли &43&f предупреждений. Ваш профиль &3заморожен&f.`);
                
                bot.chat(`/msg ${sender} &a&l|&f Игрок &e${target} &cзаблокирован &fв RP (3 предупреждения)`);
                
                // Оповещаем всех в клановом чате
                bot.chat(`/cc &4&l| Игрок &e${target} &cзаблокирован в RP за 3 предупреждения!`);
            }
            
            // Логируем в Discord
            const discord = global.botComponents.discord;
            if (discord && discord.client) {
                const channel = discord.client.channels.cache.get('1474633679442804798');
                if (channel) {
                    channel.send(`⚠️ **RP Предупреждение**\nИгрок: ${target}\nВыдал: ${sender}\nПричина: ${reason}\nВсего: ${warnings.count}/3`);
                }
            }
            
        } else if (action === 'del') {
            // Снимаем последнее предупреждение
            const lastWarn = await db.get(
                `SELECT id FROM rp_warnings WHERE player = ? AND active = 1 ORDER BY issued_at DESC LIMIT 1`,
                [target.toLowerCase()]
            );
            
            if (lastWarn) {
                await db.run(
                    `UPDATE rp_warnings SET active = 0 WHERE id = ?`,
                    [lastWarn.id]
                );
                
                // Проверяем, можно ли разблокировать RP
                const remainingWarns = await db.get(
                    `SELECT COUNT(*) as count FROM rp_warnings WHERE player = ? AND active = 1`,
                    [target.toLowerCase()]
                );
                
                if (remainingWarns.count < 3) {
                    await db.run(
                        `UPDATE rp_players SET is_frozen = 0 WHERE minecraft_nick = ?`,
                        [target.toLowerCase()]
                    );
                }
                
                bot.chat(`/msg ${sender} &a&l|&f Вы &2успешно&f сняли предупреждение с &e${target}`);
                bot.chat(`/msg ${target} &a&l|&f С вас снято предупреждение от &e${sender}`);
            } else {
                bot.chat(`/msg ${sender} &4&l|&c У игрока &e${target} &cнет активных предупреждений`);
            }
        } else {
            bot.chat(`/msg ${sender} &7&l|&f Использование: &e/arp warn add/del <ник> [причина]`);
        }
        
    } catch (error) {
        console.error('Ошибка в arpWarn:', error);
        bot.chat(`/msg ${sender} &4&l|&c Ошибка: ${error.message}`);
    }
}
// /arp stats [ник] - Показать статистику игрока
async function arpStats(bot, sender, args, db) {
    if (args.length < 1) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp stats [ник]`);
        return;
    }
    
    const target = args[0];
    const stats = await db.getPlayerStats(target);
    const rpProfile = await db.getRPProfile(target);
    
    if (!stats && !rpProfile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне найден`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Статистика игрока &e${target}`);
    if (stats) sendMessage(bot, sender, `&7&l|&f Ранг: &e${stats.rank_name} &7| Убийств/Смертей: &e${stats.kills}/${stats.deaths}`);
    if (rpProfile) sendMessage(bot, sender, `&7&l|&f Структура: &e${rpProfile.structure} &7| Ранг: &e${rpProfile.job_rank} &7| Баланс: &e${rpProfile.money?.toLocaleString()}₽`);
    if (rpProfile) sendMessage(bot, sender, `&7&l|&f Баллы RP: &e${rpProfile.rp_points} &7| Предупреждения: &e${rpProfile.warnings}/3`);
}

// /arp rp del [ник] [причина] - Забрать доступ к RP
async function arpRpDel(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp rp del [ник] [причина]`);
        return;
    }
    
    const target = args[0];
    const reason = args.slice(1).join(' ');
    
    const profile = await db.getRPProfile(target);
    if (!profile) {
        sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RP`);
        return;
    }
    
    await db.run(`UPDATE rp_players SET structure = 'Гражданин', job_rank = 'Нет', on_duty = 0, is_frozen = 1, warnings = 0 WHERE minecraft_nick = ?`, [target]);
    await db.run('DELETE FROM org_members WHERE minecraft_nick = ?', [target]);
    
    sendMessage(bot, sender, `&a&l|&f Доступ к RP забран у &e${target}`);
    sendMessage(bot, target, `&c&l|&f Вы лишены доступа к RolePlay! Причина: &e${reason}`);
    bot.chat(`/cc &c🔒 ${target} лишён доступа к RP &e${sender}`);
    if (addLog) addLog(`🔒 ${sender} лишил ${target} доступа к RP (${reason})`, 'warn');
}

// /arp idim add/del [ник] [id] - Управление имуществом
async function arpIdim(bot, sender, args, db, addLog) {
    if (args.length < 3) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp idim [add/del] [ник] [id]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const target = args[1];
    const propertyId = args[2];
    
    const property = await db.getProperty(propertyId);
    if (!property) {
        sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
        return;
    }
    
    if (action === 'add') {
        await db.run('UPDATE property SET owner_nick = ?, is_available = 0 WHERE id = ?', [target, propertyId]);
        sendMessage(bot, sender, `&a&l|&f Имущество &e${propertyId} &aвыдано &e${target}`);
        sendMessage(bot, target, `&a&l|&f Вам выдано имущество #&e${propertyId} &7(${property.type})`);
        if (addLog) addLog(`🏠 ${sender} выдал имущество ${propertyId} игроку ${target}`, 'info');
    } else if (action === 'del') {
        await db.run('UPDATE property SET owner_nick = NULL, is_available = 1 WHERE id = ?', [propertyId]);
        sendMessage(bot, sender, `&a&l|&f Имущество &e${propertyId} &aизъято у &e${target}`);
        sendMessage(bot, target, `&c&l|&f У вас изъято имущество #&e${propertyId} &c${sender}`);
        if (addLog) addLog(`🏠 ${sender} изъял имущество ${propertyId} у ${target}`, 'warn');
    }
}

// /arp org freeze/unfreeze [структура]
async function arpOrg(bot, sender, args, db, addLog) {
    if (args.length < 2) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/arp org [freeze/unfreeze] [структура]`);
        return;
    }
    
    const action = args[0].toLowerCase();
    const structure = args[1];
    
    const org = await db.getOrganization(structure);
    if (!org) {
        sendMessage(bot, sender, `&4&l|&c Структура &e${structure} &cне найдена`);
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

// /duty - Встать на дежурство
async function duty(bot, sender, args, db) {
    const cleanNickname = cleanNick(sender);
    
    const profile = await db.getRPProfile(cleanNickname);
    if (!profile) {
        await sendMessage(bot, sender, `&4&l|&c Вы не зарегистрированы в RolePlay! Используйте &e/rp`);
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
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const org = await db.getOrganization(profile.structure);
    const members = await db.getOrgMembers(profile.structure);
    const onDuty = members?.filter(m => m.on_duty === 1).length || 0;
    
    sendMessage(bot, sender, `&a&l|&f Статус &e${profile.structure}`);
    sendMessage(bot, sender, `&7&l|&f Сотрудников: &e${members?.length || 0} &7| На дежурстве: &e${onDuty}`);
    sendMessage(bot, sender, `&7&l|&f Бюджет: &e${org?.budget?.toLocaleString() || 0}₽ &7| Налог: &e${((org?.tax_rate || 0) * 100)}%`);
}

// ============================================
// /org o members - Узнать состав организации
// ============================================

async function orgMembers(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const members = await db.getOrgMembers(profile.structure);
    if (!members || members.length === 0) {
        sendMessage(bot, sender, `&4&l|&c В организации &e${profile.structure} &cнет сотрудников`);
        return;
    }
    
    const memberList = members.map(m => `${m.minecraft_nick} (${m.rank_name})`).join(', ');
    sendMessage(bot, sender, `&a&l|&f Состав &e${profile.structure}&f: &e${memberList}`);
}

// ============================================
// /org o ranks [ранг] - Информация о ранге
// ============================================

async function orgRanks(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const rankName = args[0];
    if (!rankName) {
        sendMessage(bot, sender, `&4&l|&c Использование: &e/org o ranks [ранг]`);
        return;
    }
    
    const rank = await db.get(`SELECT * FROM org_ranks WHERE org_name = ? AND rank_name = ?`, [profile.structure, rankName]);
    if (!rank) {
        sendMessage(bot, sender, `&4&l|&c Ранг &e${rankName} &cне найден в &e${profile.structure}`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Ранг &e${rank.rank_name} &7(${profile.structure})`);
    sendMessage(bot, sender, `&7&l|&f Зарплата: &e${rank.base_salary.toLocaleString()}₽/час`);
}

// ============================================
// /org o balance [deposit/withdraw] [сумма]
// ============================================

async function orgBalance(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const action = args[0];
    const amount = parseFloat(args[1]);
    
    const org = await db.getOrganization(profile.structure);
    if (!org) {
        sendMessage(bot, sender, `&4&l|&c Организация не найдена`);
        return;
    }
    
    if (!action) {
        sendMessage(bot, sender, `&a&l|&f Бюджет &e${profile.structure}&f: &e${org.budget?.toLocaleString() || 0}₽`);
        return;
    }
    
    const isLeader = org.leader_nick === sender;
    if (!isLeader) {
        sendMessage(bot, sender, `&4&l|&c Пополнять/снимать бюджет может только лидер организации`);
        return;
    }
    
    if (action === 'deposit') {
        if (isNaN(amount) || amount <= 0) {
            sendMessage(bot, sender, `&4&l|&c Укажите сумму для пополнения`);
            return;
        }
        const userBalance = await db.getBalance(sender);
        if (userBalance < amount) {
            sendMessage(bot, sender, `&4&l|&c Недостаточно средств`);
            return;
        }
        await db.updateMoney(sender, -amount, 'org_deposit', `Пополнение бюджета ${profile.structure}`, sender);
        await db.run('UPDATE organizations SET budget = budget + ? WHERE name = ?', [amount, profile.structure]);
        sendMessage(bot, sender, `&a&l|&f Бюджет &e${profile.structure} &aпополнен на &e${amount.toLocaleString()}₽`);
    } else if (action === 'withdraw') {
        if (isNaN(amount) || amount <= 0) {
            sendMessage(bot, sender, `&4&l|&c Укажите сумму для снятия`);
            return;
        }
        if (org.budget < amount) {
            sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете организации`);
            return;
        }
        await db.updateMoney(sender, amount, 'org_withdraw', `Снятие из бюджета ${profile.structure}`, sender);
        await db.run('UPDATE organizations SET budget = budget - ? WHERE name = ?', [amount, profile.structure]);
        sendMessage(bot, sender, `&a&l|&f Вы сняли &e${amount.toLocaleString()}₽ &aиз бюджета &e${profile.structure}`);
    }
}

// ============================================
// /org o points - Посмотреть баллы
// ============================================

async function orgPoints(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    sendMessage(bot, sender, `&a&l|&f Ваши баллы активности: &e${profile.rp_points || 0}`);
}

// ============================================
// /org o wstatus - Статистика рабочего времени
// ============================================

async function orgWstatus(bot, sender, args, db) {
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.structure === 'Гражданин') {
        sendMessage(bot, sender, `&4&l|&c Вы не состоите в организации`);
        return;
    }
    
    const hours = Math.floor((profile.total_duty_seconds || 0) / 3600);
    const minutes = Math.floor(((profile.total_duty_seconds || 0) % 3600) / 60);
    sendMessage(bot, sender, `&a&l|&f Статистика дежурств: &e${hours}ч ${minutes}мин`);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    arp,
    duty,
    status,
    orgMembers,
    orgRanks,
    orgBalance,
    orgPoints,
    orgWstatus
};