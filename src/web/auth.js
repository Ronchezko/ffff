// src/web/auth.js — Модуль аутентификации Resistance City v5.0.0
// Middleware для проверки авторизации, сессии, ролей

'use strict';

const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const db = require('../database');

const authLogger = createLogger('WebAuth');

// ==================== КОНСТАНТЫ ====================
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 86400000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || config.web.adminUsername;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.web.adminPassword;

// ==================== MIDDLEWARE ====================

/**
 * Проверка авторизации (для админ-панели)
 */
function isAuthenticated(req, res, next) {
    if (!req.session || !req.session.user) {
        // Сохраняем URL для возврата после логина
        req.session.returnTo = req.originalUrl;

        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                redirect: '/admin/login',
            });
        }

        return res.redirect('/admin/login');
    }

    // Проверка срока сессии
    if (req.session.user.loginTime) {
        const loginTime = new Date(req.session.user.loginTime).getTime();
        if (Date.now() - loginTime > SESSION_MAX_AGE) {
            req.session.destroy();
            return res.redirect('/admin/login?error=session_expired');
        }
    }

    // Проверка роли
    if (req.session.user.role !== 'admin') {
        return res.status(403).render('message', {
            title: 'Доступ запрещён',
            message: 'У вас нет прав для доступа к этой странице.',
            type: 'error',
        });
    }

    // Обновление времени последней активности
    req.session.user.lastActivity = new Date().toISOString();
    req.session.touch();

    next();
}

/**
 * Middleware для API (проверка токена или сессии)
 */
function isApiAuthenticated(req, res, next) {
    // Проверка сессии
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        req.session.touch();
        return next();
    }

    // Проверка API токена (Bearer)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        if (validateApiToken(token)) {
            return next();
        }

        return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

/**
 * Проверка роли
 */
function requireRole(role) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (req.session.user.role !== role && req.session.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        next();
    };
}

// ==================== ФУНКЦИИ АУТЕНТИФИКАЦИИ ====================

/**
 * Проверить учетные данные
 */
function verifyCredentials(username, password) {
    if (!username || !password) return false;

    // Сравнение с переменными окружения
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return true;
    }

    return false;
}

/**
 * Создать сессию
 */
function createSession(req, username, role = 'admin') {
    req.session.user = {
        username,
        role,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
    };

    req.session.save();

    authLogger.info(`Сессия создана: ${username} (${role}) [IP: ${req.ip}]`);

    return req.session.user;
}

/**
 * Уничтожить сессию
 */
function destroySession(req) {
    const username = req.session?.user?.username || 'неизвестный';

    req.session.destroy((err) => {
        if (err) {
            authLogger.error(`Ошибка удаления сессии: ${err.message}`);
        } else {
            authLogger.info(`Сессия удалена: ${username}`);
        }
    });
}

/**
 * Проверить API токен
 */
function validateApiToken(token) {
    if (!token) return false;

    // Простая проверка (в продакшене заменить на JWT)
    const validTokens = [
        process.env.API_TOKEN,
        'resistance_api_token_2024',
    ].filter(Boolean);

    return validTokens.includes(token);
}

/**
 * Сгенерировать API токен
 */
function generateApiToken(username) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    authLogger.info(`API токен сгенерирован для ${username}: ${token.substring(0, 8)}...`);
    return token;
}

// ==================== ОБРАБОТЧИКИ ====================

/**
 * Обработчик логина
 */
async function handleLogin(req, res) {
    const { username, password, remember } = req.body;

    if (!verifyCredentials(username, password)) {
        authLogger.warn(`Неудачная попытка входа: ${username} (IP: ${req.ip})`);

        return res.render('admin/login', {
            title: 'Вход в админ-панель',
            error: 'Неверный логин или пароль',
            layout: false,
        });
    }

    createSession(req, username, 'admin');

    // Если "запомнить меня" — увеличиваем срок сессии
    if (remember) {
        req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
    }

    const redirectTo = req.session.returnTo || '/admin/dashboard';
    delete req.session.returnTo;

    return res.redirect(redirectTo);
}

/**
 * Обработчик логаута
 */
function handleLogout(req, res) {
    destroySession(req);
    res.redirect('/admin/login');
}

// ==================== ЗАЩИТА ОТ БРУТФОРСА ====================
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION = 15 * 60 * 1000; // 15 минут

function checkBruteForce(ip) {
    const now = Date.now();
    const key = `login_${ip}`;

    if (!loginAttempts.has(key)) {
        loginAttempts.set(key, { attempts: [], blockedUntil: null });
    }

    const data = loginAttempts.get(key);

    // Проверка блокировки
    if (data.blockedUntil && data.blockedUntil > now) {
        const remaining = Math.ceil((data.blockedUntil - now) / 60000);
        return { allowed: false, remaining };
    }

    // Очистка старых попыток (старше часа)
    data.attempts = data.attempts.filter(t => now - t < 3600000);

    if (data.attempts.length >= MAX_LOGIN_ATTEMPTS) {
        data.blockedUntil = now + LOGIN_BLOCK_DURATION;
        authLogger.warn(`Брутфорс-защита: IP ${ip} заблокирован на ${LOGIN_BLOCK_DURATION / 60000} мин`);
        return { allowed: false, remaining: Math.ceil(LOGIN_BLOCK_DURATION / 60000) };
    }

    return { allowed: true };
}

function recordLoginAttempt(ip) {
    const key = `login_${ip}`;
    if (!loginAttempts.has(key)) {
        loginAttempts.set(key, { attempts: [], blockedUntil: null });
    }
    loginAttempts.get(key).attempts.push(Date.now());
}

function resetLoginAttempts(ip) {
    loginAttempts.delete(`login_${ip}`);
}

// ==================== ОЧИСТКА СТАРЫХ СЕССИЙ ====================
function cleanupOldSessions() {
    try {
        const result = db.run(
            "DELETE FROM sessions WHERE expires < datetime('now')"
        );
        if (result.changes > 0) {
            authLogger.debug(`Очищено сессий: ${result.changes}`);
        }
    } catch (error) {
        authLogger.error(`Ошибка очистки сессий: ${error.message}`);
    }
}

// Запуск периодической очистки
setInterval(cleanupOldSessions, 3600000); // Раз в час

// ==================== ЭКСПОРТ ====================
module.exports = {
    isAuthenticated,
    isApiAuthenticated,
    requireRole,
    verifyCredentials,
    createSession,
    destroySession,
    validateApiToken,
    generateApiToken,
    handleLogin,
    handleLogout,
    checkBruteForce,
    recordLoginAttempt,
    resetLoginAttempts,
    cleanupOldSessions,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
};