// src/database/index.js — Модуль базы данных Resistance City
// Полная реализация всех методов для всех таблиц

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { logger } = require('../shared/logger');

// ==================== ИНИЦИАЛИЗАЦИЯ ПОДКЛЮЧЕНИЯ ====================
const dbPath = config.dbPath || path.join(__dirname, '..', '..', 'data', 'hohols.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`Создана папка для БД: ${dbDir}`);
}

const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(`SQL: ${msg}`) : null,
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000');
db.pragma('busy_timeout = 10000');
db.pragma('synchronous = NORMAL');

// ==================== ИНИЦИАЛИЗАЦИЯ СХЕМЫ ====================
function initDatabase() {
    try {
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            db.exec(schema);
            logger.success('База данных успешно инициализирована из schema.sql');
        } else {
            logger.warn('schema.sql не найден, запуск аварийного создания таблиц...');
            createEmergencyTables();
        }
    } catch (error) {
        logger.error(`КРИТИЧЕСКАЯ ошибка инициализации БД: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

function createEmergencyTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            username_lower TEXT NOT NULL UNIQUE,
            rank TEXT,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_in_clan INTEGER DEFAULT 1,
            discord_id TEXT,
            discord_verified INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS rp_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            username_lower TEXT NOT NULL UNIQUE,
            balance REAL DEFAULT 0.0,
            bank_balance REAL DEFAULT 0.0,
            organization TEXT,
            rank TEXT,
            is_active INTEGER DEFAULT 1,
            is_in_city INTEGER DEFAULT 1,
            is_in_jail INTEGER DEFAULT 0,
            is_sick INTEGER DEFAULT 0,
            is_frozen INTEGER DEFAULT 0,
            points REAL DEFAULT 0.0
        );
        CREATE TABLE IF NOT EXISTS balance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            balance_before REAL,
            balance_after REAL,
            reason TEXT,
            issuer TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS punishment_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            type TEXT NOT NULL,
            duration_minutes INTEGER,
            reason TEXT,
            issued_by TEXT NOT NULL,
            issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            is_active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            username_lower TEXT NOT NULL UNIQUE,
            rank TEXT NOT NULL,
            warns INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id TEXT NOT NULL,
            property_type TEXT NOT NULL,
            owner TEXT,
            owner_lower TEXT,
            price REAL,
            is_owned INTEGER DEFAULT 0,
            region_name TEXT
        );
        CREATE TABLE IF NOT EXISTS gangs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            name_lower TEXT NOT NULL UNIQUE,
            leader TEXT NOT NULL,
            leader_lower TEXT NOT NULL,
            balance REAL DEFAULT 0.0,
            materials INTEGER DEFAULT 0,
            is_frozen INTEGER DEFAULT 0
        );
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_mod_enabled', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('payday_enabled', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('virus_enabled', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('global_freeze', 'false');
    `);
    logger.warn('Аварийные таблицы созданы. Рекомендуется проверить schema.sql.');
}

// ==================== УТИЛИТЫ НИЗКОГО УРОВНЯ ====================

function get(sql, params = []) {
    try {
        return db.prepare(sql).get(params);
    } catch (error) {
        logger.error(`DB get error: ${error.message} | SQL: ${sql.substring(0, 100)}`);
        return null;
    }
}

function all(sql, params = []) {
    try {
        return db.prepare(sql).all(params);
    } catch (error) {
        logger.error(`DB all error: ${error.message} | SQL: ${sql.substring(0, 100)}`);
        return [];
    }
}

function run(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        const result = stmt.run(params);
        return { success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (error) {
        logger.error(`DB run error: ${error.message} | SQL: ${sql.substring(0, 100)}`);
        return { success: false, changes: 0, lastInsertRowid: null, error: error.message };
    }
}

function transaction(fn) {
    try {
        const txn = db.transaction(fn);
        return txn();
    } catch (error) {
        logger.error(`DB transaction error: ${error.message}`);
        throw error;
    }
}

function prepare(sql) {
    return db.prepare(sql);
}

function exec(sql) {
    try {
        db.exec(sql);
        return true;
    } catch (error) {
        logger.error(`DB exec error: ${error.message}`);
        return false;
    }
}

// ==================== ТАБЛИЦА: members ====================

const members = {
    add(username, addedBy = null) {
        const uLower = username.toLowerCase();
        const existing = get('SELECT * FROM members WHERE username_lower = ?', [uLower]);
        if (existing) {
            run('UPDATE members SET is_in_clan = 1, joined_at = CURRENT_TIMESTAMP WHERE username_lower = ?', [uLower]);
            return existing;
        }
        const result = run(
            'INSERT INTO members (username, username_lower, added_by) VALUES (?, ?, ?)',
            [username, uLower, addedBy]
        );
        if (result.success) {
            return get('SELECT * FROM members WHERE id = ?', [result.lastInsertRowid]);
        }
        return null;
    },

    get(username) {
        return get('SELECT * FROM members WHERE username_lower = ?', [username.toLowerCase()]);
    },

    getById(id) {
        return get('SELECT * FROM members WHERE id = ?', [id]);
    },

    getAll() {
        return all('SELECT * FROM members WHERE is_in_clan = 1 ORDER BY username_lower ASC');
    },

    updateRank(username, rank) {
        return run('UPDATE members SET rank = ?, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [rank, username.toLowerCase()]);
    },

    updateStats(username, kills, deaths) {
        return run(
            'UPDATE members SET kills = kills + ?, deaths = deaths + ?, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [kills, deaths, username.toLowerCase()]
        );
    },

    setDiscordId(username, discordId) {
        return run('UPDATE members SET discord_id = ?, discord_verified = 1, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [discordId, username.toLowerCase()]);
    },

    removeFromClan(username) {
        return run('UPDATE members SET is_in_clan = 0, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [username.toLowerCase()]);
    },

    addHours(username, hours) {
        return run(
            'UPDATE members SET hours_in_clan = hours_in_clan + ?, last_hours_update = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [hours, username.toLowerCase()]
        );
    },

    count() {
        const row = get('SELECT COUNT(*) as count FROM members WHERE is_in_clan = 1');
        return row ? row.count : 0;
    },
};

// ==================== ТАБЛИЦА: rp_members ====================

const rpMembers = {
    add(username) {
        const uLower = username.toLowerCase();
        const existing = get('SELECT * FROM rp_members WHERE username_lower = ?', [uLower]);
        if (existing) {
            run('UPDATE rp_members SET is_active = 1, is_in_city = 1, rp_joined_at = CURRENT_TIMESTAMP WHERE username_lower = ?', [uLower]);
            return get('SELECT * FROM rp_members WHERE username_lower = ?', [uLower]);
        }
        const result = run(
            'INSERT INTO rp_members (username, username_lower) VALUES (?, ?)',
            [username, uLower]
        );
        if (result.success) {
            return get('SELECT * FROM rp_members WHERE id = ?', [result.lastInsertRowid]);
        }
        return null;
    },

    get(username) {
        return get('SELECT * FROM rp_members WHERE username_lower = ?', [username.toLowerCase()]);
    },

    getAll() {
        return all('SELECT * FROM rp_members WHERE is_active = 1 ORDER BY username_lower ASC');
    },

    updateBalance(username, amount, type, reason = '', issuer = '') {
        const uLower = username.toLowerCase();
        const member = get('SELECT * FROM rp_members WHERE username_lower = ?', [uLower]);
        if (!member) {
            logger.warn(`RP member not found: ${username}`);
            return { success: false, reason: 'member_not_found' };
        }

        const balanceBefore = member.balance;
        const balanceAfter = balanceBefore + amount;

        if (balanceAfter < 0) {
            logger.warn(`Insufficient funds for ${username}: ${balanceBefore} < ${Math.abs(amount)}`);
            return { success: false, reason: 'insufficient_funds', balanceBefore, balanceAfter: balanceBefore };
        }

        const finalBalance = Math.round(balanceAfter * 100) / 100;

        run('UPDATE rp_members SET balance = ? WHERE username_lower = ?', [finalBalance, uLower]);

        run(
            `INSERT INTO balance_logs (username, username_lower, type, amount, balance_before, balance_after, source, reason, issuer)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [member.username, uLower, type, amount, balanceBefore, finalBalance, type, reason, issuer]
        );

        return { success: true, balanceBefore, balanceAfter: finalBalance };
    },

    updateBankBalance(username, amount, type, reason = '') {
        const uLower = username.toLowerCase();
        const member = get('SELECT * FROM rp_members WHERE username_lower = ?', [uLower]);
        if (!member) return { success: false, reason: 'member_not_found' };

        const balanceBefore = member.bank_balance;
        const balanceAfter = Math.max(0, balanceBefore + amount);
        const finalBalance = Math.round(balanceAfter * 100) / 100;

        run('UPDATE rp_members SET bank_balance = ? WHERE username_lower = ?', [finalBalance, uLower]);
        run(
            `INSERT INTO bank_transactions (username, username_lower, type, amount, balance_before, balance_after, description)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [member.username, uLower, type, amount, balanceBefore, finalBalance, reason]
        );

        return { success: true, balanceBefore, balanceAfter: finalBalance };
    },

    setOrganization(username, organization, rank = null) {
        const uLower = username.toLowerCase();
        return run(
            'UPDATE rp_members SET organization = ?, rank = ? WHERE username_lower = ?',
            [organization, rank, uLower]
        );
    },

    setJail(username, durationMinutes, jailedBy, reason = '') {
        const uLower = username.toLowerCase();
        const jailEnd = new Date(Date.now() + durationMinutes * 60000).toISOString();
        run('UPDATE rp_members SET is_in_jail = 1, jail_until = ? WHERE username_lower = ?', [jailEnd, uLower]);
        run(
            `INSERT INTO jail_records (username, username_lower, jailed_by, jailed_by_lower, reason, duration_minutes, jail_start, jail_end)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
            [username, uLower, jailedBy, jailedBy.toLowerCase(), reason, durationMinutes, jailEnd]
        );
        return { success: true, jailEnd };
    },

    releaseFromJail(username) {
        const uLower = username.toLowerCase();
        run('UPDATE rp_members SET is_in_jail = 0, jail_until = NULL WHERE username_lower = ?', [uLower]);
        run('UPDATE jail_records SET is_active = 0 WHERE username_lower = ? AND is_active = 1', [uLower]);
        return { success: true };
    },

    setSick(username, diseaseType, durationHours) {
        const uLower = username.toLowerCase();
        const sickUntil = new Date(Date.now() + durationHours * 3600000).toISOString();
        run('UPDATE rp_members SET is_sick = 1, sick_until = ? WHERE username_lower = ?', [sickUntil, uLower]);
        run(
            'INSERT INTO diseases (username, username_lower, disease_type, expires_at) VALUES (?, ?, ?, ?)',
            [username, uLower, diseaseType, sickUntil]
        );
        return { success: true, sickUntil };
    },

    healFromSick(username, treatmentType = '') {
        const uLower = username.toLowerCase();
        run('UPDATE rp_members SET is_sick = 0, sick_until = NULL WHERE username_lower = ?', [uLower]);
        run(
            'UPDATE diseases SET is_active = 0, treatment_type = ? WHERE username_lower = ? AND is_active = 1',
            [treatmentType, uLower]
        );
        return { success: true };
    },

    setCityStatus(username, isInCity) {
        return run('UPDATE rp_members SET is_in_city = ? WHERE username_lower = ?',
            [isInCity ? 1 : 0, username.toLowerCase()]);
    },

    setFrozen(username, isFrozen, reason = '') {
        return run('UPDATE rp_members SET is_frozen = ?, frozen_reason = ? WHERE username_lower = ?',
            [isFrozen ? 1 : 0, isFrozen ? reason : '', username.toLowerCase()]);
    },

    addPoints(username, points) {
        return run('UPDATE rp_members SET points = MAX(0, points + ?) WHERE username_lower = ?',
            [points, username.toLowerCase()]);
    },

    addWarn(username) {
        return run(
            'UPDATE rp_members SET warns = warns + 1, last_warn_at = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [username.toLowerCase()]
        );
    },

    removeRp(username) {
        return run('UPDATE rp_members SET is_active = 0 WHERE username_lower = ?', [username.toLowerCase()]);
    },

    count() {
        const row = get('SELECT COUNT(*) as count FROM rp_members WHERE is_active = 1');
        return row ? row.count : 0;
    },

    countOnline() {
        const row = get('SELECT COUNT(*) as count FROM rp_members WHERE is_active = 1 AND is_in_city = 1');
        return row ? row.count : 0;
    },
};

// ==================== ТАБЛИЦА: staff ====================

const staff = {
    get(username) {
        return get('SELECT * FROM staff WHERE username_lower = ?', [username.toLowerCase()]);
    },

    getAll() {
        return all('SELECT * FROM staff WHERE is_active = 1 ORDER BY id ASC');
    },

    add(username, rank) {
        const uLower = username.toLowerCase();
        const existing = get('SELECT * FROM staff WHERE username_lower = ?', [uLower]);
        if (existing) {
            return run('UPDATE staff SET rank = ?, is_active = 1, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?', [rank, uLower]);
        }
        return run(
            'INSERT INTO staff (username, username_lower, rank, promoted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [username, uLower, rank]
        );
    },

    remove(username) {
        return run('UPDATE staff SET is_active = 0, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [username.toLowerCase()]);
    },

    addWarn(username, reason, issuedBy) {
        run('UPDATE staff SET warns = warns + 1, last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [username.toLowerCase()]);
        run(
            'INSERT INTO staff_warns (username, username_lower, reason, issued_by, issued_by_lower) VALUES (?, ?, ?, ?, ?)',
            [username, username.toLowerCase(), reason, issuedBy, issuedBy.toLowerCase()]
        );
        const staffMember = get('SELECT * FROM staff WHERE username_lower = ?', [username.toLowerCase()]);
        return staffMember ? staffMember.warns : 0;
    },

    removeWarn(username, reason, issuedBy) {
        run('UPDATE staff SET warns = MAX(0, warns - 1), last_updated = CURRENT_TIMESTAMP WHERE username_lower = ?',
            [username.toLowerCase()]);
        run(
            'UPDATE staff_warns SET is_active = 0 WHERE username_lower = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
            [username.toLowerCase()]
        );
        return { success: true };
    },

    resetDailyLimits() {
        return run(
            'UPDATE staff SET kicks_today = 0, mutes_today = 0, blacklists_today = 0, last_reset_at = CURRENT_TIMESTAMP'
        );
    },

    incrementKicks(username) {
        return run('UPDATE staff SET kicks_today = kicks_today + 1 WHERE username_lower = ?', [username.toLowerCase()]);
    },

    incrementMutes(username) {
        return run('UPDATE staff SET mutes_today = mutes_today + 1 WHERE username_lower = ?', [username.toLowerCase()]);
    },

    incrementBlacklists(username) {
        return run('UPDATE staff SET blacklists_today = blacklists_today + 1 WHERE username_lower = ?', [username.toLowerCase()]);
    },

    getWarns(username) {
        return all('SELECT * FROM staff_warns WHERE username_lower = ? AND is_active = 1', [username.toLowerCase()]);
    },
};

// ==================== ТАБЛИЦА: punishment_logs ====================

const punishments = {
    add(username, type, durationMinutes, reason, issuedBy) {
        const uLower = username.toLowerCase();
        const expiresAt = durationMinutes
            ? new Date(Date.now() + durationMinutes * 60000).toISOString()
            : null;
        return run(
            `INSERT INTO punishment_logs (username, username_lower, type, duration_minutes, reason, issued_by, issued_by_lower, issued_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
            [username, uLower, type, durationMinutes, reason, issuedBy, issuedBy.toLowerCase(), expiresAt]
        );
    },

    getActive(username) {
        return all(
            `SELECT * FROM punishment_logs
             WHERE username_lower = ? AND is_active = 1
             AND (expires_at IS NULL OR expires_at > datetime('now'))
             ORDER BY issued_at DESC`,
            [username.toLowerCase()]
        );
    },

    getAllActive() {
        return all(
            `SELECT * FROM punishment_logs
             WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
             ORDER BY issued_at DESC`
        );
    },

    remove(id, removedBy = null) {
        return run(
            'UPDATE punishment_logs SET is_active = 0, removed_at = CURRENT_TIMESTAMP, removed_by = ? WHERE id = ?',
            [removedBy, id]
        );
    },

    removeAllExpired() {
        return run(
            `UPDATE punishment_logs SET is_active = 0, removed_at = CURRENT_TIMESTAMP
             WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')`
        );
    },

    getByUsername(username, limit = 50) {
        return all(
            'SELECT * FROM punishment_logs WHERE username_lower = ? ORDER BY issued_at DESC LIMIT ?',
            [username.toLowerCase(), limit]
        );
    },

    getLogs(page = 1, perPage = 20) {
        const offset = (page - 1) * perPage;
        return all('SELECT * FROM punishment_logs ORDER BY issued_at DESC LIMIT ? OFFSET ?', [perPage, offset]);
    },
};

// ==================== ТАБЛИЦА: settings ====================

const settings = {
    get(key) {
        const row = get('SELECT value FROM settings WHERE key = ?', [key]);
        return row ? row.value : null;
    },

    getBoolean(key) {
        const value = settings.get(key);
        return value === 'true' || value === '1';
    },

    getNumber(key) {
        const value = settings.get(key);
        return value !== null ? parseFloat(value) : null;
    },

    set(key, value) {
        return run(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [key, String(value)]
        );
    },

    getAll() {
        return all('SELECT * FROM settings ORDER BY key ASC');
    },
};

// ==================== ТАБЛИЦА: properties ====================

const properties = {
    get(propertyId) {
        return get('SELECT * FROM properties WHERE property_id = ?', [String(propertyId)]);
    },

    getAll() {
        return all('SELECT * FROM properties ORDER BY CAST(property_id AS REAL) ASC');
    },

    getOwned(username) {
        return all(
            `SELECT * FROM properties
             WHERE (owner_lower = ? OR co_owner_1_lower = ? OR co_owner_2_lower = ?) AND is_owned = 1`,
            [username.toLowerCase(), username.toLowerCase(), username.toLowerCase()]
        );
    },

    buy(propertyId, username, price, propertyType) {
        const regionName = `${config.clan.regionPrefix}${propertyId}`;
        return run(
            `INSERT OR REPLACE INTO properties
             (property_id, property_type, owner, owner_lower, price, purchased_at, is_owned, region_name)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?)`,
            [String(propertyId), propertyType, username, username.toLowerCase(), price, regionName]
        );
    },

    remove(propertyId) {
        return run(
            'UPDATE properties SET is_owned = 0, owner = NULL, owner_lower = NULL, purchased_at = NULL, granted_by = NULL WHERE property_id = ?',
            [String(propertyId)]
        );
    },

    addCoOwner(propertyId, username) {
        const prop = properties.get(propertyId);
        if (!prop) return { success: false, reason: 'property_not_found' };
        if (prop.owner_lower === username.toLowerCase()) return { success: false, reason: 'is_owner' };

        if (!prop.co_owner_1) {
            run('UPDATE properties SET co_owner_1 = ?, co_owner_1_lower = ? WHERE property_id = ?',
                [username, username.toLowerCase(), String(propertyId)]);
            return { success: true, slot: 1 };
        }
        if (!prop.co_owner_2) {
            run('UPDATE properties SET co_owner_2 = ?, co_owner_2_lower = ? WHERE property_id = ?',
                [username, username.toLowerCase(), String(propertyId)]);
            return { success: true, slot: 2 };
        }
        return { success: false, reason: 'no_free_slots' };
    },

    removeCoOwner(propertyId, username) {
        const prop = properties.get(propertyId);
        if (!prop) return { success: false, reason: 'property_not_found' };

        if (prop.co_owner_1_lower === username.toLowerCase()) {
            run('UPDATE properties SET co_owner_1 = NULL, co_owner_1_lower = NULL WHERE property_id = ?', [String(propertyId)]);
            return { success: true, slot: 1 };
        }
        if (prop.co_owner_2_lower === username.toLowerCase()) {
            run('UPDATE properties SET co_owner_2 = NULL, co_owner_2_lower = NULL WHERE property_id = ?', [String(propertyId)]);
            return { success: true, slot: 2 };
        }
        return { success: false, reason: 'not_co_owner' };
    },

    setTaxPaid(propertyId, date) {
        return run('UPDATE properties SET tax_paid_until = ? WHERE property_id = ?', [date, String(propertyId)]);
    },

    grant(propertyId, username, grantedBy) {
        const prop = properties.get(propertyId);
        if (!prop) return { success: false, reason: 'property_not_found' };
        return run(
            'UPDATE properties SET owner = ?, owner_lower = ?, is_owned = 1, purchased_at = CURRENT_TIMESTAMP, granted_by = ? WHERE property_id = ?',
            [username, username.toLowerCase(), grantedBy, String(propertyId)]
        );
    },
};

// ==================== ТАБЛИЦА: gangs ====================

const gangs = {
    create(name, colorName, leader) {
        const nameLower = name.toLowerCase();
        const existing = get('SELECT * FROM gangs WHERE name_lower = ?', [nameLower]);
        if (existing) return { success: false, reason: 'gang_exists' };

        const result = run(
            'INSERT INTO gangs (name, name_lower, color_name, leader, leader_lower) VALUES (?, ?, ?, ?, ?)',
            [name, nameLower, colorName, leader, leader.toLowerCase()]
        );
        if (result.success) {
            const gang = get('SELECT * FROM gangs WHERE id = ?', [result.lastInsertRowid]);
            gangs.addMember(result.lastInsertRowid, leader, 'leader');
            return { success: true, gang };
        }
        return { success: false, reason: 'db_error' };
    },

    get(idOrName) {
        if (typeof idOrName === 'number' || /^\d+$/.test(String(idOrName))) {
            return get('SELECT * FROM gangs WHERE id = ?', [idOrName]);
        }
        return get('SELECT * FROM gangs WHERE name_lower = ?', [String(idOrName).toLowerCase()]);
    },

    getAll() {
        return all('SELECT * FROM gangs WHERE is_active = 1 ORDER BY name_lower ASC');
    },

    delete(id) {
        run('DELETE FROM gang_members WHERE gang_id = ?', [id]);
        return run('UPDATE gangs SET is_active = 0 WHERE id = ?', [id]);
    },

    freeze(id, reason = '') {
        return run('UPDATE gangs SET is_frozen = 1, frozen_reason = ? WHERE id = ?', [reason, id]);
    },

    unfreeze(id) {
        return run('UPDATE gangs SET is_frozen = 0, frozen_reason = NULL WHERE id = ?', [id]);
    },

    setLeader(id, newLeader) {
        run('UPDATE gang_members SET role = ? WHERE gang_id = ? AND role = ?', ['member', id, 'leader']);
        const existing = get('SELECT * FROM gang_members WHERE gang_id = ? AND username_lower = ?',
            [id, newLeader.toLowerCase()]);
        if (existing) {
            run('UPDATE gang_members SET role = ? WHERE gang_id = ? AND username_lower = ?',
                ['leader', id, newLeader.toLowerCase()]);
        } else {
            gangs.addMember(id, newLeader, 'leader');
        }
        return run('UPDATE gangs SET leader = ?, leader_lower = ? WHERE id = ?', [newLeader, newLeader.toLowerCase(), id]);
    },

    addMember(gangId, username, role = 'member') {
        const existing = get('SELECT * FROM gang_members WHERE gang_id = ? AND username_lower = ?',
            [gangId, username.toLowerCase()]);
        if (existing) {
            return run('UPDATE gang_members SET role = ? WHERE id = ?', [role, existing.id]);
        }
        return run(
            'INSERT INTO gang_members (gang_id, username, username_lower, role) VALUES (?, ?, ?, ?)',
            [gangId, username, username.toLowerCase(), role]
        );
    },

    removeMember(gangId, username) {
        return run('DELETE FROM gang_members WHERE gang_id = ? AND username_lower = ?',
            [gangId, username.toLowerCase()]);
    },

    getMembers(gangId) {
        return all('SELECT * FROM gang_members WHERE gang_id = ? ORDER BY role DESC, joined_at ASC', [gangId]);
    },

    getMemberGang(username) {
        return get(
            `SELECT g.*, gm.role FROM gangs g
             JOIN gang_members gm ON g.id = gm.gang_id
             WHERE gm.username_lower = ? AND g.is_active = 1`,
            [username.toLowerCase()]
        );
    },

    updateBalance(gangId, amount) {
        return run('UPDATE gangs SET balance = MAX(0, balance + ?) WHERE id = ?', [amount, gangId]);
    },

    updateMaterials(gangId, amount) {
        return run('UPDATE gangs SET materials = MAX(0, materials + ?) WHERE id = ?', [amount, gangId]);
    },

    addWarn(gangId) {
        return run('UPDATE gangs SET warns = warns + 1 WHERE id = ?', [gangId]);
    },

    getMemberCount(gangId) {
        const row = get('SELECT COUNT(*) as count FROM gang_members WHERE gang_id = ?', [gangId]);
        return row ? row.count : 0;
    },
};

// ==================== ТАБЛИЦА: robbery_parties ====================

const robberies = {
    createParty(creator) {
        const result = run(
            'INSERT INTO robbery_parties (creator, creator_lower) VALUES (?, ?)',
            [creator, creator.toLowerCase()]
        );
        if (result.success) {
            robberies.joinParty(result.lastInsertRowid, creator);
            return { success: true, partyId: result.lastInsertRowid };
        }
        return { success: false, reason: 'db_error' };
    },

    getActiveParty(partyId) {
        return get('SELECT * FROM robbery_parties WHERE id = ? AND is_active = 1', [partyId]);
    },

    getActiveParties() {
        return all('SELECT * FROM robbery_parties WHERE is_active = 1 ORDER BY created_at DESC');
    },

    joinParty(partyId, username) {
        const existing = get('SELECT * FROM robbery_party_members WHERE party_id = ? AND username_lower = ?',
            [partyId, username.toLowerCase()]);
        if (existing) return { success: false, reason: 'already_in_party' };
        return run(
            'INSERT INTO robbery_party_members (party_id, username, username_lower) VALUES (?, ?, ?)',
            [partyId, username, username.toLowerCase()]
        );
    },

    leaveParty(partyId, username) {
        return run('DELETE FROM robbery_party_members WHERE party_id = ? AND username_lower = ?',
            [partyId, username.toLowerCase()]);
    },

    getPartyMembers(partyId) {
        return all('SELECT * FROM robbery_party_members WHERE party_id = ?', [partyId]);
    },

    getMemberParty(username) {
        return get(
            `SELECT rp.* FROM robbery_parties rp
             JOIN robbery_party_members rpm ON rp.id = rpm.party_id
             WHERE rpm.username_lower = ? AND rp.is_active = 1`,
            [username.toLowerCase()]
        );
    },

    completeParty(partyId) {
        return run('UPDATE robbery_parties SET is_active = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [partyId]);
    },

    logRobbery(partyId, victim, amount, robbers) {
        return run(
            'INSERT INTO robbery_logs (party_id, victim, victim_lower, amount, robbers) VALUES (?, ?, ?, ?, ?)',
            [partyId, victim, victim.toLowerCase(), amount, robbers]
        );
    },

    getCooldown(username) {
        const row = get(
            `SELECT created_at FROM robbery_logs
             WHERE robbers LIKE ? ORDER BY created_at DESC LIMIT 1`,
            [`%${username.toLowerCase()}%`]
        );
        if (!row) return null;
        return new Date(row.created_at + 'Z');
    },

    getLogs(limit = 50) {
        return all('SELECT * FROM robbery_logs ORDER BY created_at DESC LIMIT ?', [limit]);
    },
};

// ==================== ТАБЛИЦА: army_supplies ====================

const armySupplies = {
    create(creator, partySize) {
        const result = run(
            'INSERT INTO army_supplies (creator, creator_lower, party_size) VALUES (?, ?, ?)',
            [creator, creator.toLowerCase(), partySize]
        );
        if (result.success) {
            armySupplies.addMember(result.lastInsertRowid, creator,
                armySupplies.determineRole(result.lastInsertRowid, creator));
            return { success: true, supplyId: result.lastInsertRowid };
        }
        return { success: false, reason: 'db_error' };
    },

    get(id) {
        return get('SELECT * FROM army_supplies WHERE id = ?', [id]);
    },

    getActive() {
        return all('SELECT * FROM army_supplies WHERE status != ? ORDER BY created_at DESC', ['completed']);
    },

    determineRole(supplyId, username) {
        const supply = armySupplies.get(supplyId);
        if (!supply) return 'defender';
        const members = armySupplies.getMembers(supplyId);
        const supplierCount = members.filter(m => m.role === 'supplier').length;
        const defenderCount = members.filter(m => m.role === 'defender').length;

        if (supply.creator_lower === username.toLowerCase()) {
            return supplierCount === 0 ? 'supplier' : 'defender';
        }
        return defenderCount <= supplierCount ? 'defender' : 'supplier';
    },

    addMember(supplyId, username, role) {
        const existing = get('SELECT * FROM army_supply_members WHERE supply_id = ? AND username_lower = ?',
            [supplyId, username.toLowerCase()]);
        if (existing) return { success: false, reason: 'already_in_supply' };
        return run(
            'INSERT INTO army_supply_members (supply_id, username, username_lower, role) VALUES (?, ?, ?, ?)',
            [supplyId, username, username.toLowerCase(), role]
        );
    },

    getMembers(supplyId) {
        return all('SELECT * FROM army_supply_members WHERE supply_id = ?', [supplyId]);
    },

    startSupply(supplyId, minArrivalTime) {
        return run(
            'UPDATE army_supplies SET status = ?, started_at = CURRENT_TIMESTAMP, min_arrival_time = ? WHERE id = ?',
            ['in_progress', minArrivalTime.toISOString(), supplyId]
        );
    },

    completeSupply(supplyId, isSuccessful, actualArrivalTime, stolenBy = null) {
        return run(
            `UPDATE army_supplies SET status = ?, actual_arrival_time = ?, is_successful = ?, stolen_by = ?, stolen_by_lower = ?
             WHERE id = ?`,
            ['completed', actualArrivalTime.toISOString(), isSuccessful ? 1 : 0, stolenBy,
                stolenBy ? stolenBy.toLowerCase() : null, supplyId]
        );
    },

    getMemberSupply(username) {
        return get(
            `SELECT asup.* FROM army_supplies asup
             JOIN army_supply_members asm ON asup.id = asm.supply_id
             WHERE asm.username_lower = ? AND asup.status != 'completed'`,
            [username.toLowerCase()]
        );
    },
};

// ==================== ТАБЛИЦА: fines ====================

const fines = {
    create(username, amount, reason, issuedBy) {
        const result = run(
            `INSERT INTO fines (username, username_lower, amount, reason, issued_by, issued_by_lower)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [username, username.toLowerCase(), amount, reason, issuedBy, issuedBy.toLowerCase()]
        );
        if (result.success) {
            return get('SELECT * FROM fines WHERE id = ?', [result.lastInsertRowid]);
        }
        return null;
    },

    get(id) {
        return get('SELECT * FROM fines WHERE id = ?', [id]);
    },

    getPending(username) {
        return all(
            "SELECT * FROM fines WHERE username_lower = ? AND status = 'pending' ORDER BY issued_at DESC",
            [username.toLowerCase()]
        );
    },

    respond(id, response) {
        if (response === 'yes') {
            return run(
                "UPDATE fines SET status = 'paid', response = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?",
                [response, id]
            );
        }
        return run(
            "UPDATE fines SET status = 'rejected', response = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?",
            [response, id]
        );
    },

    autoExpire(id) {
        return run(
            "UPDATE fines SET status = 'expired', responded_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
            [id]
        );
    },

    getAll(username = null) {
        if (username) {
            return all('SELECT * FROM fines WHERE username_lower = ? ORDER BY issued_at DESC', [username.toLowerCase()]);
        }
        return all('SELECT * FROM fines ORDER BY issued_at DESC LIMIT 100');
    },
};

// ==================== ТАБЛИЦА: verification_codes ====================

const verification = {
    createCode(discordId, username = null) {
        const { v4: uuidv4 } = require('uuid');
        const code = uuidv4().substring(0, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
        run(
            'INSERT INTO verification_codes (code, discord_id, username, username_lower, expires_at) VALUES (?, ?, ?, ?, ?)',
            [code, discordId, username, username ? username.toLowerCase() : null, expiresAt]
        );
        return code;
    },

    verify(code, username) {
        const row = get(
            "SELECT * FROM verification_codes WHERE code = ? AND is_active = 1 AND expires_at > datetime('now')",
            [code]
        );
        if (!row) return null;
        run(
            'UPDATE verification_codes SET is_active = 0, used_at = CURRENT_TIMESTAMP, username = ?, username_lower = ? WHERE id = ?',
            [username, username.toLowerCase(), row.id]
        );
        return row;
    },

    getByCode(code) {
        return get('SELECT * FROM verification_codes WHERE code = ?', [code]);
    },

    getByDiscordId(discordId) {
        return all('SELECT * FROM verification_codes WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10', [discordId]);
    },
};

// ==================== ТАБЛИЦА: licenses ====================

const licenses = {
    create(username, licenseType, durationDays, price) {
        const uLower = username.toLowerCase();
        const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
        return run(
            'INSERT INTO licenses (username, username_lower, license_type, expires_at, price) VALUES (?, ?, ?, ?, ?)',
            [username, uLower, licenseType, expiresAt, price]
        );
    },

    hasActive(username, licenseType) {
        const row = get(
            "SELECT * FROM licenses WHERE username_lower = ? AND license_type = ? AND is_active = 1 AND expires_at > datetime('now')",
            [username.toLowerCase(), licenseType]
        );
        return !!row;
    },

    getActive(username) {
        return all(
            "SELECT * FROM licenses WHERE username_lower = ? AND is_active = 1 AND expires_at > datetime('now')",
            [username.toLowerCase()]
        );
    },

    getExpiringSoon(daysThreshold = 2) {
        return all(
            `SELECT * FROM licenses
             WHERE is_active = 1
             AND expires_at > datetime('now')
             AND expires_at <= datetime('now', '+' || ? || ' days')`,
            [daysThreshold]
        );
    },
};

// ==================== ТАБЛИЦА: bank_accounts ====================

const bank = {
    openAccount(username) {
        const uLower = username.toLowerCase();
        const existing = get('SELECT * FROM bank_accounts WHERE username_lower = ?', [uLower]);
        if (existing) {
            run('UPDATE bank_accounts SET is_active = 1 WHERE username_lower = ?', [uLower]);
            return get('SELECT * FROM bank_accounts WHERE username_lower = ?', [uLower]);
        }
        const result = run('INSERT INTO bank_accounts (username, username_lower) VALUES (?, ?)', [username, uLower]);
        if (result.success) {
            return get('SELECT * FROM bank_accounts WHERE id = ?', [result.lastInsertRowid]);
        }
        return null;
    },

    getAccount(username) {
        return get('SELECT * FROM bank_accounts WHERE username_lower = ? AND is_active = 1',
            [username.toLowerCase()]);
    },

    deposit(username, amount) {
        return run(
            'UPDATE bank_accounts SET balance = balance + ?, deposit_amount = deposit_amount + ? WHERE username_lower = ? AND is_active = 1',
            [amount, amount, username.toLowerCase()]
        );
    },

    withdraw(username, amount) {
        return run(
            'UPDATE bank_accounts SET balance = MAX(0, balance - ?) WHERE username_lower = ? AND is_active = 1',
            [amount, username.toLowerCase()]
        );
    },

    takeCredit(username, amount) {
        const dueDate = new Date(Date.now() + config.bank.creditDurationDays * 86400000).toISOString();
        return run(
            'UPDATE bank_accounts SET credit_amount = credit_amount + ?, credit_due_date = ? WHERE username_lower = ? AND is_active = 1',
            [amount, dueDate, username.toLowerCase()]
        );
    },
};

// ==================== ТАБЛИЦА: organizations (бюджеты) ====================

const orgBudgets = {
    get(keyName) {
        return get('SELECT * FROM organizations WHERE key_name = ?', [keyName]);
    },

    getAll() {
        return all('SELECT * FROM organizations ORDER BY name ASC');
    },

    updateBudget(keyName, amount) {
        return run('UPDATE organizations SET budget = MAX(0, budget + ?) WHERE key_name = ?', [amount, keyName]);
    },

    updateMaterials(keyName, amount) {
        return run('UPDATE organizations SET materials = MAX(0, materials + ?) WHERE key_name = ?', [amount, keyName]);
    },

    setFrozen(keyName, isFrozen, reason = '') {
        return run('UPDATE organizations SET is_frozen = ?, frozen_reason = ? WHERE key_name = ?',
            [isFrozen ? 1 : 0, isFrozen ? reason : '', keyName]);
    },

    setTaxRate(keyName, rate) {
        return run('UPDATE organizations SET tax_rate = ? WHERE key_name = ?', [rate, keyName]);
    },

    setBonus(keyName, percent) {
        return run('UPDATE organizations SET bonus_percent = ? WHERE key_name = ?', [percent, keyName]);
    },
};

// ==================== ТАБЛИЦА: education ====================

const education = {
    setBasic(username, passed = true) {
        const uLower = username.toLowerCase();
        run(
            'INSERT INTO education (username, username_lower, has_basic) VALUES (?, ?, ?) ON CONFLICT(username_lower) DO UPDATE SET has_basic = ?',
            [username, uLower, passed ? 1 : 0, passed ? 1 : 0]
        );
        rpMembers.setOrganization(username, rpMembers.get(username)?.organization || null);
    },

    setAdvanced(username, passed = true) {
        const uLower = username.toLowerCase();
        run(
            'INSERT INTO education (username, username_lower, has_advanced) VALUES (?, ?, ?) ON CONFLICT(username_lower) DO UPDATE SET has_advanced = ?',
            [username, uLower, passed ? 1 : 0, passed ? 1 : 0]
        );
    },

    get(username) {
        return get('SELECT * FROM education WHERE username_lower = ?', [username.toLowerCase()]);
    },

    addGrade(username, course, grade) {
        const uLower = username.toLowerCase();
        const edu = education.get(username);
        const courses = edu ? (edu.courses_passed ? edu.courses_passed.split(',') : []) : [];
        const grades = edu ? (edu.grades ? edu.grades.split(',') : []) : [];
        courses.push(course);
        grades.push(String(grade));
        run(
            'INSERT INTO education (username, username_lower, courses_passed, grades) VALUES (?, ?, ?, ?) ON CONFLICT(username_lower) DO UPDATE SET courses_passed = ?, grades = ?',
            [username, uLower, courses.join(','), grades.join(','), courses.join(','), grades.join(',')]
        );
    },
};

// ==================== ТАБЛИЦА: medical_books ====================

const medicalBooks = {
    issue(username, issuedBy, validityDays = 30) {
        const uLower = username.toLowerCase();
        const expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString();
        run(
            'INSERT OR REPLACE INTO medical_books (username, username_lower, issued_by, expires_at, is_valid) VALUES (?, ?, ?, ?, 1)',
            [username, uLower, issuedBy, expiresAt]
        );
        rpMembers.get(username); // ensure exists
        run('UPDATE rp_members SET medical_book = 1, medical_book_expires = ? WHERE username_lower = ?', [expiresAt, uLower]);
    },

    isValid(username) {
        const row = get(
            "SELECT * FROM medical_books WHERE username_lower = ? AND is_valid = 1 AND expires_at > datetime('now')",
            [username.toLowerCase()]
        );
        return !!row;
    },

    get(username) {
        return get('SELECT * FROM medical_books WHERE username_lower = ?', [username.toLowerCase()]);
    },
};

// ==================== ТАБЛИЦА: vacations ====================

const vacations = {
    add(username, organization, endDate, reason = '') {
        return run(
            'INSERT INTO vacations (username, username_lower, organization, end_date, reason) VALUES (?, ?, ?, ?, ?)',
            [username, username.toLowerCase(), organization, endDate, reason]
        );
    },

    getActive(username) {
        return get(
            "SELECT * FROM vacations WHERE username_lower = ? AND is_active = 1 AND end_date > datetime('now')",
            [username.toLowerCase()]
        );
    },

    getActiveByOrg(organization) {
        return all(
            "SELECT * FROM vacations WHERE organization = ? AND is_active = 1 AND end_date > datetime('now')",
            [organization]
        );
    },

    end(username) {
        return run('UPDATE vacations SET is_active = 0 WHERE username_lower = ? AND is_active = 1',
            [username.toLowerCase()]);
    },
};

// ==================== ТАБЛИЦА: chat_logs ====================

const chatLogs = {
    logClanChat(username, message) {
        return run(
            'INSERT INTO clan_chat_logs (username, username_lower, message) VALUES (?, ?, ?)',
            [username, username.toLowerCase(), message]
        );
    },

    logPrivateMessage(sender, receiver, message) {
        return run(
            'INSERT INTO private_message_logs (sender, sender_lower, receiver, receiver_lower, message) VALUES (?, ?, ?, ?, ?)',
            [sender, sender.toLowerCase(), receiver, receiver.toLowerCase(), message]
        );
    },

    getClanChatLogs(username = null, limit = 50) {
        if (username) {
            return all('SELECT * FROM clan_chat_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT ?',
                [username.toLowerCase(), limit]);
        }
        return all('SELECT * FROM clan_chat_logs ORDER BY created_at DESC LIMIT ?', [limit]);
    },

    getPrivateMessageLogs(username = null, limit = 50) {
        if (username) {
            return all(
                'SELECT * FROM private_message_logs WHERE sender_lower = ? OR receiver_lower = ? ORDER BY created_at DESC LIMIT ?',
                [username.toLowerCase(), username.toLowerCase(), limit]
            );
        }
        return all('SELECT * FROM private_message_logs ORDER BY created_at DESC LIMIT ?', [limit]);
    },
};

// ==================== ТАБЛИЦА: cooldowns ====================

const cooldowns = {
    set(username, command, durationSeconds) {
        const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
        run('DELETE FROM command_cooldowns WHERE username_lower = ? AND command = ?',
            [username.toLowerCase(), command]);
        return run(
            'INSERT INTO command_cooldowns (username, username_lower, command, expires_at) VALUES (?, ?, ?, ?)',
            [username, username.toLowerCase(), command, expiresAt]
        );
    },

    get(username, command) {
        const row = get(
            "SELECT * FROM command_cooldowns WHERE username_lower = ? AND command = ? AND expires_at > datetime('now')",
            [username.toLowerCase(), command]
        );
        if (!row) return null;
        return new Date(row.expires_at + 'Z');
    },

    clear(username = null) {
        if (username) {
            return run('DELETE FROM command_cooldowns WHERE username_lower = ?', [username.toLowerCase()]);
        }
        return run("DELETE FROM command_cooldowns WHERE expires_at <= datetime('now')");
    },
};

// ==================== ТАБЛИЦА: diseases ====================

const diseases = {
    infectRandom() {
        const virusEnabled = settings.getBoolean('virus_enabled');
        if (!virusEnabled) return [];

        const chance = settings.getNumber('virus_chance') || config.virus.defaultChance;
        const members = rpMembers.getAll();
        const infected = [];

        for (const member of members) {
            if (member.is_sick || member.is_frozen) continue;
            if (Math.random() < chance) {
                const durationHours = chance >= 0.3 ? 48 : 24;
                rpMembers.setSick(member.username, 'random_virus', durationHours);
                infected.push(member.username);
            }
        }
        return infected;
    },

    getActive() {
        return all("SELECT * FROM diseases WHERE is_active = 1 AND expires_at > datetime('now')");
    },
};

// ==================== ТАБЛИЦА: org_blacklists ====================

const orgBlacklists = {
    add(username, organization, reason, issuedBy) {
        return run(
            'INSERT INTO org_blacklists (username, username_lower, organization, reason, issued_by, issued_by_lower) VALUES (?, ?, ?, ?, ?, ?)',
            [username, username.toLowerCase(), organization, reason, issuedBy, issuedBy.toLowerCase()]
        );
    },

    remove(username, organization) {
        return run(
            'UPDATE org_blacklists SET is_active = 0 WHERE username_lower = ? AND organization = ? AND is_active = 1',
            [username.toLowerCase(), organization]
        );
    },

    isBlacklisted(username, organization) {
        const row = get(
            'SELECT * FROM org_blacklists WHERE username_lower = ? AND organization = ? AND is_active = 1',
            [username.toLowerCase(), organization]
        );
        return !!row;
    },

    getByOrg(organization) {
        return all('SELECT * FROM org_blacklists WHERE organization = ? AND is_active = 1', [organization]);
    },
};

// ==================== ТАБЛИЦА: org_warns ====================

const orgWarns = {
    add(username, organization, reason, issuedBy) {
        run(
            'INSERT INTO org_warns (username, username_lower, organization, reason, issued_by, issued_by_lower) VALUES (?, ?, ?, ?, ?, ?)',
            [username, username.toLowerCase(), organization, reason, issuedBy, issuedBy.toLowerCase()]
        );
        const count = all(
            'SELECT COUNT(*) as count FROM org_warns WHERE username_lower = ? AND organization = ? AND is_active = 1',
            [username.toLowerCase(), organization]
        );
        return (count.length > 0 ? count[0].count : 0);
    },

    remove(username, organization) {
        return run(
            'UPDATE org_warns SET is_active = 0 WHERE username_lower = ? AND organization = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
            [username.toLowerCase(), organization]
        );
    },

    getCount(username, organization) {
        const row = get(
            'SELECT COUNT(*) as count FROM org_warns WHERE username_lower = ? AND organization = ? AND is_active = 1',
            [username.toLowerCase(), organization]
        );
        return row ? row.count : 0;
    },
};

// ==================== ЭКСПОРТ ВСЕХ МОДУЛЕЙ ====================

const dbModule = {
    // Низкоуровневые методы
    db,
    get,
    all,
    run,
    transaction,
    prepare,
    exec,
    initDatabase,

    // Таблицы
    members,
    rpMembers,
    staff,
    punishments,
    settings,
    properties,
    gangs,
    robberies,
    armySupplies,
    fines,
    verification,
    licenses,
    bank,
    orgBudgets,
    education,
    medicalBooks,
    vacations,
    chatLogs,
    cooldowns,
    diseases,
    orgBlacklists,
    orgWarns,
};

// Инициализация при загрузке модуля
try {
    initDatabase();
    logger.success('Модуль базы данных полностью загружен и готов к работе');
} catch (error) {
    logger.error(`КРИТИЧЕСКАЯ ОШИБКА загрузки БД: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
}

module.exports = dbModule;