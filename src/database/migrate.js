// src/database/migrate.js — Миграции базы данных Resistance City v5.0.0
// Автоматическое обновление схемы БД при изменении версии

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');

const migrateLogger = createLogger('DB-Migrate');

// ==================== КОНСТАНТЫ ====================
const DB_PATH = config.dbPath || path.join(__dirname, '..', '..', 'data', 'hohols.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const VERSION_TABLE = 'schema_version';

// ==================== СОЗДАНИЕ ТАБЛИЦЫ ВЕРСИЙ ====================
function ensureVersionTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${VERSION_TABLE} (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// ==================== ПОЛУЧЕНИЕ ТЕКУЩЕЙ ВЕРСИИ ====================
function getCurrentVersion(db) {
    ensureVersionTable(db);
    var row = db.prepare(`SELECT MAX(version) as version FROM ${VERSION_TABLE}`).get();
    return row ? (row.version || 0) : 0;
}

// ==================== ЗАГРУЗКА МИГРАЦИЙ ====================
function loadMigrations() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        migrateLogger.warn('Директория миграций не найдена: ' + MIGRATIONS_DIR);
        return [];
    }

    var files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(function(f) { return f.endsWith('.sql') || f.endsWith('.js'); })
        .sort();

    var migrations = [];

    files.forEach(function(file) {
        var match = file.match(/^(\d+)_(.+?)\.(sql|js)$/);
        if (!match) {
            migrateLogger.warn('Пропущен файл с неверным форматом: ' + file);
            return;
        }

        migrations.push({
            version: parseInt(match[1]),
            name: match[2],
            type: match[3],
            file: file,
            path: path.join(MIGRATIONS_DIR, file),
        });
    });

    return migrations;
}

// ==================== ПРИМЕНЕНИЕ МИГРАЦИЙ ====================
function applyMigration(db, migration) {
    migrateLogger.info('Применение миграции: ' + migration.file + ' (v' + migration.version + ')');

    try {
        if (migration.type === 'sql') {
            var sql = fs.readFileSync(migration.path, 'utf8');
            db.exec(sql);
        } else if (migration.type === 'js') {
            var migrationModule = require(migration.path);
            if (typeof migrationModule.up === 'function') {
                migrationModule.up(db);
            } else {
                throw new Error('JS миграция должна экспортировать функцию up()');
            }
        }

        // Запись о применении
        db.prepare(
            'INSERT INTO ' + VERSION_TABLE + ' (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name);

        migrateLogger.success('Миграция применена: v' + migration.version + ' - ' + migration.name);
        return true;
    } catch (error) {
        migrateLogger.error('Ошибка применения миграции v' + migration.version + ': ' + error.message);
        if (error.stack) migrateLogger.error(error.stack);
        return false;
    }
}

// ==================== ОТКАТ МИГРАЦИЙ ====================
function rollbackMigration(db, migration) {
    migrateLogger.warn('Откат миграции: v' + migration.version + ' - ' + migration.name);

    try {
        if (migration.type === 'js') {
            var migrationModule = require(migration.path);
            if (typeof migrationModule.down === 'function') {
                migrationModule.down(db);
            } else {
                migrateLogger.warn('Миграция v' + migration.version + ' не имеет функции down()');
            }
        } else {
            migrateLogger.warn('SQL миграции не поддерживают автоматический откат');
        }

        db.prepare('DELETE FROM ' + VERSION_TABLE + ' WHERE version = ?').run(migration.version);
        migrateLogger.success('Откат выполнен: v' + migration.version);
        return true;
    } catch (error) {
        migrateLogger.error('Ошибка отката v' + migration.version + ': ' + error.message);
        return false;
    }
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================
function runMigrations(targetVersion) {
    migrateLogger.info('╔══════════════════════════════════════════╗');
    migrateLogger.info('║  МИГРАЦИИ БАЗЫ ДАННЫХ                    ║');
    migrateLogger.info('╚══════════════════════════════════════════╝');

    var db;
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    } catch (error) {
        migrateLogger.error('Ошибка подключения к БД: ' + error.message);
        return { success: false, error: error.message };
    }

    try {
        var currentVersion = getCurrentVersion(db);
        var migrations = loadMigrations();

        migrateLogger.info('Текущая версия: ' + currentVersion);
        migrateLogger.info('Доступно миграций: ' + migrations.length);

        var pendingMigrations = migrations.filter(function(m) {
            return m.version > currentVersion;
        });

        if (targetVersion !== undefined && targetVersion !== null) {
            pendingMigrations = pendingMigrations.filter(function(m) {
                return m.version <= targetVersion;
            });
        }

        if (pendingMigrations.length === 0) {
            migrateLogger.info('Нет миграций для применения. БД актуальна.');
            return { success: true, applied: 0, currentVersion: currentVersion };
        }

        migrateLogger.info('Будет применено миграций: ' + pendingMigrations.length);

        var applied = 0;
        var failed = 0;

        pendingMigrations.forEach(function(migration) {
            if (applyMigration(db, migration)) {
                applied++;
            } else {
                failed++;
            }
        });

        var finalVersion = getCurrentVersion(db);

        migrateLogger.success('Применено: ' + applied + ', ошибок: ' + failed + ', версия: ' + finalVersion);

        return {
            success: failed === 0,
            applied: applied,
            failed: failed,
            previousVersion: currentVersion,
            currentVersion: finalVersion,
        };
    } catch (error) {
        migrateLogger.error('Ошибка миграции: ' + error.message);
        return { success: false, error: error.message };
    } finally {
        if (db) db.close();
    }
}

// ==================== СОЗДАНИЕ НОВОЙ МИГРАЦИИ ====================
function createMigration(name) {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    }

    var migrations = loadMigrations();
    var nextVersion = migrations.length > 0
        ? migrations[migrations.length - 1].version + 1
        : 1;

    var paddedVersion = String(nextVersion).padStart(4, '0');
    var safeName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
    var fileName = paddedVersion + '_' + safeName + '.sql';
    var filePath = path.join(MIGRATIONS_DIR, fileName);

    var template = '-- Миграция: ' + name + '\n-- Версия: ' + nextVersion + '\n-- Дата: ' + new Date().toISOString() + '\n\n-- Напишите SQL запросы ниже:\n\n';

    fs.writeFileSync(filePath, template, 'utf8');

    migrateLogger.success('Создана новая миграция: ' + fileName);

    return {
        success: true,
        version: nextVersion,
        fileName: fileName,
        path: filePath,
    };
}

// ==================== СТАТУС МИГРАЦИЙ ====================
function migrationStatus() {
    var db;
    try {
        db = new Database(DB_PATH);
    } catch (error) {
        return { success: false, error: error.message };
    }

    try {
        var currentVersion = getCurrentVersion(db);
        var allMigrations = loadMigrations();

        var appliedMigrations = db.prepare(
            'SELECT * FROM ' + VERSION_TABLE + ' ORDER BY version ASC'
        ).all();

        var pendingMigrations = allMigrations.filter(function(m) {
            return m.version > currentVersion;
        });

        return {
            success: true,
            currentVersion: currentVersion,
            totalMigrations: allMigrations.length,
            appliedCount: appliedMigrations.length,
            pendingCount: pendingMigrations.length,
            applied: appliedMigrations,
            pending: pendingMigrations.map(function(m) {
                return { version: m.version, name: m.name, file: m.file };
            }),
        };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        if (db) db.close();
    }
}

// ==================== ЗАПУСК ИЗ КОМАНДНОЙ СТРОКИ ====================
if (require.main === module) {
    var args = process.argv.slice(2);
    var command = args[0] || 'up';

    switch (command) {
        case 'up':
            var target = args[1] ? parseInt(args[1]) : undefined;
            var result = runMigrations(target);
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
            break;

        case 'create':
            var name = args[1] || 'new_migration';
            var createResult = createMigration(name);
            console.log(JSON.stringify(createResult, null, 2));
            process.exit(createResult.success ? 0 : 1);
            break;

        case 'status':
            var statusResult = migrationStatus();
            console.log(JSON.stringify(statusResult, null, 2));
            process.exit(statusResult.success ? 0 : 1);
            break;

        default:
            console.log('Использование: node migrate.js [up|create|status] [аргументы]');
            process.exit(1);
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    runMigrations,
    createMigration,
    migrationStatus,
    getCurrentVersion,
    loadMigrations,
    applyMigration,
    rollbackMigration,
};