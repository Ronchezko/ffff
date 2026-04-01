// src/minecraft/licenses.js
// Управление лицензиями на бизнес и офисы

const utils = require('../shared/utils');

// Цены на лицензии
const LICENSE_PRICES = {
    business: 800000,
    office: 900000
};

// Срок действия лицензии (7 дней)
const LICENSE_DURATION_DAYS = 7;

// ============================================
// ВЫДАЧА ЛИЦЕНЗИИ
// ============================================

async function issueLicense(bot, playerNick, type, db, addLog) {
    const price = LICENSE_PRICES[type];
    if (!price) {
        return { success: false, reason: 'Неизвестный тип лицензии' };
    }
    
    // Проверяем баланс
    const profile = await db.getRPProfile(playerNick);
    if (!profile) {
        return { success: false, reason: 'Вы не зарегистрированы в RolePlay' };
    }
    
    if (profile.money < price) {
        return { success: false, reason: `Недостаточно средств. Нужно ${utils.formatMoney(price)}` };
    }
    
    // Проверяем, нет ли уже активной лицензии
    const existing = await db.get('SELECT * FROM licenses WHERE owner_nick = ? AND type = ? AND is_active = 1', [playerNick, type]);
    if (existing) {
        return { success: false, reason: 'У вас уже есть активная лицензия этого типа' };
    }
    
    // Списываем деньги
    await db.updateMoney(playerNick, -price, 'license', `Покупка лицензии на ${type}`, 'system');
    
    // Создаём лицензию
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LICENSE_DURATION_DAYS);
    
    await db.run(
        `INSERT INTO licenses (owner_nick, type, issued_at, expires_at, is_active, price_paid)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1, ?)`,
        [playerNick, type, expiresAt.toISOString(), price]
    );
    
    bot.chat(`/msg ${playerNick} &a✅ Вы приобрели лицензию на ${getLicenseTypeName(type)} за ${utils.formatMoney(price)}!`);
    bot.chat(`/msg ${playerNick} &7Лицензия действует до ${expiresAt.toLocaleDateString()}`);
    
    if (addLog) addLog(`📜 Выдана лицензия ${playerNick} на ${type} за ${price}`, 'success');
    
    return { success: true };
}

// ============================================
// ПРОВЕРКА АКТИВНОСТИ ЛИЦЕНЗИИ
// ============================================

async function hasActiveLicense(playerNick, type, db) {
    const license = await db.get(
        `SELECT * FROM licenses WHERE owner_nick = ? AND type = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [playerNick, type]
    );
    return !!license;
}

// ============================================
// ПОЛУЧЕНИЕ ИНФОРМАЦИИ О ЛИЦЕНЗИИ
// ============================================

async function getLicenseInfo(playerNick, type, db) {
    const license = await db.get(
        `SELECT * FROM licenses WHERE owner_nick = ? AND type = ? AND is_active = 1`,
        [playerNick, type]
    );
    
    if (!license) {
        return null;
    }
    
    const expiresAt = new Date(license.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
    
    return {
        type: license.type,
        issuedAt: license.issued_at,
        expiresAt: license.expires_at,
        daysLeft,
        isActive: daysLeft > 0
    };
}

// ============================================
// ПРОДЛЕНИЕ ЛИЦЕНЗИИ
// ============================================

async function renewLicense(playerNick, type, db, addLog) {
    const price = LICENSE_PRICES[type];
    
    // Проверяем существующую лицензию
    const existing = await db.get(
        `SELECT * FROM licenses WHERE owner_nick = ? AND type = ? AND is_active = 1`,
        [playerNick, type]
    );
    
    if (!existing) {
        return { success: false, reason: 'У вас нет активной лицензии этого типа' };
    }
    
    // Проверяем баланс
    const profile = await db.getRPProfile(playerNick);
    if (!profile || profile.money < price) {
        return { success: false, reason: `Недостаточно средств. Нужно ${utils.formatMoney(price)}` };
    }
    
    // Списываем деньги
    await db.updateMoney(playerNick, -price, 'license', `Продление лицензии на ${type}`, 'system');
    
    // Продлеваем лицензию
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + LICENSE_DURATION_DAYS);
    
    await db.run(
        `UPDATE licenses SET expires_at = ?, issued_at = CURRENT_TIMESTAMP, price_paid = price_paid + ?, last_reminded_at = NULL
         WHERE id = ?`,
        [newExpiresAt.toISOString(), price, existing.id]
    );
    
    bot.chat(`/msg ${playerNick} &a✅ Лицензия на ${getLicenseTypeName(type)} продлена до ${newExpiresAt.toLocaleDateString()}`);
    
    if (addLog) addLog(`📜 Продлена лицензия ${playerNick} на ${type}`, 'info');
    
    return { success: true };
}

// ============================================
// ПОЛУЧЕНИЕ ТИПА ЛИЦЕНЗИИ ДЛЯ ОТОБРАЖЕНИЯ
// ============================================

function getLicenseTypeName(type) {
    const names = {
        'business': 'бизнес',
        'office': 'офис'
    };
    return names[type] || type;
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    issueLicense,
    hasActiveLicense,
    getLicenseInfo,
    renewLicense,
    LICENSE_PRICES,
    LICENSE_DURATION_DAYS,
    getLicenseTypeName
};