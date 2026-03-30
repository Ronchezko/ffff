// src/minecraft/business.js
const database = require('../database');
const logger = require('../shared/logger');
const utils = require('../shared/utils');
const licenses = require('./licenses');

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

// Типы бизнесов и их доходность
const BUSINESS_TYPES = {
    default: {
        name: 'Стандартный бизнес',
        baseIncome: 5000,
        multiplier: 1.0,
        emoji: '🏪',
        color: colors.gray
    },
    shop: {
        name: 'Магазин',
        baseIncome: 6000,
        multiplier: 1.2,
        emoji: '🏬',
        color: colors.green
    },
    restaurant: {
        name: 'Ресторан',
        baseIncome: 8000,
        multiplier: 1.6,
        emoji: '🍽️',
        color: colors.yellow
    },
    cafe: {
        name: 'Кафе',
        baseIncome: 7000,
        multiplier: 1.4,
        emoji: '☕',
        color: colors.aqua
    },
    hotel: {
        name: 'Отель',
        baseIncome: 9000,
        multiplier: 1.8,
        emoji: '🏨',
        color: colors.light_purple
    },
    factory: {
        name: 'Завод',
        baseIncome: 10000,
        multiplier: 2.0,
        emoji: '🏭',
        color: colors.red
    }
};

const BUSINESS_INCOME = {
    default: 5000,
    shop: 6000,
    restaurant: 8000,
    cafe: 7000,
    hotel: 9000,
    factory: 10000
};

/**
 * Получение дохода бизнеса за период
 */
function getBusinessIncome(propertyId, period, customRate = null) {
    try {
        const prop = database.getProperty(propertyId);
        if (!prop || prop.type !== 'business') return 0;
        
        const hours = {
            '1h': 1,
            '1d': 24,
            '1w': 168,
            '1m': 720,
            'all': 720
        }[period] || 1;
        
        // Определяем тип бизнеса (если есть)
        let businessType = 'default';
        try {
            const profitData = JSON.parse(prop.profit_data || '{}');
            businessType = profitData.business_type || 'default';
        } catch (e) {}
        
        const baseRate = BUSINESS_INCOME[businessType] || BUSINESS_INCOME.default;
        const rate = customRate !== null ? customRate : baseRate;
        
        return rate * hours;
        
    } catch (error) {
        logger.error('Ошибка получения дохода бизнеса:', error);
        return 0;
    }
}

/**
 * Получение информации о бизнесе
 */
function getBusinessInfo(propertyId) {
    try {
        const prop = database.getProperty(propertyId);
        if (!prop || prop.type !== 'business') return null;
        
        let businessType = 'default';
        try {
            const profitData = JSON.parse(prop.profit_data || '{}');
            businessType = profitData.business_type || 'default';
        } catch (e) {}
        
        const typeData = BUSINESS_TYPES[businessType] || BUSINESS_TYPES.default;
        const hourlyIncome = typeData.baseIncome;
        const dailyIncome = hourlyIncome * 24;
        const weeklyIncome = dailyIncome * 7;
        
        // Проверка наличия лицензии
        const hasLicense = licenses.hasActiveLicense(prop.owner, 'business');
        const licenseInfo = hasLicense ? licenses.getActiveLicense(prop.owner, 'business') : null;
        
        return {
            id: prop.id,
            owner: prop.owner,
            type: businessType,
            typeName: typeData.name,
            typeEmoji: typeData.emoji,
            typeColor: typeData.color,
            price: prop.price,
            hourlyIncome: hourlyIncome,
            dailyIncome: dailyIncome,
            weeklyIncome: weeklyIncome,
            hasLicense: hasLicense,
            licenseExpires: licenseInfo?.license_expires,
            purchasedAt: prop.purchased_at,
            lastTaxPaid: prop.last_tax_paid
        };
        
    } catch (error) {
        logger.error('Ошибка получения информации о бизнесе:', error);
        return null;
    }
}

/**
 * Начислить доход за час (вызывается из PayDay)
 */
async function applyHourlyIncome(bot, logCallback, sendPrivate) {
    try {
        const db = database.getDb();
        const businesses = db.prepare(`
            SELECT p.*, cm.minecraft_nick 
            FROM properties p
            JOIN clan_members cm ON cm.id = p.owner
            WHERE p.type = 'business' AND p.owner IS NOT NULL
        `).all();
        
        let totalPaid = 0;
        let paidCount = 0;
        let noLicenseCount = 0;
        
        for (const biz of businesses) {
            // Проверяем наличие активной лицензии
            if (!licenses.hasActiveLicense(biz.owner, 'business')) {
                noLicenseCount++;
                if (logCallback) {
                    logCallback(`⚠️ Бизнес #${biz.id} (${biz.minecraft_nick}) не получил доход: нет лицензии`, 'warn');
                }
                continue;
            }
            
            // Определяем тип бизнеса
            let businessType = 'default';
            try {
                const profitData = JSON.parse(biz.profit_data || '{}');
                businessType = profitData.business_type || 'default';
            } catch (e) {}
            
            const income = BUSINESS_INCOME[businessType] || BUSINESS_INCOME.default;
            
            // Начисляем доход
            await database.updatePlayerMoney(biz.minecraft_nick, income, `Доход бизнеса #${biz.id}`, 'system');
            totalPaid += income;
            paidCount++;
            
            // Логируем доход
            db.prepare('INSERT INTO money_logs (player, amount, reason, issued_by, timestamp) VALUES (?, ?, ?, ?, datetime("now"))')
                .run(biz.minecraft_nick, income, `Доход бизнеса #${biz.id}`, 'system');
            
            // Отправляем уведомление игроку, если он онлайн
            if (bot && bot.players && bot.players[biz.minecraft_nick] && sendPrivate) {
                setTimeout(() => {
                    const lines = [
                        `${colors.white}Ваш бизнес #${biz.id} принёс доход!`,
                        `${colors.gold}────────────────────`,
                        `${colors.white}Тип: ${colors.green}${BUSINESS_TYPES[businessType]?.name || 'Стандартный'}`,
                        `${colors.white}Доход: ${colors.green}${income.toLocaleString('ru-RU')} ₽`,
                        `${colors.white}Время: ${colors.yellow}${new Date().toLocaleTimeString('ru-RU')}`
                    ];
                    const frame = createFrame(`💰 ДОХОД БИЗНЕСА`, lines);
                    sendPrivate(biz.minecraft_nick, frame);
                }, 1000);
            }
        }
        
        if (paidCount > 0 && logCallback) {
            const lines = [
                `${colors.white}Начислен доход бизнесам!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Всего бизнесов: ${colors.green}${businesses.length}`,
                `${colors.white}Получили доход: ${colors.green}${paidCount}`,
                `${colors.white}Без лицензии: ${colors.red}${noLicenseCount}`,
                `${colors.white}Общая сумма: ${colors.green}${totalPaid.toLocaleString('ru-RU')} ₽`
            ];
            const frame = createFrame(`💰 ДОХОД БИЗНЕСОВ`, lines);
            logCallback(frame, 'success');
        }
        
        return { paidCount, totalPaid, noLicenseCount };
        
    } catch (error) {
        logger.error('Ошибка начисления дохода бизнесам:', error);
        if (logCallback) logCallback(`❌ Ошибка начисления дохода: ${error.message}`, 'error');
        return { paidCount: 0, totalPaid: 0, noLicenseCount: 0 };
    }
}

/**
 * Обновление типа бизнеса (для будущего расширения)
 */
async function setBusinessType(propertyId, businessType, sendPrivate) {
    try {
        const prop = database.getProperty(propertyId);
        if (!prop || prop.type !== 'business') {
            return { success: false, message: 'Бизнес не найден' };
        }
        
        if (!BUSINESS_TYPES[businessType]) {
            const types = Object.keys(BUSINESS_TYPES).join(', ');
            return { success: false, message: `Неверный тип. Доступно: ${types}` };
        }
        
        const db = database.getDb();
        let profitData = {};
        try {
            profitData = JSON.parse(prop.profit_data || '{}');
        } catch (e) {}
        
        profitData.business_type = businessType;
        
        db.prepare(`
            UPDATE properties SET profit_data = ? WHERE id = ?
        `).run(JSON.stringify(profitData), propertyId);
        
        const typeData = BUSINESS_TYPES[businessType];
        
        const lines = [
            `${colors.white}Тип бизнеса #${propertyId} изменён!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Новый тип: ${typeData.color}${typeData.name} ${typeData.emoji}`,
            `${colors.white}Доход в час: ${colors.green}${typeData.baseIncome.toLocaleString('ru-RU')} ₽`,
            `${colors.white}Доход в день: ${colors.green}${(typeData.baseIncome * 24).toLocaleString('ru-RU')} ₽`
        ];
        
        const frame = createFrame(`🏪 ИЗМЕНЕНИЕ ТИПА БИЗНЕСА`, lines);
        if (sendPrivate) sendPrivate(frame);
        
        return { success: true, businessType };
        
    } catch (error) {
        logger.error('Ошибка изменения типа бизнеса:', error);
        return { success: false, message: 'Ошибка изменения типа' };
    }
}

/**
 * Получение статистики бизнеса за период
 */
async function getBusinessStats(propertyId, period = 'all') {
    try {
        const info = getBusinessInfo(propertyId);
        if (!info) return null;
        
        const db = database.getDb();
        const hours = {
            '1h': 1,
            '1d': 24,
            '1w': 168,
            '1m': 720,
            'all': 720
        }[period] || 1;
        
        // Получаем реальные доходы из логов
        const logs = db.prepare(`
            SELECT SUM(amount) as total_income, COUNT(*) as transactions
            FROM money_logs 
            WHERE reason LIKE ? AND timestamp > datetime('now', '-' || ? || ' hours')
        `).get(`%бизнеса #${propertyId}%`, hours);
        
        const expectedIncome = info.hourlyIncome * hours;
        const actualIncome = logs?.total_income || 0;
        const efficiency = expectedIncome > 0 ? (actualIncome / expectedIncome * 100).toFixed(1) : 0;
        
        return {
            ...info,
            period: period,
            hours: hours,
            expectedIncome: expectedIncome,
            actualIncome: actualIncome,
            transactions: logs?.transactions || 0,
            efficiency: parseFloat(efficiency)
        };
        
    } catch (error) {
        logger.error('Ошибка получения статистики бизнеса:', error);
        return null;
    }
}

/**
 * Формирование отчёта по бизнесу
 */
async function getBusinessReport(propertyId, period, sendPrivate) {
    const stats = await getBusinessStats(propertyId, period);
    if (!stats) {
        if (sendPrivate) sendPrivate(formatMessage('❌', 'Бизнес не найден или это не бизнес!', colors.red));
        return;
    }
    
    const periodNames = {
        '1h': 'последний час',
        '1d': 'последний день',
        '1w': 'последнюю неделю',
        '1m': 'последний месяц',
        'all': 'всё время'
    };
    
    const efficiencyColor = stats.efficiency >= 80 ? colors.green : (stats.efficiency >= 50 ? colors.yellow : colors.red);
    
    const lines = [
        `${colors.white}${stats.typeEmoji} &l${stats.typeName} #${stats.id}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Владелец: ${colors.yellow}${stats.owner}`,
        `${colors.white}Период: ${colors.green}${periodNames[period] || period}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Ожидаемый доход: ${colors.green}${stats.expectedIncome.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Фактический доход: ${colors.green}${stats.actualIncome.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Эффективность: ${efficiencyColor}${stats.efficiency}%`,
        `${colors.white}Транзакций: ${colors.yellow}${stats.transactions}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Доход в час: ${colors.green}${stats.hourlyIncome.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Доход в день: ${colors.green}${stats.dailyIncome.toLocaleString('ru-RU')} ₽`,
        `${colors.white}Доход в неделю: ${colors.green}${stats.weeklyIncome.toLocaleString('ru-RU')} ₽`
    ];
    
    if (!stats.hasLicense) {
        lines.push(`${colors.gold}────────────────────`);
        lines.push(`${colors.red}⚠️ НЕТ АКТИВНОЙ ЛИЦЕНЗИИ! ⚠️`);
        lines.push(`${colors.white}Для получения дохода используйте: &e/buylicense business`);
    } else if (stats.licenseExpires) {
        const expiresDate = new Date(stats.licenseExpires).toLocaleDateString('ru-RU');
        lines.push(`${colors.gold}────────────────────`);
        lines.push(`${colors.white}Лицензия до: ${colors.yellow}${expiresDate}`);
    }
    
    const frame = createFrame(`📊 ФИНАНСОВЫЙ ОТЧЁТ БИЗНЕСА`, lines);
    if (sendPrivate) sendPrivate(frame);
    
    return stats;
}

module.exports = {
    BUSINESS_TYPES,
    BUSINESS_INCOME,
    getBusinessIncome,
    getBusinessInfo,
    applyHourlyIncome,
    setBusinessType,
    getBusinessStats,
    getBusinessReport
};