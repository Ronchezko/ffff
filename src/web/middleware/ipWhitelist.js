// src/web/middleware/ipWhitelist.js — IP Whitelist Middleware Resistance City v5.0.0
// Ограничение доступа к админ-панели по IP-адресам
// Поддержка белого и чёрного списков, диапазонов IP, CIDR

'use strict';

const { logger, createLogger } = require('../../shared/logger');
const config = require('../../config');
const db = require('../../database');
const net = require('net');

const ipLogger = createLogger('IPWhitelist');

// ==================== КОНСТАНТЫ ====================
const DEFAULT_WHITELIST = [
    '127.0.0.1',
    '::1',
    'localhost',
];

const DEFAULT_BLACKLIST = [];

// ==================== КЭШ СПИСКОВ ====================
let whitelistCache = [...DEFAULT_WHITELIST];
let blacklistCache = [...DEFAULT_BLACKLIST];
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 60000; // Обновление кэша каждую минуту

// ==================== ЗАГРУЗКА ИЗ БД ====================

function loadListsFromDB() {
    try {
        const whitelistStr = db.settings.get('ip_whitelist');
        const blacklistStr = db.settings.get('ip_blacklist');
        const enabled = db.settings.getBoolean('ip_whitelist_enabled');

        if (!enabled) {
            return { enabled: false, whitelist: [], blacklist: [] };
        }

        let whitelist = [...DEFAULT_WHITELIST];
        let blacklist = [...DEFAULT_BLACKLIST];

        if (whitelistStr) {
            const additional = whitelistStr.split(',').map(ip => ip.trim()).filter(Boolean);
            whitelist.push(...additional);
        }

        if (blacklistStr) {
            const additional = blacklistStr.split(',').map(ip => ip.trim()).filter(Boolean);
            blacklist.push(...additional);
        }

        return { enabled: true, whitelist, blacklist };
    } catch (error) {
        ipLogger.error(`Ошибка загрузки списков из БД: ${error.message}`);
        return { enabled: false, whitelist: [...DEFAULT_WHITELIST], blacklist: [] };
    }
}

function refreshCache() {
    const now = Date.now();
    if (now - lastCacheUpdate < CACHE_TTL_MS) return;

    const lists = loadListsFromDB();
    whitelistCache = lists.whitelist;
    blacklistCache = lists.blacklist;
    lastCacheUpdate = now;
}

// ==================== ПРОВЕРКА IP ====================

/**
 * Проверить, находится ли IP в списке
 */
function ipInList(ip, list) {
    if (!ip || !list || list.length === 0) return false;

    const normalizedIP = normalizeIP(ip);

    for (const entry of list) {
        // Точное совпадение
        if (normalizeIP(entry) === normalizedIP) {
            return true;
        }

        // Проверка CIDR (если есть /)
        if (entry.includes('/')) {
            if (ipInCIDR(normalizedIP, entry)) {
                return true;
            }
        }

        // Проверка диапазона (если есть -)
        if (entry.includes('-') && !entry.includes('/')) {
            if (ipInRange(normalizedIP, entry)) {
                return true;
            }
        }

        // Wildcard (*)
        if (entry.includes('*')) {
            const pattern = entry.replace(/\*/g, '.*').replace(/\./g, '\\.');
            const regex = new RegExp('^' + pattern + '$');
            if (regex.test(normalizedIP)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Нормализовать IP адрес
 */
function normalizeIP(ip) {
    if (!ip) return '';

    // IPv6 localhost
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
        return '::1';
    }

    // IPv4-mapped IPv6
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }

    return ip.trim().toLowerCase();
}

/**
 * Проверить IP в CIDR диапазоне
 */
function ipInCIDR(ip, cidr) {
    try {
        const [range, bits] = cidr.split('/');
        const mask = ~(2 ** (32 - parseInt(bits)) - 1);

        const ipNum = ipToNumber(normalizeIP(ip));
        const rangeNum = ipToNumber(normalizeIP(range));

        if (ipNum === null || rangeNum === null) return false;

        return (ipNum & mask) === (rangeNum & mask);
    } catch (error) {
        return false;
    }
}

/**
 * Проверить IP в диапазоне (начало-конец)
 */
function ipInRange(ip, range) {
    try {
        const [start, end] = range.split('-').map(s => s.trim());

        const ipNum = ipToNumber(normalizeIP(ip));
        const startNum = ipToNumber(normalizeIP(start));
        const endNum = ipToNumber(normalizeIP(end));

        if (ipNum === null || startNum === null || endNum === null) return false;

        return ipNum >= startNum && ipNum <= endNum;
    } catch (error) {
        return false;
    }
}

/**
 * Конвертировать IP в число
 */
function ipToNumber(ip) {
    try {
        if (net.isIPv6(ip)) {
            // Пропускаем IPv6 для простоты
            return null;
        }

        const parts = ip.split('.');
        if (parts.length !== 4) return null;

        return parts.reduce((acc, octet) => {
            const num = parseInt(octet, 10);
            if (isNaN(num) || num < 0 || num > 255) throw new Error('Invalid octet');
            return (acc << 8) + num;
        }, 0) >>> 0;
    } catch (error) {
        return null;
    }
}

/**
 * Получить реальный IP клиента (с учётом прокси)
 */
function getClientIP(req) {
    // Проверка заголовков прокси
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0];
    }

    const realIP = req.headers['x-real-ip'];
    if (realIP) return realIP.trim();

    return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ==================== MIDDLEWARE ====================

/**
 * Middleware для проверки IP (белый список)
 */
function ipWhitelistMiddleware(req, res, next) {
    try {
        refreshCache();

        const enabled = db.settings.getBoolean('ip_whitelist_enabled');
        if (!enabled) {
            return next();
        }

        const clientIP = getClientIP(req);

        // Проверка чёрного списка (всегда)
        if (ipInList(clientIP, blacklistCache)) {
            ipLogger.warn(`Доступ запрещён (чёрный список): ${clientIP} → ${req.originalUrl}`);

            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied: IP blacklisted',
                });
            }

            return res.status(403).render('message', {
                title: 'Доступ запрещён',
                message: `Ваш IP-адрес (${clientIP}) находится в чёрном списке.`,
                type: 'error',
            });
        }

        // Проверка белого списка
        if (!ipInList(clientIP, whitelistCache)) {
            ipLogger.warn(`Доступ запрещён (не в белом списке): ${clientIP} → ${req.originalUrl}`);

            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied: IP not whitelisted',
                });
            }

            return res.status(403).render('message', {
                title: 'Доступ запрещён',
                message: `Ваш IP-адрес (${clientIP}) не находится в белом списке. Обратитесь к администратору.`,
                type: 'error',
            });
        }

        // IP разрешён
        next();
    } catch (error) {
        ipLogger.error(`Ошибка IP middleware: ${error.message}`);
        next(); // Пропускаем при ошибке (не блокируем доступ)
    }
}

/**
 * Middleware только для определённых путей (обычно /admin)
 */
function ipWhitelistForAdmin(req, res, next) {
    // Применяем только к админ-путям
    if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
        return ipWhitelistMiddleware(req, res, next);
    }
    next();
}

/**
 * Строгий middleware (всегда проверяет)
 */
function strictIPWhitelist(req, res, next) {
    return ipWhitelistMiddleware(req, res, next);
}

// ==================== УПРАВЛЕНИЕ СПИСКАМИ ====================

/**
 * Добавить IP в белый список
 */
function addToWhitelist(ip) {
    try {
        refreshCache();

        const normalizedIP = normalizeIP(ip);
        if (!normalizedIP || normalizedIP === 'unknown') {
            return { success: false, reason: 'invalid_ip' };
        }

        if (ipInList(normalizedIP, whitelistCache)) {
            return { success: false, reason: 'already_in_list' };
        }

        const currentList = db.settings.get('ip_whitelist') || '';
        const newList = currentList ? `${currentList},${normalizedIP}` : normalizedIP;

        db.settings.set('ip_whitelist', newList);

        // Инвалидация кэша
        lastCacheUpdate = 0;

        ipLogger.info(`IP добавлен в белый список: ${normalizedIP}`);

        return { success: true };
    } catch (error) {
        ipLogger.error(`Ошибка добавления в белый список: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Удалить IP из белого списка
 */
function removeFromWhitelist(ip) {
    try {
        refreshCache();

        const normalizedIP = normalizeIP(ip);
        const currentList = db.settings.get('ip_whitelist') || '';

        if (!currentList) {
            return { success: false, reason: 'list_empty' };
        }

        const ips = currentList.split(',').map(s => s.trim());
        const filtered = ips.filter(i => normalizeIP(i) !== normalizedIP);

        if (filtered.length === ips.length) {
            return { success: false, reason: 'not_found' };
        }

        db.settings.set('ip_whitelist', filtered.join(','));
        lastCacheUpdate = 0;

        ipLogger.info(`IP удалён из белого списка: ${normalizedIP}`);

        return { success: true };
    } catch (error) {
        ipLogger.error(`Ошибка удаления из белого списка: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Добавить IP в чёрный список
 */
function addToBlacklist(ip) {
    try {
        refreshCache();

        const normalizedIP = normalizeIP(ip);
        if (!normalizedIP) {
            return { success: false, reason: 'invalid_ip' };
        }

        if (ipInList(normalizedIP, blacklistCache)) {
            return { success: false, reason: 'already_in_list' };
        }

        const currentList = db.settings.get('ip_blacklist') || '';
        const newList = currentList ? `${currentList},${normalizedIP}` : normalizedIP;

        db.settings.set('ip_blacklist', newList);
        lastCacheUpdate = 0;

        ipLogger.warn(`IP добавлен в чёрный список: ${normalizedIP}`);

        return { success: true };
    } catch (error) {
        ipLogger.error(`Ошибка добавления в чёрный список: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Удалить IP из чёрного списка
 */
function removeFromBlacklist(ip) {
    try {
        refreshCache();

        const normalizedIP = normalizeIP(ip);
        const currentList = db.settings.get('ip_blacklist') || '';

        if (!currentList) {
            return { success: false, reason: 'list_empty' };
        }

        const ips = currentList.split(',').map(s => s.trim());
        const filtered = ips.filter(i => normalizeIP(i) !== normalizedIP);

        if (filtered.length === ips.length) {
            return { success: false, reason: 'not_found' };
        }

        db.settings.set('ip_blacklist', filtered.join(','));
        lastCacheUpdate = 0;

        ipLogger.info(`IP удалён из чёрного списка: ${normalizedIP}`);

        return { success: true };
    } catch (error) {
        ipLogger.error(`Ошибка удаления из чёрного списка: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Получить списки
 */
function getLists() {
    refreshCache();

    return {
        enabled: db.settings.getBoolean('ip_whitelist_enabled'),
        whitelist: [...whitelistCache],
        blacklist: [...blacklistCache],
    };
}

/**
 * Включить/выключить белый список
 */
function setEnabled(enabled) {
    db.settings.set('ip_whitelist_enabled', enabled ? 'true' : 'false');
    lastCacheUpdate = 0;

    ipLogger.info(`IP белый список: ${enabled ? 'включен' : 'выключен'}`);

    return { success: true, enabled };
}

/**
 * Проверить IP (для тестирования)
 */
function checkIP(ip) {
    refreshCache();

    const normalizedIP = normalizeIP(ip);
    const enabled = db.settings.getBoolean('ip_whitelist_enabled');

    return {
        ip: normalizedIP,
        enabled,
        whitelisted: ipInList(normalizedIP, whitelistCache),
        blacklisted: ipInList(normalizedIP, blacklistCache),
        allowed: !enabled || (ipInList(normalizedIP, whitelistCache) && !ipInList(normalizedIP, blacklistCache)),
    };
}

// ==================== ОЧИСТКА КЭША ====================
setInterval(refreshCache, CACHE_TTL_MS);

// ==================== ЭКСПОРТ ====================
module.exports = {
    ipWhitelistMiddleware,
    ipWhitelistForAdmin,
    strictIPWhitelist,
    addToWhitelist,
    removeFromWhitelist,
    addToBlacklist,
    removeFromBlacklist,
    getLists,
    setEnabled,
    checkIP,
    getClientIP,
    ipInList,
    ipInCIDR,
    ipInRange,
    normalizeIP,
    ipToNumber,
};