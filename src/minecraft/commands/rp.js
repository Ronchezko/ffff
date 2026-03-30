// src/minecraft/commands/rp.js
const database = require('../../database');
const utils = require('../../shared/utils');
const payday = require('../payday');

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0', dark_blue: '&1', dark_green: '&2', dark_aqua: '&3',
    dark_red: '&4', dark_purple: '&5', gold: '&6', gray: '&7',
    dark_gray: '&8', blue: '&9', green: '&a', aqua: '&b',
    red: '&c', light_purple: '&d', yellow: '&e', white: '&f',
    bold: '&l', reset: '&r'
};

// Функция для красивого форматирования сообщений
function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${color}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

// Функция для создания рамки
function createFrame(title, lines) {
    let frame = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    frame += `${colors.gold}║ ${colors.light_purple}${colors.bold}${title}${colors.reset}`;
    frame += ' '.repeat(32 - title.length - 2) + `${colors.gold}║${colors.reset}\n`;
    frame += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    for (const line of lines) {
        frame += `${colors.gold}║ ${line}`;
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        frame += ' '.repeat(32 - cleanLine.length - 2) + `${colors.gold}║${colors.reset}\n`;
    }
    frame += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    return frame;
}

const RANK_ORDER = ['Мл.Модератор', 'Модератор', 'Ст.Модератор', 'Гл.Модератор', 'Куратор', 'Администратор'];

/**
 * /arp - администрирование RolePlay
 */
async function arp(bot, player, args, db, logCallback, sendPrivate, sendClan) {
    if (args.length < 2) {
        sendPrivate(player, formatMessage('❌', `Использование: &e/arp [команда] [параметры]`, colors.red));
        sendPrivate(player, formatMessage('ℹ️', 'Доступные команды: &ebalance, rank, points, blacklist, payday, warn, stats, rp, idim, org, stopall, reloadbd', colors.yellow));
        return;
    }
    
    const staffRank = await database.getStaffRank(player);
    const command = args[1];
    const subArgs = args.slice(2);
    
    if (!staffRank) {
        sendPrivate(player, formatMessage('❌', 'У вас нет прав для использования этой команды!', colors.red));
        return;
    }
    
    const actorLevel = RANK_ORDER.indexOf(staffRank);
    
    // ========== BALANCE ==========
    if (command === 'balance' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const amount = parseInt(subArgs[2]);
        
        if (isNaN(amount)) {
            sendPrivate(player, formatMessage('❌', 'Неверная сумма.', colors.red));
            return;
        }
        
        if (actorLevel < RANK_ORDER.indexOf('Ст.Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eСт.Модератор&r или выше!', colors.red));
            return;
        }
        
        const rpPlayer = await database.getRPPlayer(target);
        if (!rpPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        if (action === 'set') {
            await database.updatePlayerMoney(target, amount - rpPlayer.money, `Админ: ${player} установил баланс`, player);
            sendPrivate(player, formatMessage('✅', `Баланс &e${target}&r установлен на &e${amount.toLocaleString('ru-RU')}&r ₽`, colors.green));
        } else if (action === 'give') {
            await database.updatePlayerMoney(target, amount, `Админ: ${player} выдал`, player);
            sendPrivate(player, formatMessage('✅', `Выдано &e${amount.toLocaleString('ru-RU')}&r ₽ игроку &e${target}`, colors.green));
        } else if (action === 'reset') {
            await database.updatePlayerMoney(target, -rpPlayer.money, `Админ: ${player} обнулил баланс`, player);
            sendPrivate(player, formatMessage('✅', `Баланс &e${target}&r сброшен до &e0&r ₽`, colors.green));
        } else if (action === 'del') {
            if (rpPlayer.money < amount) {
                sendPrivate(player, formatMessage('❌', `У игрока &e${target}&r недостаточно средств.`, colors.red));
                return;
            }
            await database.updatePlayerMoney(target, -amount, `Админ: ${player} забрал`, player);
            sendPrivate(player, formatMessage('✅', `Забрано &e${amount.toLocaleString('ru-RU')}&r ₽ у &e${target}`, colors.green));
        } else {
            sendPrivate(player, formatMessage('❌', 'Используйте: &eset, give, reset, del', colors.red));
            return;
        }
        
        if (logCallback) logCallback(`💰 ${player} изменил баланс ${target} (${action} ${amount}₽)`, 'info');
    }
    
    // ========== RANK ==========
    else if (command === 'rank' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const structure = subArgs[2];
        const rank = subArgs[3];
        
        if (actorLevel < RANK_ORDER.indexOf('Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eМодератор&r или выше!', colors.red));
            return;
        }
        
        const rpPlayer = await database.getRPPlayer(target);
        if (!rpPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        if (action === 'set') {
            if (!rank) {
                sendPrivate(player, formatMessage('❌', 'Укажите ранг.', colors.red));
                return;
            }
            db.getDb().prepare('UPDATE rp_players SET structure = ?, organization_rank = ? WHERE minecraft_nick = ?').run(structure, rank, target);
            sendPrivate(player, formatMessage('✅', `&e${target}&r назначен в &e${structure}&r на должность &e${rank}`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('✅', `Вы назначены в &e${structure}&r на должность &e${rank}`, colors.green));
            }, 500);
            if (logCallback) logCallback(`👔 ${player} назначил ${target} в ${structure} (${rank})`, 'info');
        } else if (action === 'del') {
            db.getDb().prepare('UPDATE rp_players SET structure = NULL, organization_rank = NULL WHERE minecraft_nick = ?').run(target);
            sendPrivate(player, formatMessage('✅', `&e${target}&r удалён из организаций`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('⚠️', `Вы удалены из организаций`, colors.yellow));
            }, 500);
            if (logCallback) logCallback(`👔 ${player} удалил ${target} из организаций`, 'info');
        } else {
            sendPrivate(player, formatMessage('❌', 'Используйте: &eset, del', colors.red));
        }
    }
    
    // ========== POINTS ==========
    else if (command === 'points' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const points = parseInt(subArgs[2]);
        
        if (isNaN(points)) {
            sendPrivate(player, formatMessage('❌', 'Неверное количество баллов.', colors.red));
            return;
        }
        
        if (actorLevel < RANK_ORDER.indexOf('Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eМодератор&r или выше!', colors.red));
            return;
        }
        
        const rpPlayer = await database.getRPPlayer(target);
        if (!rpPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        if (action === 'add') {
            const newPoints = (rpPlayer.unique_points || 0) + points;
            db.getDb().prepare('UPDATE rp_players SET unique_points = ? WHERE minecraft_nick = ?').run(newPoints, target);
            sendPrivate(player, formatMessage('✅', `Игроку &e${target}&r добавлено &e${points}&r баллов. Всего: &e${newPoints}`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('⭐', `Вам начислено &e${points}&r баллов активности!`, colors.green));
            }, 500);
        } else if (action === 'del') {
            const newPoints = Math.max(0, (rpPlayer.unique_points || 0) - points);
            db.getDb().prepare('UPDATE rp_players SET unique_points = ? WHERE minecraft_nick = ?').run(newPoints, target);
            sendPrivate(player, formatMessage('✅', `У игрока &e${target}&r удалено &e${points}&r баллов. Всего: &e${newPoints}`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('⚠️', `У вас удалено &e${points}&r баллов активности.`, colors.yellow));
            }, 500);
        }
        
        if (logCallback) logCallback(`⭐ ${player} изменил баллы ${target} (${action} ${points})`, 'info');
    }
    
    // ========== BLACKLIST (структур) ==========
    else if (command === 'blacklist' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const structure = subArgs[2];
        
        if (actorLevel < RANK_ORDER.indexOf('Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eМодератор&r или выше!', colors.red));
            return;
        }
        
        const blKey = `blacklist_${structure}`;
        const current = JSON.parse(database.getSetting(blKey) || '[]');
        
        if (action === 'add') {
            if (!current.includes(target)) {
                current.push(target);
                database.setSetting(blKey, JSON.stringify(current));
                sendPrivate(player, formatMessage('✅', `&e${target}&r добавлен в ЧС структуры &e${structure}`, colors.green));
                if (logCallback) logCallback(`🚫 ${player} добавил ${target} в ЧС структуры ${structure}`, 'warn');
            } else {
                sendPrivate(player, formatMessage('⚠️', `&e${target}&r уже в ЧС этой структуры.`, colors.yellow));
            }
        } else if (action === 'del') {
            const filtered = current.filter(n => n !== target);
            database.setSetting(blKey, JSON.stringify(filtered));
            sendPrivate(player, formatMessage('✅', `&e${target}&r удалён из ЧС структуры &e${structure}`, colors.green));
            if (logCallback) logCallback(`✅ ${player} удалил ${target} из ЧС структуры ${structure}`, 'info');
        }
    }
    
    // ========== PAYDAY ==========
    else if (command === 'payday') {
        if (actorLevel < RANK_ORDER.indexOf('Администратор')) {
            sendPrivate(player, formatMessage('❌', 'Только &eАдминистратор&r может использовать эту команду!', colors.red));
            return;
        }
        
        await payday.performPayday();
        sendClan(formatMessage('💵', 'Внеплановый PayDay запущен администратором!', colors.green));
        sendPrivate(player, formatMessage('✅', 'Внеплановый PayDay запущен!', colors.green));
        if (logCallback) logCallback(`💵 ${player} запустил внеплановый PayDay`, 'info');
    }
    
    // ========== WARN ==========
    else if (command === 'warn' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const reason = subArgs.slice(2).join(' ');
        
        if (actorLevel < RANK_ORDER.indexOf('Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eМодератор&r или выше!', colors.red));
            return;
        }
        
        const rpPlayer = await database.getRPPlayer(target);
        if (!rpPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        if (action === 'add') {
            const newWarns = (rpPlayer.warns || 0) + 1;
            db.getDb().prepare('UPDATE rp_players SET warns = ? WHERE minecraft_nick = ?').run(newWarns, target);
            sendPrivate(player, formatMessage('⚠️', `&e${target}&r получил предупреждение (&e${newWarns}/3&r). Причина: &e${reason}`, colors.yellow));
            setTimeout(() => {
                sendPrivate(target, formatMessage('⚠️', `Вы получили предупреждение (&e${newWarns}/3&r). Причина: &e${reason}`, colors.yellow));
            }, 500);
            
            if (newWarns >= 3) {
                db.getDb().prepare('UPDATE rp_players SET frozen = 1 WHERE minecraft_nick = ?').run(target);
                sendPrivate(target, formatMessage('🚫', 'Вы отстранены от RolePlay за 3 предупреждения!', colors.red));
                sendClan(formatMessage('🚫', `Игрок &e${target}&r отстранён от RolePlay за 3 предупреждения.`, colors.red));
            }
            if (logCallback) logCallback(`⚠️ ${player} выдал предупреждение ${target} (${newWarns}/3)`, 'warn');
            
        } else if (action === 'del') {
            const newWarns = Math.max(0, (rpPlayer.warns || 0) - 1);
            db.getDb().prepare('UPDATE rp_players SET warns = ? WHERE minecraft_nick = ?').run(newWarns, target);
            sendPrivate(player, formatMessage('✅', `Предупреждение снято с &e${target}`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('✅', `С вас снято предупреждение.`, colors.green));
            }, 500);
            if (logCallback) logCallback(`✅ ${player} снял предупреждение с ${target}`, 'info');
        }
    }
    
    // ========== STATS ==========
    else if (command === 'stats' && subArgs.length >= 1) {
        const target = subArgs[0];
        const member = await database.getPlayerByNickname(target);
        const rpPlayer = await database.getRPPlayer(target);
        
        if (!member) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не найден.`, colors.red));
            return;
        }
        
        const lines = [];
        lines.push(`${colors.aqua}Никнейм:${colors.reset} ${colors.white}${target}`);
        lines.push(`${colors.aqua}Ранг в клане:${colors.reset} ${colors.yellow}${member.rank || 'Новичок'}`);
        lines.push(`${colors.aqua}Статистика:${colors.reset} ${colors.white}${member.kills}⚔️ / ${member.deaths}💀`);
        lines.push(`${colors.aqua}В клане с:${colors.reset} ${colors.white}${new Date(member.joined_at).toLocaleDateString()}`);
        
        if (rpPlayer) {
            lines.push(`${colors.gold}────────────────────`);
            lines.push(`${colors.light_purple}${colors.bold}ROLEPLAY ДАННЫЕ${colors.reset}`);
            lines.push(`${colors.aqua}Баланс:${colors.reset} ${colors.green}${rpPlayer.money.toLocaleString('ru-RU')}₽`);
            lines.push(`${colors.aqua}Структура:${colors.reset} ${colors.white}${rpPlayer.structure || 'не выбрана'}`);
            lines.push(`${colors.aqua}Звание:${colors.reset} ${colors.yellow}${rpPlayer.organization_rank || 'нет'}`);
            lines.push(`${colors.aqua}Баллы:${colors.reset} ${colors.green}${rpPlayer.unique_points || 0}`);
            lines.push(`${colors.aqua}Предупреждений:${colors.reset} ${rpPlayer.warns >= 3 ? colors.red : colors.yellow}${rpPlayer.warns || 0}/3`);
            lines.push(`${colors.aqua}Статус:${colors.reset} ${rpPlayer.frozen ? colors.red + 'ЗАМОРОЖЕН' : colors.green + 'АКТИВЕН'}`);
        } else {
            lines.push(`${colors.gold}────────────────────`);
            lines.push(`${colors.red}${colors.bold}ROLEPLAY: НЕ ЗАРЕГИСТРИРОВАН${colors.reset}`);
        }
        
        const frame = createFrame(`📊 СТАТИСТИКА ${target}`, lines);
        sendPrivate(player, frame);
    }
    
    // ========== RP DEL ==========
    else if (command === 'rp' && subArgs.length >= 2 && subArgs[0] === 'del') {
        const target = subArgs[1];
        const reason = subArgs.slice(2).join(' ') || 'Не указана';
        
        if (actorLevel < RANK_ORDER.indexOf('Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eМодератор&r или выше!', colors.red));
            return;
        }
        
        const rpPlayer = await database.getRPPlayer(target);
        if (!rpPlayer) {
            sendPrivate(player, formatMessage('❌', `Игрок &e${target}&r не в RolePlay.`, colors.red));
            return;
        }
        
        db.getDb().prepare('DELETE FROM rp_players WHERE minecraft_nick = ?').run(target);
        sendPrivate(player, formatMessage('✅', `RolePlay у &e${target}&r удалён. Причина: &e${reason}`, colors.green));
        setTimeout(() => {
            sendPrivate(target, formatMessage('🚫', `Ваш доступ к RolePlay отозван. Причина: &e${reason}`, colors.red));
        }, 500);
        if (logCallback) logCallback(`🗑️ ${player} удалил RP у ${target}: ${reason}`, 'warn');
    }
    
    // ========== IDIM ADD/DEL ==========
    else if (command === 'idim' && subArgs.length >= 3) {
        const action = subArgs[0];
        const target = subArgs[1];
        const propertyId = parseFloat(subArgs[2]);
        
        if (actorLevel < RANK_ORDER.indexOf('Ст.Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eСт.Модератор&r или выше!', colors.red));
            return;
        }
        
        const property = await database.getProperty(propertyId);
        if (!property) {
            sendPrivate(player, formatMessage('❌', `Имущество #${propertyId} не найдено.`, colors.red));
            return;
        }
        
        if (action === 'add') {
            db.getDb().prepare('UPDATE properties SET owner = ? WHERE id = ?').run(target, propertyId);
            sendPrivate(player, formatMessage('✅', `Имущество #${propertyId} выдано &e${target}`, colors.green));
            setTimeout(() => {
                sendPrivate(target, formatMessage('🏠', `Вам выдано имущество #${propertyId} (${property.type})`, colors.green));
            }, 500);
            if (logCallback) logCallback(`🏠 ${player} выдал имущество #${propertyId} игроку ${target}`, 'info');
        } else if (action === 'del') {
            db.getDb().prepare('UPDATE properties SET owner = NULL, co_owners = "[]" WHERE id = ?').run(propertyId);
            sendPrivate(player, formatMessage('✅', `Имущество #${propertyId} изъято у &e${property.owner}`, colors.green));
            if (logCallback) logCallback(`🏠 ${player} изъял имущество #${propertyId} у ${property.owner}`, 'warn');
        }
    }
    
    // ========== ORG FREEZE/UNFREEZE ==========
    else if (command === 'org' && subArgs.length >= 2 && (subArgs[0] === 'freeze' || subArgs[0] === 'unfreeze')) {
        const action = subArgs[0];
        const structure = subArgs[1];
        
        if (actorLevel < RANK_ORDER.indexOf('Гл.Модератор')) {
            sendPrivate(player, formatMessage('❌', 'Требуется ранг &eГл.Модератор&r или выше!', colors.red));
            return;
        }
        
        if (action === 'freeze') {
            db.getDb().prepare('UPDATE rp_players SET frozen = 1 WHERE structure = ?').run(structure);
            sendClan(formatMessage('❄️', `Организация &e${structure}&r заморожена!`, colors.red));
            if (logCallback) logCallback(`❄️ ${player} заморозил организацию ${structure}`, 'warn');
        } else if (action === 'unfreeze') {
            db.getDb().prepare('UPDATE rp_players SET frozen = 0 WHERE structure = ?').run(structure);
            sendClan(formatMessage('✅', `Организация &e${structure}&r разморожена!`, colors.green));
            if (logCallback) logCallback(`🔥 ${player} разморозил организацию ${structure}`, 'info');
        }
    }
    
    // ========== STOPALL ==========
    else if (command === 'stopall') {
        if (actorLevel < RANK_ORDER.indexOf('Администратор')) {
            sendPrivate(player, formatMessage('❌', 'Только &eАдминистратор&r может использовать эту команду!', colors.red));
            return;
        }
        
        const isStopped = global.isRPStopped;
        if (isStopped) {
            global.isRPStopped = false;
            sendClan(formatMessage('✅', 'Все RolePlay процессы возобновлены!', colors.green));
        } else {
            global.isRPStopped = true;
            sendClan(formatMessage('⚠️', 'Все RolePlay процессы остановлены (подготовка к вайпу)!', colors.yellow));
        }
        if (logCallback) logCallback(`⏸️ ${player} ${isStopped ? 'возобновил' : 'остановил'} все RP процессы`, 'warn');
    }
    
    // ========== RELOADBD ==========
    else if (command === 'reloadbd') {
        if (actorLevel < RANK_ORDER.indexOf('Администратор')) {
            sendPrivate(player, formatMessage('❌', 'Только &eАдминистратор&r может использовать эту команду!', colors.red));
            return;
        }
        
        sendClan(formatMessage('⚠️', 'Идёт очистка базы данных...', colors.yellow));
        
        try {
            const db = database.getDb();
            db.exec('DELETE FROM clan_members WHERE rank NOT LIKE "%Администратор%"');
            db.exec('DELETE FROM rp_players');
            db.exec('DELETE FROM money_logs');
            db.exec('DELETE FROM punishments');
            db.exec('DELETE FROM clan_chat_logs');
            db.exec('DELETE FROM staff');
            db.exec('DELETE FROM verification_codes');
            db.exec('DELETE FROM properties WHERE owner IS NOT NULL');
            db.exec('DELETE FROM structure_members');
            db.exec('DELETE FROM org_budgets');
            
            sendClan(formatMessage('✅', 'База данных очищена (подготовка к вайпу)!', colors.green));
            if (logCallback) logCallback(`🗑️ ${player} очистил базу данных (вайп)`, 'error');
        } catch (err) {
            sendPrivate(player, formatMessage('❌', `Ошибка очистки: ${err.message}`, colors.red));
            if (logCallback) logCallback(`❌ Ошибка очистки БД: ${err.message}`, 'error');
        }
    }
    
    else {
        sendPrivate(player, formatMessage('❌', `Неизвестная команда /arp ${command}. Используйте &e/arp help`, colors.red));
    }
}

module.exports = { arp };