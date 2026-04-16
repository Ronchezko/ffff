// src/database/index.js
// Модуль для работы с базой данных Resistance City

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../shared/logger');

let db = null;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

async function initialize() {
    try {
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info('📁 Создана папка data');
        }

        db = await open({
            filename: path.join(dataDir, 'hoholss.db'),
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA journal_mode = WAL');
        await ensureIdColumn();
        
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await db.exec(schema);
            logger.success('✅ Схема базы данных загружена');
        } else {
            logger.warn('⚠️ schema.sql не найден');
            await createTablesProgrammatically();
        }

        try {
            await db.exec(`ALTER TABLE punishments ADD COLUMN source TEXT DEFAULT 'clan'`);
            logger.info('✅ Колонка source добавлена в punishments');
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                logger.warn(`⚠️ Не удалось добавить source: ${err.message}`);
            }
        }

        logger.success('💾 База данных готова');
        return db;
    } catch (error) {
        logger.error('❌ Ошибка инициализации БД:', error);
        throw error;
    }
}

function getDb() {
    if (!db) throw new Error('База данных не инициализирована');
    return db;
}

// ============================================
// ОСНОВНЫЕ МЕТОДЫ
// ============================================

async function all(sql, params = []) {
    return await db.all(sql, params);
}

async function get(sql, params = []) {
    return await db.get(sql, params);
}

async function run(sql, params = []) {
    return await db.run(sql, params);
}

// ============================================
// УЧАСТНИКИ КЛАНА (регистронезависимые)
// ============================================

async function addClanMember(nick, invitedBy = null) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    const cleanInvitedBy = invitedBy ? invitedBy.toLowerCase() : null;
    
    const existing = await db.get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (existing) return false;
    
    await db.run(
        `INSERT INTO clan_members (minecraft_nick, invited_by, rank_name, rank_priority)
         VALUES (?, ?, 'Новичок', 0)`,
        [cleanNick, cleanInvitedBy]
    );
    await db.run(`INSERT OR IGNORE INTO rp_players (minecraft_nick) VALUES (?)`, [cleanNick]);
    logger.info(`➕ Игрок ${cleanNick} добавлен в клан`);
    return true;
}

async function removeClanMember(nick) {
    const cleanNick = nick.toLowerCase();
    await run('DELETE FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    logger.info(`➖ Игрок ${cleanNick} удалён из клана`);
    return true;
}

async function getClanMember(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    return await db.get('SELECT rowid, * FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

async function getAllClanMembers() {
    const db = getDb();
    return await db.all('SELECT minecraft_nick FROM clan_members');
}

async function updateClanMemberRank(nick, rankName, priority) {
    const cleanNick = nick.toLowerCase();
    await run('UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [rankName, priority, cleanNick]);
}

async function updateLastSeen(nick) {
    const cleanNick = nick.toLowerCase();
    await run('UPDATE clan_members SET last_seen = CURRENT_TIMESTAMP WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

// ============================================
// СТАТИСТИКА
// ============================================

async function addKill(killer, victim) {
    const cleanKiller = killer.toLowerCase();
    const cleanVictim = victim.toLowerCase();
    
    const killerInClan = await get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanKiller]);
    const victimInClan = await get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanVictim]);
    
    await run(
        `INSERT INTO pvp_stats (killer, victim, killer_was_in_clan, victim_was_in_clan)
         VALUES (?, ?, ?, ?)`,
        [cleanKiller, cleanVictim, killerInClan ? 1 : 0, victimInClan ? 1 : 0]
    );
    
    if (killerInClan) await run('UPDATE clan_members SET kills = kills + 1 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanKiller]);
    if (victimInClan) await run('UPDATE clan_members SET deaths = deaths + 1 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanVictim]);
    
    return { killerInClan: !!killerInClan, victimInClan: !!victimInClan };
}

async function getPlayerStats(nick) {
    const cleanNick = nick.toLowerCase();
    return await get(
        `SELECT c.*, r.money, r.structure, r.job_rank, r.rp_points, r.warnings
         FROM clan_members c
         LEFT JOIN rp_players r ON c.minecraft_nick = r.minecraft_nick
         WHERE LOWER(c.minecraft_nick) = LOWER(?)`,
        [cleanNick]
    );
}

// ============================================
// ROLEPLAY (регистронезависимые)
// ============================================

async function registerRP(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    
    const existing = await db.get('SELECT minecraft_nick FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (existing) return false;
    
    await db.run(`INSERT INTO rp_players (minecraft_nick, money, structure, job_rank) VALUES (?, 1000, 'Гражданин', 'Нет')`, [cleanNick]);
    logger.info(`🎭 Игрок ${cleanNick} зарегистрирован в RolePlay`);
    return true;
}

async function getRPProfile(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    return await db.get('SELECT * FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

async function updateMoney(nick, amount, type, description, performedBy = 'system') {
    const cleanNick = nick.toLowerCase();
    const profile = await get('SELECT money FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (!profile) return false;
    
    const balanceBefore = profile.money;
    const balanceAfter = balanceBefore + amount;
    if (balanceAfter < 0) return false;
    
    await run('UPDATE rp_players SET money = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [balanceAfter, cleanNick]);
    await run(
        `INSERT INTO money_logs (player, amount, type, description, balance_before, balance_after, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cleanNick, amount, type, description, balanceBefore, balanceAfter, performedBy ? performedBy.toLowerCase() : 'system']
    );
    return true;
}

async function getBalance(nick) {
    const cleanNick = nick.toLowerCase();
    const profile = await get('SELECT money FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return profile ? profile.money : 0;
}

async function transferMoney(from, to, amount, description) {
    const cleanFrom = from.toLowerCase();
    const cleanTo = to.toLowerCase();
    
    await run('BEGIN TRANSACTION');
    try {
        const fromBalance = await getBalance(cleanFrom);
        if (fromBalance < amount) { await run('ROLLBACK'); return false; }
        await updateMoney(cleanFrom, -amount, 'transfer', `Перевод игроку ${cleanTo}: ${description}`, cleanFrom);
        await updateMoney(cleanTo, amount, 'transfer', `Получено от ${cleanFrom}: ${description}`, cleanFrom);
        await run('COMMIT');
        return true;
    } catch (error) {
        await run('ROLLBACK');
        throw error;
    }
}

// ============================================
// НАКАЗАНИЯ (регистронезависимые)
// ============================================

async function isRPFrozen(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    const player = await db.get(
        `SELECT is_frozen FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [cleanNick]
    );
    return player ? player.is_frozen === 1 : false;
}

async function addPunishment(player, type, reason, issuedBy, durationMinutes = null, source = 'clan') {
    const db = getDb();
    const playerLower = player.toLowerCase();
    const issuedByLower = issuedBy ? issuedBy.toLowerCase() : 'system';
    
    let expiresAt = null;
    if (durationMinutes && durationMinutes > 0) {
        expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
    }
    
    const result = await db.run(
        `INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at, active, source)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [playerLower, type, reason, issuedByLower, durationMinutes, expiresAt, source]
    );
    
    if (type === 'blacklist') {
        await db.run(
            `INSERT OR REPLACE INTO clan_blacklist (minecraft_nick, reason, issued_by, expires_at)
             VALUES (?, ?, ?, ?)`,
            [playerLower, reason, issuedByLower, expiresAt]
        );
    }
    
    return result.lastID;
}

async function removePunishment(player, type, liftedBy, liftReason) {
    const db = getDb();
    const playerLower = player.toLowerCase();
    const liftedByLower = liftedBy ? liftedBy.toLowerCase() : 'system';
    
    await db.run(
        `UPDATE punishments SET active = 0, lifted_by = ?, lifted_at = CURRENT_TIMESTAMP, lift_reason = ?
         WHERE LOWER(player) = LOWER(?) AND type = ? AND active = 1`,
        [liftedByLower, liftReason, playerLower, type]
    );
    
    if (type === 'blacklist') {
        await db.run('UPDATE clan_blacklist SET is_active = 0 WHERE LOWER(minecraft_nick) = LOWER(?)', [playerLower]);
    }
    return true;
}

async function checkStaffLimit(nick, action) {
    const cleanNick = nick.toLowerCase();
    const staff = await getStaffRank(cleanNick);
    if (staff.rank_level < 1) return { allowed: false, reason: 'Вы не в персонале' };
    
    const limits = {
        1: { kicks: 2, mutes: 20, blacklists: 20 },
        2: { kicks: 5, mutes: 30, blacklists: 30 },
        3: { kicks: 10, mutes: 40, blacklists: 40 },
        4: { kicks: 25, mutes: 50, blacklists: 70 },
        5: { kicks: 9999, mutes: 9999, blacklists: 9999 },
        6: { kicks: 9999, mutes: 9999, blacklists: 9999 }
    };
    
    const limit = limits[staff.rank_level];
    if (!limit) return { allowed: true };
    
    let current = 0;
    if (action === 'kick') current = staff.kicks_today || 0;
    else if (action === 'mute') current = staff.mutes_today || 0;
    else if (action === 'blacklist') current = staff.bl_today || 0;
    
    const max = limit[action === 'blacklist' ? 'blacklists' : action + 's'];
    
    return { allowed: current < max, current, max };
}

async function incrementStaffCounter(nick, action) {
    const cleanNick = nick.toLowerCase();
    const field = action === 'kick' ? 'kicks_today' : (action === 'mute' ? 'mutes_today' : 'bl_today');
    await run(`UPDATE staff_stats SET ${field} = ${field} + 1 WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanNick]);
}

async function isMuted(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase();
    const mute = await db.get(
        `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND active = 1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [cleanNick]
    );
    return mute || null;
}

async function getActivePunishmentsBySource(player, source = null) {
    const cleanPlayer = player.toLowerCase();
    let sql = `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND active = 1 
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
    const params = [cleanPlayer];
    if (source) {
        sql += ` AND source = ?`;
        params.push(source);
    }
    return await all(sql, params);
}

// ============================================
// ПЕРСОНАЛ (регистронезависимый)
// ============================================

async function getStaffRank(nick) {
    const cleanNick = nick.toLowerCase();
    const row = await get('SELECT rank_level, rank_name FROM staff_stats WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return row || { rank_level: 0, rank_name: null };
}

async function setStaffRank(nick, rankLevel, rankName, hiredBy = null) {
    const cleanNick = nick.toLowerCase();
    const cleanHiredBy = hiredBy ? hiredBy.toLowerCase() : null;
    
    const existing = await get('SELECT * FROM staff_stats WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    
    if (existing) {
        await run(`UPDATE staff_stats SET rank_level = ?, rank_name = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(minecraft_nick) = LOWER(?)`, 
            [rankLevel, rankName, cleanNick]);
    } else {
        await run(`INSERT INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by, hired_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [cleanNick, rankLevel, rankName, cleanHiredBy]);
    }
    return true;
}

// ============================================
// ЛОГИ ЧАТА
// ============================================

async function logClanChat(player, message, isCommand = false) {
    const cleanPlayer = player.toLowerCase();
    await run(
        `INSERT INTO clan_chat_logs (player, message, is_command, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [cleanPlayer, message, isCommand ? 1 : 0]
    );
}

async function logPrivateMessage(from, to, message) {
    const cleanFrom = from.toLowerCase();
    const cleanTo = to.toLowerCase();
    await run(
        `INSERT INTO private_messages_logs (from_player, to_player, message, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [cleanFrom, cleanTo, message]
    );
}

// ============================================
// DISCORD ВЕРИФИКАЦИЯ
// ============================================

async function ensureIdColumn() {
    try {
        const tableInfo = await db.all(`PRAGMA table_info(clan_members)`);
        const hasIdColumn = tableInfo.some(col => col.name === 'id');
        
        if (!hasIdColumn) {
            await db.exec(`ALTER TABLE clan_members ADD COLUMN id INTEGER`);
            await db.exec(`UPDATE clan_members SET id = rowid`);
            logger.info('✅ Колонка id добавлена в clan_members');
        }
    } catch (err) {
        logger.warn(`⚠️ Ошибка при добавлении id: ${err.message}`);
    }
}

async function generateVerificationCode(minecraftNick, discordId, discordUsername) {
    const cleanNick = minecraftNick.toLowerCase();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    
    await run(
        `INSERT INTO verification_codes (code, minecraft_nick, discord_id, discord_username, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, cleanNick, discordId, discordUsername, expiresAt]
    );
    return code;
}

async function verifyCode(code, minecraftNick) {
    const cleanNick = minecraftNick.toLowerCase();
    const record = await get(
        `SELECT * FROM verification_codes WHERE code = ? AND LOWER(minecraft_nick) = LOWER(?) AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [code, cleanNick]
    );
    if (!record) return { success: false, reason: 'Неверный или просроченный код' };
    
    await run('UPDATE verification_codes SET is_active = 0, verified_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
    await run(`INSERT OR REPLACE INTO linked_accounts (minecraft_nick, discord_id, is_verified) VALUES (?, ?, 1)`, [cleanNick, record.discord_id]);
    await run(`UPDATE clan_members SET is_discord_linked = 1, discord_id = ?, discord_username = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [record.discord_id, record.discord_username, cleanNick]);
    
    return { success: true, discordId: record.discord_id };
}

async function getDiscordId(minecraftNick) {
    const cleanNick = minecraftNick.toLowerCase();
    const linked = await get('SELECT discord_id FROM linked_accounts WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return linked ? linked.discord_id : null;
}

// ============================================
// ОРГАНИЗАЦИИ (регистронезависимые)
// ============================================

async function getOrganization(name) {
    return await get('SELECT * FROM organizations WHERE LOWER(name) = LOWER(?)', [name]);
}

async function getAllOrganizations() {
    return await all('SELECT * FROM organizations');
}

async function getOrgMembers(orgName) {
    return await all(`SELECT om.*, rp.money FROM org_members om LEFT JOIN rp_players rp ON om.minecraft_nick = rp.minecraft_nick WHERE LOWER(om.org_name) = LOWER(?)`, [orgName]);
}

async function addOrgMember(nick, orgName, rankName) {
    const cleanNick = nick.toLowerCase();
    const cleanOrgName = orgName.toLowerCase();
    
    const existing = await get('SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [cleanNick, cleanOrgName]);
    if (existing) {
        await run('UPDATE org_members SET rank_name = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [rankName, cleanNick, cleanOrgName]);
    } else {
        await run(`INSERT INTO org_members (minecraft_nick, org_name, rank_name) VALUES (?, ?, ?)`, [cleanNick, cleanOrgName, rankName]);
    }
    await run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanOrgName, rankName, cleanNick]);
    return true;
}

async function removeOrgMember(nick, orgName) {
    const cleanNick = nick.toLowerCase();
    const cleanOrgName = orgName.toLowerCase();
    await run('DELETE FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [cleanNick, cleanOrgName]);
    const other = await get('SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (!other) await run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE LOWER(minecraft_nick) = LOWER(?)', ['Гражданин', 'Нет', cleanNick]);
    return true;
}

async function setDuty(nick, orgName, onDuty) {
    const cleanNick = nick.toLowerCase();
    const cleanOrgName = orgName ? orgName.toLowerCase() : null;
    const now = new Date().toISOString();
    
    if (onDuty) {
        if (cleanOrgName) {
            await run(`UPDATE org_members SET on_duty = 1, duty_start_time = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)`, [now, cleanNick, cleanOrgName]);
        }
        await run('UPDATE rp_players SET on_duty = 1, duty_start_time = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [now, cleanNick]);
    } else {
        if (cleanOrgName) {
            await run(`UPDATE org_members SET on_duty = 0 WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)`, [cleanNick, cleanOrgName]);
        }
        await run('UPDATE rp_players SET on_duty = 0 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    }
    return true;
}

// ============================================
// ИМУЩЕСТВО (регистронезависимое)
// ============================================

async function getProperty(id) {
    return await get('SELECT * FROM property WHERE id = ?', [id]);
}

async function getAllAvailableProperties() {
    return await all('SELECT * FROM property WHERE is_available = 1');
}

async function getPlayerProperties(nick) {
    const cleanNick = nick.toLowerCase();
    return await all('SELECT * FROM property WHERE LOWER(owner_nick) = LOWER(?)', [cleanNick]);
}

async function buyProperty(id, buyer) {
    const cleanBuyer = buyer.toLowerCase();
    const prop = await get('SELECT * FROM property WHERE id = ?', [id]);
    if (!prop || !prop.is_available) return { success: false, reason: 'Недоступно' };
    const balance = await getBalance(cleanBuyer);
    if (balance < prop.price) return { success: false, reason: 'Недостаточно средств' };
    
    await run('BEGIN TRANSACTION');
    try {
        await updateMoney(cleanBuyer, -prop.price, 'property_buy', `Покупка имущества ${id}`, 'system');
        await run(`UPDATE property SET owner_nick = ?, is_available = 0, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?`, [cleanBuyer, id]);
        await run(`INSERT INTO property_history (property_id, owner_nick, action, amount, performed_by) VALUES (?, ?, 'buy', ?, 'system')`, [id, cleanBuyer, prop.price]);
        await run('COMMIT');
        return { success: true };
    } catch (e) {
        await run('ROLLBACK');
        throw e;
    }
}

async function addPropertyResident(id, owner, resident) {
    const cleanOwner = owner.toLowerCase();
    const cleanResident = resident.toLowerCase();
    const prop = await get('SELECT * FROM property WHERE id = ?', [id]);
    if (!prop || prop.owner_nick !== cleanOwner) return { success: false, reason: 'Не владелец' };
    if (prop.type !== 'apartment' && prop.type !== 'house') return { success: false, reason: 'Только квартиры/дома' };
    const rp = await getRPProfile(cleanResident);
    if (!rp) return { success: false, reason: 'Нет RP' };
    const clan = await getClanMember(cleanResident);
    if (!clan) return { success: false, reason: 'Не в клане' };
    await run(`INSERT OR REPLACE INTO property_residents (property_id, resident_nick, added_by, is_active) VALUES (?, ?, ?, 1)`, [id, cleanResident, cleanOwner]);
    return { success: true };
}

// ============================================
// НАСТРОЙКИ
// ============================================

async function isBlacklisted(nick) {
    const db = getDb();
    const cleanNick = nick.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
    
    const result = await db.get(
        `SELECT * FROM clan_blacklist 
         WHERE LOWER(minecraft_nick) = LOWER(?) 
         AND is_active = 1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [cleanNick]
    );
    
    return !!result;
}

async function getSetting(key) {
    const setting = await get('SELECT value FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : null;
}

async function setSetting(key, value, updatedBy = 'system') {
    const cleanUpdatedBy = updatedBy.toLowerCase();
    await run(`INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)`, [key, value, cleanUpdatedBy]);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    // Инициализация
    ensureIdColumn,
    initialize,
    getDb,
    all,
    get,
    run,
    
    // Участники клана
    addClanMember,
    removeClanMember,
    getClanMember,
    getAllClanMembers,
    updateClanMemberRank,
    updateLastSeen,
    
    // Статистика
    addKill,
    getPlayerStats,
    
    // RolePlay
    registerRP,
    getRPProfile,
    updateMoney,
    getBalance,
    transferMoney,
    isRPFrozen,
    
    // Организации
    getOrganization,
    getAllOrganizations,
    getOrgMembers,
    addOrgMember,
    removeOrgMember,
    setDuty,
    
    // Персонал
    getStaffRank,
    setStaffRank,
    
    // Наказания
    addPunishment,
    removePunishment,
    isMuted,
    getActivePunishmentsBySource,
    checkStaffLimit,
    incrementStaffCounter,
    
    // Имущество
    getProperty,
    getAllAvailableProperties,
    getPlayerProperties,
    buyProperty,
    addPropertyResident,
    
    // Discord верификация
    generateVerificationCode,
    verifyCode,
    getDiscordId,
    
    // Настройки
    getSetting,
    setSetting,
    isBlacklisted,
    
    // Логи
    logClanChat,
    logPrivateMessage,
    
    // Вспомогательные
    createTablesProgrammatically: async () => {}
};