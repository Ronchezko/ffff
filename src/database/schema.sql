-- Таблица участников клана
CREATE TABLE IF NOT EXISTS clan_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minecraft_nick TEXT UNIQUE NOT NULL,
    rank TEXT NOT NULL DEFAULT 'Новичок',
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    total_hours INTEGER DEFAULT 0,
    invited_by TEXT,
    discord_id TEXT,
    is_online BOOLEAN DEFAULT 0
);

-- Таблица RolePlay игроков
CREATE TABLE IF NOT EXISTS rp_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minecraft_nick TEXT UNIQUE NOT NULL,
    money INTEGER DEFAULT 0,
    profession TEXT,
    organization_rank TEXT,
    unique_points INTEGER DEFAULT 0,
    rp_joined DATETIME DEFAULT CURRENT_TIMESTAMP,
    paydays_attended INTEGER DEFAULT 0,
    properties TEXT DEFAULT '[]',
    education BOOLEAN DEFAULT 0,
    warns INTEGER DEFAULT 0,
    frozen BOOLEAN DEFAULT 0,
    FOREIGN KEY (minecraft_nick) REFERENCES clan_members(minecraft_nick) ON DELETE CASCADE
);

-- Логи денег
CREATE TABLE IF NOT EXISTS money_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    amount INTEGER,
    new_balance INTEGER,
    reason TEXT,
    issued_by TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Наказания
CREATE TABLE IF NOT EXISTS punishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    issued_by TEXT,
    duration_minutes INTEGER DEFAULT 0,
    expires_at DATETIME,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT 1
);

-- Логи кланового чата
CREATE TABLE IF NOT EXISTS clan_chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Персонал
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minecraft_nick TEXT UNIQUE NOT NULL,
    discord_id TEXT,
    staff_rank TEXT NOT NULL,
    kicks_today INTEGER DEFAULT 0,
    mutes_today INTEGER DEFAULT 0,
    blacklists_today INTEGER DEFAULT 0,
    last_reset DATE,
    total_warns INTEGER DEFAULT 0,
    appointed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    appointed_by TEXT,
    FOREIGN KEY (minecraft_nick) REFERENCES clan_members(minecraft_nick) ON DELETE CASCADE
);

-- Настройки
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT
);

-- Коды верификации
CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    minecraft_nick TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    status TEXT DEFAULT 'pending'
);

-- Имущество
CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    price INTEGER NOT NULL,
    owner TEXT,
    co_owners TEXT DEFAULT '[]',
    purchased_at DATETIME,
    last_tax_paid DATETIME,
    license_type TEXT,
    license_expires DATETIME,
    level INTEGER DEFAULT 4,
    questions_answered INTEGER DEFAULT 0,
    profit_data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT,
    success BOOLEAN,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    blocked_until DATETIME NOT NULL
);
-- Участники структур
CREATE TABLE IF NOT EXISTS structure_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minecraft_nick TEXT NOT NULL,
    structure TEXT NOT NULL,
    rank TEXT NOT NULL,
    duty_start DATETIME,
    on_duty BOOLEAN DEFAULT 0,
    warns INTEGER DEFAULT 0,
    FOREIGN KEY (minecraft_nick) REFERENCES rp_players(minecraft_nick) ON DELETE CASCADE
);

-- Бюджеты организаций
CREATE TABLE IF NOT EXISTS org_budgets (
    structure TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Налоги
CREATE TABLE IF NOT EXISTS taxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_type TEXT,
    rate REAL,
    set_by TEXT,
    set_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Вставка начальных настроек
INSERT OR IGNORE INTO settings (key, value, description) VALUES 
    ('auto_moderation_enabled', 'true', 'Автоматическая модерация чата'),
    ('clan_ad_enabled', 'true', 'Реклама клана'),
    ('payday_enabled', 'true', 'Система PayDay'),
    ('proxy_enabled', 'false', 'Использование прокси'),
    ('main_bot_active', 'true', 'Какой бот активен: true - YT_FLATT807, false - xxx_toper_xxx');

-- Добавление главного администратора (замените Ronch_ на ваш ник)
INSERT OR IGNORE INTO clan_members (minecraft_nick, rank) VALUES ('Ronch_', 'Администратор');
INSERT OR IGNORE INTO staff (minecraft_nick, staff_rank, appointed_by) VALUES ('Ronch_', 'Администратор', 'system');