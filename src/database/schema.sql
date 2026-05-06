-- ============================================================
-- RESISTANCE CITY DATABASE SCHEMA v5.0.0
-- База данных: hohols.db (SQLite)
-- ============================================================

-- ==================== УЧАСТНИКИ КЛАНА ====================
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    username_lower TEXT NOT NULL UNIQUE,
    rank TEXT DEFAULT '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй',
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by TEXT,
    is_in_clan INTEGER DEFAULT 1,
    discord_id TEXT,
    discord_verified INTEGER DEFAULT 0,
    hours_in_clan REAL DEFAULT 0.0,
    last_hours_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ROLEPLAY УЧАСТНИКИ ====================
CREATE TABLE IF NOT EXISTS rp_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    username_lower TEXT NOT NULL UNIQUE,
    balance REAL DEFAULT 0.0,
    bank_balance REAL DEFAULT 0.0,
    organization TEXT,
    rank TEXT,
    education TEXT DEFAULT 'none',
    education_advanced INTEGER DEFAULT 0,
    medical_book INTEGER DEFAULT 0,
    medical_book_expires DATETIME,
    points REAL DEFAULT 0.0,
    rp_joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_hours REAL DEFAULT 0.0,
    payday_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    is_in_city INTEGER DEFAULT 1,
    is_in_jail INTEGER DEFAULT 0,
    jail_until DATETIME,
    is_sick INTEGER DEFAULT 0,
    sick_until DATETIME,
    is_frozen INTEGER DEFAULT 0,
    frozen_reason TEXT,
    warns INTEGER DEFAULT 0,
    last_warn_at DATETIME,
    blacklisted_from_rp INTEGER DEFAULT 0
);

-- ==================== БАЛАНСЫ И ЛОГИ ТРАНЗАКЦИЙ ====================
CREATE TABLE IF NOT EXISTS balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_before REAL,
    balance_after REAL,
    source TEXT,
    reason TEXT,
    issuer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ЛОГИ НАКАЗАНИЙ ====================
CREATE TABLE IF NOT EXISTS punishment_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    type TEXT NOT NULL,
    duration_minutes INTEGER,
    reason TEXT,
    issued_by TEXT NOT NULL,
    issued_by_lower TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    removed_at DATETIME,
    removed_by TEXT,
    is_active INTEGER DEFAULT 1
);

-- ==================== ЛОГИ КЛАНОВОГО ЧАТА ====================
CREATE TABLE IF NOT EXISTS clan_chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ПЕРСОНАЛ КЛАНА ====================
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    username_lower TEXT NOT NULL UNIQUE,
    rank TEXT NOT NULL,
    warns INTEGER DEFAULT 0,
    kicks_today INTEGER DEFAULT 0,
    mutes_today INTEGER DEFAULT 0,
    blacklists_today INTEGER DEFAULT 0,
    last_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    promoted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- ==================== НАСТРОЙКИ ====================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ВЕРИФИКАЦИЯ DISCORD ====================
CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discord_id TEXT NOT NULL,
    username TEXT,
    username_lower TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    used_at DATETIME
);

-- ==================== ИМУЩЕСТВО ====================
CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    property_type TEXT NOT NULL,
    owner TEXT,
    owner_lower TEXT,
    price REAL,
    purchased_at DATETIME,
    granted_by TEXT,
    is_owned INTEGER DEFAULT 0,
    tax_paid_until DATETIME,
    co_owner_1 TEXT,
    co_owner_1_lower TEXT,
    co_owner_2 TEXT,
    co_owner_2_lower TEXT,
    region_name TEXT
);

-- ==================== БИЗНЕСЫ ====================
CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    owner_lower TEXT NOT NULL,
    license_expires DATETIME,
    earnings_total REAL DEFAULT 0.0,
    earnings_today REAL DEFAULT 0.0,
    earnings_week REAL DEFAULT 0.0,
    last_earning_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ОФИСЫ ====================
CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    owner_lower TEXT NOT NULL,
    office_type TEXT NOT NULL,
    level INTEGER DEFAULT 4,
    questions_answered INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    license_expires DATETIME,
    earnings_total REAL DEFAULT 0.0,
    last_question_at DATETIME,
    last_earning_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ЛИЦЕНЗИИ ====================
CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    license_type TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_active INTEGER DEFAULT 1,
    price REAL NOT NULL
);

-- ==================== ОРГАНИЗАЦИИ (БЮДЖЕТЫ) ====================
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    key_name TEXT NOT NULL UNIQUE,
    budget REAL DEFAULT 0.0,
    materials INTEGER DEFAULT 0,
    bonus_percent REAL DEFAULT 0.0,
    is_frozen INTEGER DEFAULT 0,
    frozen_reason TEXT,
    tax_rate REAL DEFAULT 0.01
);

-- ==================== БАНДЫ (ОПГ) ====================
CREATE TABLE IF NOT EXISTS gangs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_lower TEXT NOT NULL UNIQUE,
    color_name TEXT,
    leader TEXT NOT NULL,
    leader_lower TEXT NOT NULL,
    balance REAL DEFAULT 0.0,
    materials INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    warns INTEGER DEFAULT 0,
    is_frozen INTEGER DEFAULT 0,
    frozen_reason TEXT,
    is_active INTEGER DEFAULT 1
);

-- ==================== УЧАСТНИКИ БАНД ====================
CREATE TABLE IF NOT EXISTS gang_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gang_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gang_id) REFERENCES gangs(id) ON DELETE CASCADE
);

-- ==================== ГРАБЕЖИ (ПАТИ) ====================
CREATE TABLE IF NOT EXISTS robbery_parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator TEXT NOT NULL,
    creator_lower TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    completed_at DATETIME
);

-- ==================== УЧАСТНИКИ ГРАБЕЖА ====================
CREATE TABLE IF NOT EXISTS robbery_party_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES robbery_parties(id) ON DELETE CASCADE
);

-- ==================== ЛОГИ ГРАБЕЖЕЙ ====================
CREATE TABLE IF NOT EXISTS robbery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER,
    victim TEXT NOT NULL,
    victim_lower TEXT NOT NULL,
    amount REAL NOT NULL,
    robbers TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== АРМИЯ: ПОСТАВКИ ====================
CREATE TABLE IF NOT EXISTS army_supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator TEXT NOT NULL,
    creator_lower TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    status TEXT DEFAULT 'forming',
    started_at DATETIME,
    min_arrival_time DATETIME,
    actual_arrival_time DATETIME,
    is_successful INTEGER DEFAULT 0,
    stolen_by TEXT,
    stolen_by_lower TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== УЧАСТНИКИ ПОСТАВОК ====================
CREATE TABLE IF NOT EXISTS army_supply_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    role TEXT NOT NULL,
    FOREIGN KEY (supply_id) REFERENCES army_supplies(id) ON DELETE CASCADE
);

-- ==================== ЗАБОЛЕВАНИЯ ====================
CREATE TABLE IF NOT EXISTS diseases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    disease_type TEXT NOT NULL,
    infected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    treatment_type TEXT
);

-- ==================== МЕДИЦИНСКИЕ КНИЖКИ ====================
CREATE TABLE IF NOT EXISTS medical_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    issued_by TEXT,
    expires_at DATETIME,
    is_valid INTEGER DEFAULT 1
);

-- ==================== ОБРАЗОВАНИЕ ====================
CREATE TABLE IF NOT EXISTS education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    has_basic INTEGER DEFAULT 0,
    has_advanced INTEGER DEFAULT 0,
    courses_passed TEXT,
    grades TEXT,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    issued_by TEXT
);

-- ==================== БАНКОВСКИЕ СЧЕТА ====================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    balance REAL DEFAULT 0.0,
    deposit_amount REAL DEFAULT 0.0,
    deposit_rate REAL DEFAULT 0.03,
    credit_amount REAL DEFAULT 0.0,
    credit_rate REAL DEFAULT 0.07,
    credit_due_date DATETIME,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- ==================== БАНКОВСКИЕ ТРАНЗАКЦИИ ====================
CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_before REAL,
    balance_after REAL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ТЮРЕМНЫЕ ЗАКЛЮЧЕНИЯ ====================
CREATE TABLE IF NOT EXISTS jail_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    jailed_by TEXT NOT NULL,
    jailed_by_lower TEXT NOT NULL,
    reason TEXT,
    duration_minutes INTEGER NOT NULL,
    jail_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    jail_end DATETIME,
    is_active INTEGER DEFAULT 1
);

-- ==================== ШТРАФЫ ====================
CREATE TABLE IF NOT EXISTS fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    issued_by TEXT NOT NULL,
    issued_by_lower TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    response TEXT,
    responded_at DATETIME,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ОТПУСКА ====================
CREATE TABLE IF NOT EXISTS vacations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    organization TEXT NOT NULL,
    start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_date DATETIME,
    reason TEXT,
    is_active INTEGER DEFAULT 1
);

-- ==================== ВЫГОВОРЫ ПЕРСОНАЛА ====================
CREATE TABLE IF NOT EXISTS staff_warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    reason TEXT,
    issued_by TEXT NOT NULL,
    issued_by_lower TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- ==================== ВЫГОВОРЫ ОРГАНИЗАЦИЙ ====================
CREATE TABLE IF NOT EXISTS org_warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    organization TEXT NOT NULL,
    reason TEXT,
    issued_by TEXT NOT NULL,
    issued_by_lower TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- ==================== ЧЁРНЫЙ СПИСОК ОРГАНИЗАЦИЙ ====================
CREATE TABLE IF NOT EXISTS org_blacklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    organization TEXT NOT NULL,
    reason TEXT,
    issued_by TEXT NOT NULL,
    issued_by_lower TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- ==================== КД КОМАНД ====================
CREATE TABLE IF NOT EXISTS command_cooldowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL,
    command TEXT NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

-- ==================== ЛОГИ ЛИЧНЫХ СООБЩЕНИЙ ====================
CREATE TABLE IF NOT EXISTS private_message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    sender_lower TEXT NOT NULL,
    receiver TEXT NOT NULL,
    receiver_lower TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== АКТИВНЫЕ ДЕЖУРСТВА ====================
CREATE TABLE IF NOT EXISTS active_duties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    organization TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_payday_at DATETIME,
    minutes_on_duty REAL DEFAULT 0.0
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX IF NOT EXISTS idx_members_username_lower ON members(username_lower);
CREATE INDEX IF NOT EXISTS idx_rp_members_username_lower ON rp_members(username_lower);
CREATE INDEX IF NOT EXISTS idx_balance_logs_username_lower ON balance_logs(username_lower);
CREATE INDEX IF NOT EXISTS idx_punishment_logs_username_lower ON punishment_logs(username_lower);
CREATE INDEX IF NOT EXISTS idx_clan_chat_logs_username_lower ON clan_chat_logs(username_lower);
CREATE INDEX IF NOT EXISTS idx_staff_username_lower ON staff(username_lower);
CREATE INDEX IF NOT EXISTS idx_properties_owner_lower ON properties(owner_lower);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_gangs_name_lower ON gangs(name_lower);
CREATE INDEX IF NOT EXISTS idx_gang_members_username_lower ON gang_members(username_lower);
CREATE INDEX IF NOT EXISTS idx_robbery_parties_creator_lower ON robbery_parties(creator_lower);
CREATE INDEX IF NOT EXISTS idx_robbery_party_members_username_lower ON robbery_party_members(username_lower);
CREATE INDEX IF NOT EXISTS idx_robbery_logs_victim_lower ON robbery_logs(victim_lower);
CREATE INDEX IF NOT EXISTS idx_army_supplies_creator_lower ON army_supplies(creator_lower);
CREATE INDEX IF NOT EXISTS idx_army_supply_members_username_lower ON army_supply_members(username_lower);
CREATE INDEX IF NOT EXISTS idx_diseases_username_lower ON diseases(username_lower);
CREATE INDEX IF NOT EXISTS idx_medical_books_username_lower ON medical_books(username_lower);
CREATE INDEX IF NOT EXISTS idx_education_username_lower ON education(username_lower);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_username_lower ON bank_accounts(username_lower);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_username_lower ON bank_transactions(username_lower);
CREATE INDEX IF NOT EXISTS idx_jail_records_username_lower ON jail_records(username_lower);
CREATE INDEX IF NOT EXISTS idx_fines_username_lower ON fines(username_lower);
CREATE INDEX IF NOT EXISTS idx_vacations_username_lower ON vacations(username_lower);
CREATE INDEX IF NOT EXISTS idx_staff_warns_username_lower ON staff_warns(username_lower);
CREATE INDEX IF NOT EXISTS idx_org_warns_username_lower ON org_warns(username_lower);
CREATE INDEX IF NOT EXISTS idx_org_blacklists_username_lower ON org_blacklists(username_lower);
CREATE INDEX IF NOT EXISTS idx_command_cooldowns_username_lower ON command_cooldowns(username_lower);
CREATE INDEX IF NOT EXISTS idx_private_message_logs_sender_lower ON private_message_logs(sender_lower);
CREATE INDEX IF NOT EXISTS idx_private_message_logs_receiver_lower ON private_message_logs(receiver_lower);
CREATE INDEX IF NOT EXISTS idx_active_duties_username_lower ON active_duties(username_lower);
CREATE INDEX IF NOT EXISTS idx_licenses_username_lower ON licenses(username_lower);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_lower ON businesses(owner_lower);
CREATE INDEX IF NOT EXISTS idx_offices_owner_lower ON offices(owner_lower);
CREATE INDEX IF NOT EXISTS idx_organizations_key_name ON organizations(key_name);

-- ==================== НАЧАЛЬНЫЕ НАСТРОЙКИ ====================
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_mod_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('clan_ad_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chat_ad_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('payday_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('virus_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('global_freeze', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('virus_chance', '0.05');
INSERT OR IGNORE INTO settings (key, value) VALUES ('proxy_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('economy_tax_rate', '0.01');

-- ==================== НАЧАЛЬНЫЕ БЮДЖЕТЫ ОРГАНИЗАЦИЙ ====================
INSERT OR IGNORE INTO organizations (name, key_name, budget, materials) VALUES ('Полиция (МВД)', 'police', 5000000, 0);
INSERT OR IGNORE INTO organizations (name, key_name, budget, materials) VALUES ('Армия', 'army', 8000000, 0);
INSERT OR IGNORE INTO organizations (name, key_name, budget, materials) VALUES ('Больница', 'hospital', 4000000, 0);
INSERT OR IGNORE INTO organizations (name, key_name, budget, materials) VALUES ('Академия', 'academy', 3000000, 0);
INSERT OR IGNORE INTO organizations (name, key_name, budget, materials) VALUES ('Мэрия и Суд', 'government', 10000000, 0);

-- ==================== АДМИНИСТРАТОР ПО УМОЛЧАНИЮ ====================
INSERT OR IGNORE INTO staff (username, username_lower, rank) VALUES ('Ronch_', 'ronch_', 'administrator');