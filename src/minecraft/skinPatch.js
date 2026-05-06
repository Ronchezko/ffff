// src/minecraft/skinPatch.js — Патч скинов для Mineflayer Resistance City v5.0.0
// Исправление отображения скинов игроков через прокси-запросы
// Поддержка кэширования, обновления и fallback-механизмов

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { logger, createLogger } = require('../shared/logger');

const skinLogger = createLogger('SkinPatch');

// ==================== КОНСТАНТЫ ====================
const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'skins');
const CACHE_TTL_MS = 3600000; // 1 час
const MAX_CACHE_SIZE = 500; // Максимальное количество закэшированных скинов
const REQUEST_TIMEOUT_MS = 10000;
const MOJANG_API = 'https://api.mojang.com/users/profiles/minecraft';
const SESSION_API = 'https://sessionserver.mojang.com/session/minecraft/profile';
const MINECRAFT_API = 'https://api.minecraftservices.com/minecraft/profile';

// ==================== КЭШ В ПАМЯТИ ====================
const memoryCache = new Map();
const pendingRequests = new Map();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function initCache() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        skinLogger.info('Создана директория кэша скинов: ' + CACHE_DIR);
    }

    // Очистка устаревших файлов при запуске
    cleanExpiredCache();
}

// ==================== ПОЛУЧЕНИЕ СКИНА ====================

/**
 * Получить данные скина игрока
 * @param {string} username - Имя игрока
 * @returns {Promise<object|null>} Данные скина или null
 */
async function getSkinData(username) {
    if (!username) return null;

    var normalizedName = username.toLowerCase().trim();
    var skinLogger = createLogger('SkinPatch');

    // Проверка кэша в памяти
    var cached = memoryCache.get(normalizedName);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.data;
    }

    // Проверка файлового кэша
    var fileCached = loadFromFileCache(normalizedName);
    if (fileCached) {
        memoryCache.set(normalizedName, {
            data: fileCached,
            timestamp: Date.now(),
        });
        return fileCached;
    }

    // Проверка pending запросов (чтобы не отправлять дубликаты)
    if (pendingRequests.has(normalizedName)) {
        return pendingRequests.get(normalizedName);
    }

    // Создание нового запроса
    var requestPromise = fetchSkinFromMojang(username, normalizedName);
    pendingRequests.set(normalizedName, requestPromise);

    try {
        var skinData = await requestPromise;

        if (skinData) {
            // Сохранение в кэш
            memoryCache.set(normalizedName, {
                data: skinData,
                timestamp: Date.now(),
            });
            saveToFileCache(normalizedName, skinData);
        }

        return skinData;
    } finally {
        pendingRequests.delete(normalizedName);
    }
}

// ==================== ЗАПРОС К MOJANG API ====================

async function fetchSkinFromMojang(username, normalizedName) {
    skinLogger.debug('Запрос скина для: ' + username);

    try {
        // Шаг 1: Получение UUID игрока
        var uuid = await getPlayerUUID(username);
        if (!uuid) {
            skinLogger.warn('UUID не найден для игрока: ' + username);
            return null;
        }

        // Шаг 2: Получение профиля с текстурой скина
        var profile = await getPlayerProfile(uuid);
        if (!profile || !profile.properties) {
            skinLogger.warn('Профиль не найден для UUID: ' + uuid);
            return null;
        }

        // Шаг 3: Декодирование текстуры
        var textureData = extractTextureData(profile);
        if (!textureData) {
            skinLogger.warn('Текстура не найдена для: ' + username);
            return null;
        }

        skinLogger.debug('Скин получен для: ' + username);

        return {
            username: username,
            uuid: uuid,
            skinUrl: textureData.skinUrl,
            capeUrl: textureData.capeUrl,
            model: textureData.model || 'classic',
            timestamp: Date.now(),
        };
    } catch (error) {
        skinLogger.error('Ошибка получения скина для ' + username + ': ' + error.message);
        return null;
    }
}

// ==================== ПОЛУЧЕНИЕ UUID ====================

async function getPlayerUUID(username) {
    return new Promise(function(resolve, reject) {
        var url = MOJANG_API + '/' + encodeURIComponent(username);
        var timeout = setTimeout(function() {
            reject(new Error('Таймаут запроса UUID'));
        }, REQUEST_TIMEOUT_MS);

        https.get(url, function(response) {
            clearTimeout(timeout);

            var data = '';
            response.on('data', function(chunk) {
                data += chunk;
            });
            response.on('end', function() {
                try {
                    if (response.statusCode === 200) {
                        var result = JSON.parse(data);
                        resolve(result.id || null);
                    } else if (response.statusCode === 204 || response.statusCode === 404) {
                        resolve(null);
                    } else {
                        skinLogger.warn('Статус ответа UUID API: ' + response.statusCode);
                        resolve(null);
                    }
                } catch (e) {
                    skinLogger.error('Ошибка парсинга UUID ответа: ' + e.message);
                    resolve(null);
                }
            });
        }).on('error', function(error) {
            clearTimeout(timeout);
            skinLogger.error('Ошибка запроса UUID: ' + error.message);
            resolve(null);
        });
    });
}

// ==================== ПОЛУЧЕНИЕ ПРОФИЛЯ ====================

async function getPlayerProfile(uuid) {
    return new Promise(function(resolve, reject) {
        var url = SESSION_API + '/' + uuid.replace(/-/g, '');
        var timeout = setTimeout(function() {
            reject(new Error('Таймаут запроса профиля'));
        }, REQUEST_TIMEOUT_MS);

        https.get(url, function(response) {
            clearTimeout(timeout);

            var data = '';
            response.on('data', function(chunk) {
                data += chunk;
            });
            response.on('end', function() {
                try {
                    if (response.statusCode === 200) {
                        var result = JSON.parse(data);
                        resolve(result);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    skinLogger.error('Ошибка парсинга профиля: ' + e.message);
                    resolve(null);
                }
            });
        }).on('error', function(error) {
            clearTimeout(timeout);
            skinLogger.error('Ошибка запроса профиля: ' + error.message);
            resolve(null);
        });
    });
}

// ==================== ИЗВЛЕЧЕНИЕ ТЕКСТУРЫ ====================

function extractTextureData(profile) {
    try {
        if (!profile.properties) return null;

        var texturesProperty = null;
        for (var i = 0; i < profile.properties.length; i++) {
            if (profile.properties[i].name === 'textures') {
                texturesProperty = profile.properties[i];
                break;
            }
        }

        if (!texturesProperty || !texturesProperty.value) return null;

        // Декодирование Base64
        var decodedValue = Buffer.from(texturesProperty.value, 'base64').toString('utf8');
        var textures = JSON.parse(decodedValue);

        if (!textures.textures) return null;

        var skinData = textures.textures.SKIN;
        var capeData = textures.textures.CAPE;

        return {
            skinUrl: skinData ? skinData.url : null,
            model: skinData && skinData.metadata ? skinData.metadata.model : 'classic',
            capeUrl: capeData ? capeData.url : null,
        };
    } catch (error) {
        skinLogger.error('Ошибка извлечения текстуры: ' + error.message);
        return null;
    }
}

// ==================== КЭШИРОВАНИЕ ====================

function loadFromFileCache(username) {
    try {
        var filePath = path.join(CACHE_DIR, username + '.json');
        if (!fs.existsSync(filePath)) return null;

        var stats = fs.statSync(filePath);
        if (Date.now() - stats.mtimeMs > CACHE_TTL_MS) {
            fs.unlinkSync(filePath);
            return null;
        }

        var data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        skinLogger.error('Ошибка загрузки из файлового кэша: ' + error.message);
        return null;
    }
}

function saveToFileCache(username, data) {
    try {
        var filePath = path.join(CACHE_DIR, username + '.json');
        var jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonData, 'utf8');

        // Ограничение размера кэша
        limitCacheSize();
    } catch (error) {
        skinLogger.error('Ошибка сохранения в файловый кэш: ' + error.message);
    }
}

function cleanExpiredCache() {
    try {
        if (!fs.existsSync(CACHE_DIR)) return;

        var files = fs.readdirSync(CACHE_DIR);
        var now = Date.now();
        var removedCount = 0;

        for (var i = 0; i < files.length; i++) {
            var filePath = path.join(CACHE_DIR, files[i]);
            try {
                var stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > CACHE_TTL_MS) {
                    fs.unlinkSync(filePath);
                    removedCount++;
                }
            } catch (e) {
                // Игнорируем ошибки отдельных файлов
            }
        }

        if (removedCount > 0) {
            skinLogger.debug('Очищено устаревших файлов кэша: ' + removedCount);
        }
    } catch (error) {
        skinLogger.error('Ошибка очистки кэша: ' + error.message);
    }
}

function limitCacheSize() {
    try {
        if (!fs.existsSync(CACHE_DIR)) return;

        var files = fs.readdirSync(CACHE_DIR);
        if (files.length <= MAX_CACHE_SIZE) return;

        // Сортировка по времени изменения (старые первыми)
        var fileStats = [];
        for (var i = 0; i < files.length; i++) {
            var filePath = path.join(CACHE_DIR, files[i]);
            try {
                var stats = fs.statSync(filePath);
                fileStats.push({ path: filePath, mtime: stats.mtimeMs });
            } catch (e) {}
        }

        fileStats.sort(function(a, b) { return a.mtime - b.mtime; });

        // Удаление самых старых
        var toRemove = fileStats.length - MAX_CACHE_SIZE;
        for (var j = 0; j < toRemove && j < fileStats.length; j++) {
            try {
                fs.unlinkSync(fileStats[j].path);
            } catch (e) {}
        }

        if (toRemove > 0) {
            skinLogger.debug('Ограничение кэша: удалено ' + toRemove + ' файлов');
        }
    } catch (error) {
        skinLogger.error('Ошибка ограничения размера кэша: ' + error.message);
    }
}

// ==================== ОЧИСТКА КЭША ====================

function clearSkinCache() {
    memoryCache.clear();
    try {
        if (fs.existsSync(CACHE_DIR)) {
            var files = fs.readdirSync(CACHE_DIR);
            for (var i = 0; i < files.length; i++) {
                fs.unlinkSync(path.join(CACHE_DIR, files[i]));
            }
            skinLogger.info('Кэш скинов полностью очищен (' + files.length + ' файлов)');
        }
    } catch (error) {
        skinLogger.error('Ошибка очистки кэша: ' + error.message);
    }
}

// ==================== СТАТИСТИКА КЭША ====================

function getCacheStats() {
    try {
        var fileCount = 0;
        var totalSize = 0;

        if (fs.existsSync(CACHE_DIR)) {
            var files = fs.readdirSync(CACHE_DIR);
            fileCount = files.length;

            for (var i = 0; i < files.length; i++) {
                try {
                    var stats = fs.statSync(path.join(CACHE_DIR, files[i]));
                    totalSize += stats.size;
                } catch (e) {}
            }
        }

        return {
            memoryCacheSize: memoryCache.size,
            fileCacheSize: fileCount,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / 1048576).toFixed(2),
            maxCacheSize: MAX_CACHE_SIZE,
        };
    } catch (error) {
        return {
            memoryCacheSize: memoryCache.size,
            error: error.message,
        };
    }
}

// ==================== ПЕРИОДИЧЕСКАЯ ОЧИСТКА ====================
setInterval(cleanExpiredCache, 3600000); // Раз в час
setInterval(function() {
    // Очистка memory cache от устаревших записей
    var now = Date.now();
    var removedCount = 0;
    memoryCache.forEach(function(value, key) {
        if (now - value.timestamp > CACHE_TTL_MS * 2) {
            memoryCache.delete(key);
            removedCount++;
        }
    });
    if (removedCount > 0) {
        skinLogger.debug('Очищено записей из memory cache: ' + removedCount);
    }
}, 600000); // Раз в 10 минут

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
initCache();

// ==================== ЭКСПОРТ ====================
module.exports = {
    getSkinData,
    getPlayerUUID,
    getPlayerProfile,
    extractTextureData,
    clearSkinCache,
    getCacheStats,
    cleanExpiredCache,
};