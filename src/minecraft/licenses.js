// src/minecraft/licenses.js
const database = require('../database');
const logger = require('../shared/logger');
const utils = require('../shared/utils');

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

// Типы лицензий
const LICENSE_TYPES = {
    business: {
        name: 'Бизнес-лицензия',
        price: 800000,
        emoji: '🏪',
        color: colors.green,
        description: 'Позволяет открыть и вести бизнес'
    },
    office: {
        name: 'Офисная лицензия',
        price: 900000,
        emoji: '🏢',
        color: colors.aqua,
        description: 'Позволяет открыть и вести офис'
    }
};

const LICENSE_DURATION_DAYS = 7;

/**
 * Проверка наличия активной лицензии у игрока
 */
function hasActiveLicense(playerId, type) {
    try {
        const db = database.getDb();
        const now = new Date().toISOString();
        const license = db.prepare(`
            SELECT * FROM properties 
            WHERE owner = ? AND license_type = ? AND license_expires > datetime('now')
        `).get(playerId, type);
        return !!license;
    } catch (error) {
        logger.error('Ошибка проверки лицензии:', error);
        return false;
    }
}

/**
 * Получение активной лицензии игрока
 */
function getActiveLicense(playerId, type) {
    try {
        const db = database.getDb();
        const license = db.prepare(`
            SELECT * FROM properties 
            WHERE owner = ? AND license_type = ? AND license_expires > datetime('now')
        `).get(playerId, type);
        return license;
    } catch (error) {
        logger.error('Ошибка получения лицензии:', error);
        return null;
    }
}

/**
 * Получение всех лицензий игрока
 */
function getPlayerLicenses(playerId) {
    try {
        const db = database.getDb();
        const licenses = db.prepare(`
            SELECT * FROM properties 
            WHERE owner = ? AND license_type IS NOT NULL AND license_expires > datetime('now')
        `).all(playerId);
        return licenses;
    } catch (error) {
        logger.error('Ошибка получения лицензий игрока:', error);
        return [];
    }
}

/**
 * Покупка лицензии
 */
async function buyLicense(playerId, type, sendPrivate) {
    try {
        const rp = await database.getRPPlayerById(playerId);
        if (!rp) {
            return { success: false, message: formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red) };
        }
        
        const licenseType = LICENSE_TYPES[type];
        if (!licenseType) {
            return { success: false, message: formatMessage('❌', 'Неверный тип лицензии. Доступно: business, office', colors.red) };
        }
        
        const price = licenseType.price;
        if (rp.money < price) {
            const needed = price - rp.money;
            return { 
                success: false, 
                message: formatMessage('❌', `Недостаточно средств. Нужно ещё &e${needed.toLocaleString('ru-RU')}&r ₽. Стоимость: &e${price.toLocaleString('ru-RU')}&r ₽`, colors.red) 
            };
        }
        
        // Проверяем, есть ли уже активная лицензия
        const existingLicense = getActiveLicense(playerId, type);
        if (existingLicense) {
            const expiresDate = new Date(existingLicense.license_expires).toLocaleDateString('ru-RU');
            return { 
                success: false, 
                message: formatMessage('⚠️', `У вас уже есть активная лицензия на &e${licenseType.name}&r до &e${expiresDate}`, colors.yellow) 
            };
        }
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + LICENSE_DURATION_DAYS);
        const expiresDateStr = expiresAt.toLocaleDateString('ru-RU');
        
        // Списываем деньги
        await database.updatePlayerMoneyById(playerId, -price, `Покупка лицензии ${type}`, 'system');
        
        // Сохраняем лицензию в таблице properties
        const db = database.getDb();
        db.prepare(`
            INSERT INTO properties (type, price, owner, license_type, license_expires)
            VALUES (?, ?, ?, ?, ?)
        `).run(type === 'business' ? 'business' : 'office', price, playerId, type, expiresAt.toISOString());
        
        const lines = [
            `${colors.white}${licenseType.emoji} &l${licenseType.name}&r успешно приобретена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Стоимость: ${colors.green}${price.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Срок действия: ${colors.green}${LICENSE_DURATION_DAYS} дней`,
            `${colors.white}Действует до: ${colors.yellow}${expiresDateStr}`,
            `${colors.gold}────────────────────`,
            `${colors.white}${licenseType.description}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Для продления используйте: &e/renewlicense ${type}`
        ];
        
        const frame = createFrame(`✅ ПОКУПКА ЛИЦЕНЗИИ`, lines);
        if (sendPrivate) sendPrivate(frame);
        
        logger.info(`💰 Игрок ${playerId} купил лицензию ${type} за ${price}₽`);
        
        return { 
            success: true, 
            message: `Лицензия ${type} успешно приобретена!`, 
            expiresAt: expiresAt.toISOString(),
            price: price
        };
        
    } catch (error) {
        logger.error('Ошибка при покупке лицензии:', error);
        return { success: false, message: formatMessage('❌', 'Ошибка при покупке лицензии. Попробуйте позже.', colors.red) };
    }
}

/**
 * Продление лицензии
 */
async function renewLicense(playerId, type, sendPrivate) {
    try {
        const rp = await database.getRPPlayerById(playerId);
        if (!rp) {
            return { success: false, message: formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red) };
        }
        
        const licenseType = LICENSE_TYPES[type];
        if (!licenseType) {
            return { success: false, message: formatMessage('❌', 'Неверный тип лицензии. Доступно: business, office', colors.red) };
        }
        
        const existingLicense = getActiveLicense(playerId, type);
        if (!existingLicense) {
            return { 
                success: false, 
                message: formatMessage('❌', `У вас нет активной лицензии на &e${licenseType.name}&r. Используйте &e/buylicense ${type}`, colors.red) 
            };
        }
        
        const price = licenseType.price;
        if (rp.money < price) {
            const needed = price - rp.money;
            return { 
                success: false, 
                message: formatMessage('❌', `Недостаточно средств. Нужно ещё &e${needed.toLocaleString('ru-RU')}&r ₽. Стоимость продления: &e${price.toLocaleString('ru-RU')}&r ₽`, colors.red) 
            };
        }
        
        const oldExpiresDate = new Date(existingLicense.license_expires).toLocaleDateString('ru-RU');
        
        // Списываем деньги
        await database.updatePlayerMoneyById(playerId, -price, `Продление лицензии ${type}`, 'system');
        
        // Обновляем дату истечения
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + LICENSE_DURATION_DAYS);
        const newExpiresDateStr = newExpiresAt.toLocaleDateString('ru-RU');
        
        const db = database.getDb();
        db.prepare(`
            UPDATE properties SET license_expires = ? WHERE id = ?
        `).run(newExpiresAt.toISOString(), existingLicense.id);
        
        const lines = [
            `${colors.white}${licenseType.emoji} &l${licenseType.name}&r успешно продлена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Стоимость продления: ${colors.green}${price.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Старая дата: ${colors.red}${oldExpiresDate}`,
            `${colors.white}Новая дата: ${colors.green}${newExpiresDateStr}`,
            `${colors.white}Срок действия: ${colors.green}+${LICENSE_DURATION_DAYS} дней`,
            `${colors.gold}────────────────────`,
            `${colors.white}Следующее продление: &e/renewlicense ${type}`
        ];
        
        const frame = createFrame(`🔄 ПРОДЛЕНИЕ ЛИЦЕНЗИИ`, lines);
        if (sendPrivate) sendPrivate(frame);
        
        logger.info(`💰 Игрок ${playerId} продлил лицензию ${type} за ${price}₽`);
        
        return { 
            success: true, 
            message: `Лицензия ${type} успешно продлена!`,
            expiresAt: newExpiresAt.toISOString(),
            price: price
        };
        
    } catch (error) {
        logger.error('Ошибка при продлении лицензии:', error);
        return { success: false, message: formatMessage('❌', 'Ошибка при продлении лицензии. Попробуйте позже.', colors.red) };
    }
}

/**
 * Получение истекающих лицензий (для напоминаний)
 */
function getExpiringLicenses(daysBefore = 2) {
    try {
        const db = database.getDb();
        const now = new Date();
        const future = new Date(now.getTime() + daysBefore * 24 * 3600000).toISOString();
        
        const expiring = db.prepare(`
            SELECT p.*, cm.minecraft_nick, cm.discord_id 
            FROM properties p
            JOIN clan_members cm ON cm.id = p.owner
            WHERE p.license_type IS NOT NULL 
            AND p.license_expires IS NOT NULL
            AND date(p.license_expires) BETWEEN date('now') AND date('now', '+' || ? || ' days')
            AND p.license_expires > datetime('now')
        `).all(daysBefore);
        
        return expiring;
    } catch (error) {
        logger.error('Ошибка получения истекающих лицензий:', error);
        return [];
    }
}

/**
 * Проверка и отправка уведомлений об истекающих лицензиях
 */
async function checkAndNotifyExpiringLicenses(bot, sendPrivate, sendDiscord) {
    try {
        const expiring = getExpiringLicenses(2);
        
        for (const license of expiring) {
            const daysLeft = Math.ceil((new Date(license.license_expires) - new Date()) / (1000 * 60 * 60 * 24));
            const licenseType = LICENSE_TYPES[license.license_type];
            const typeName = licenseType?.name || license.license_type;
            const typeEmoji = licenseType?.emoji || '📄';
            const expiresDate = new Date(license.license_expires).toLocaleDateString('ru-RU');
            
            const lines = [
                `${colors.white}${typeEmoji} Ваша &l${typeName}&r истекает!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Истекает через: ${daysLeft <= 1 ? colors.red : colors.yellow}${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}`,
                `${colors.white}Дата истечения: ${colors.red}${expiresDate}`,
                `${colors.gold}────────────────────`,
                `${colors.white}Для продления используйте: &e/renewlicense ${license.license_type}`,
                `${colors.white}Стоимость продления: ${colors.green}${licenseType?.price?.toLocaleString('ru-RU') || '?'} ₽`
            ];
            
            const frame = createFrame(`⚠️ ПРЕДУПРЕЖДЕНИЕ О ЛИЦЕНЗИИ`, lines);
            
            // Уведомление в игре
            if (sendPrivate && license.minecraft_nick) {
                sendPrivate(license.minecraft_nick, frame);
            }
            
            // Уведомление в Discord
            if (sendDiscord && license.discord_id && global.botComponents?.discord) {
                try {
                    const user = await global.botComponents.discord.users.fetch(license.discord_id);
                    if (user) {
                        const discordMessage = `⚠️ **Внимание, ${license.minecraft_nick}!**\n\nВаша **${typeName}** истекает через **${daysLeft}** ${daysLeft === 1 ? 'день' : 'дня'} (${expiresDate}).\n\nПродлите её в игре командой \`/renewlicense ${license.license_type}\`.`;
                        await user.send(discordMessage);
                    }
                } catch (e) {
                    logger.debug(`Не удалось отправить уведомление в Discord для ${license.minecraft_nick}`);
                }
            }
            
            logger.info(`⚠️ Лицензия ${license.license_type} игрока ${license.minecraft_nick} истекает через ${daysLeft} дней`);
        }
        
    } catch (error) {
        logger.error('Ошибка проверки истекающих лицензий:', error);
    }
}

/**
 * Получение информации о лицензии
 */
function getLicenseInfo(license) {
    const licenseType = LICENSE_TYPES[license.license_type];
    const expiresDate = new Date(license.license_expires);
    const now = new Date();
    const daysLeft = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));
    
    return {
        type: license.license_type,
        typeName: licenseType?.name || license.license_type,
        typeEmoji: licenseType?.emoji || '📄',
        typeColor: licenseType?.color || colors.white,
        price: licenseType?.price || 0,
        expiresAt: license.license_expires,
        expiresDate: expiresDate.toLocaleDateString('ru-RU'),
        daysLeft: daysLeft,
        isExpiringSoon: daysLeft <= 3,
        isExpired: daysLeft <= 0
    };
}

/**
 * Запуск периодической проверки истекающих лицензий
 */
function startLicenseChecker(bot, sendPrivate, sendDiscord) {
    // Проверка каждые 12 часов
    setInterval(async () => {
        await checkAndNotifyExpiringLicenses(bot, sendPrivate, sendDiscord);
    }, 12 * 60 * 60 * 1000);
    
    logger.info('📋 Система проверки истекающих лицензий запущена');
}

module.exports = {
    LICENSE_TYPES,
    LICENSE_DURATION_DAYS,
    hasActiveLicense,
    getActiveLicense,
    getPlayerLicenses,
    buyLicense,
    renewLicense,
    getExpiringLicenses,
    checkAndNotifyExpiringLicenses,
    getLicenseInfo,
    startLicenseChecker
};