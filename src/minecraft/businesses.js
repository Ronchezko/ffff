// src/minecraft/businesses.js
// Управление бизнесами: доходы, налоги, улучшения

const utils = require('../shared/utils');

// Конфигурация бизнесов
const BUSINESS_CONFIG = {
    // Базовый доход в час (в зависимости от типа бизнеса)
    baseIncome: {
        small: 5000,
        medium: 15000,
        large: 30000
    },
    // Множители дохода от уровня
    levelMultipliers: {
        1: 0.5,
        2: 0.7,
        3: 0.85,
        4: 1.0,
        5: 1.2,
        6: 1.4,
        7: 1.6,
        8: 1.8,
        9: 2.0,
        10: 2.5
    },
    // Стоимость улучшения уровня
    upgradeCost: {
        1: 50000,
        2: 100000,
        3: 200000,
        4: 350000,
        5: 500000,
        6: 750000,
        7: 1000000,
        8: 1500000,
        9: 2000000,
        10: 3000000
    }
};

// ============================================
// РАСЧЁТ ДОХОДА БИЗНЕСА
// ============================================

async function calculateBusinessIncome(businessId, db) {
    const business = await db.get(`
        SELECT p.*, b.level, b.last_income_calc, b.total_income 
        FROM property p 
        LEFT JOIN businesses b ON p.id = b.property_id 
        WHERE p.id = ? AND p.type = 'business'
    `, [businessId]);
    
    if (!business || !business.owner_nick) return 0;
    
    const level = business.level || 1;
    const multiplier = BUSINESS_CONFIG.levelMultipliers[level] || 1.0;
    
    // Определяем размер бизнеса по цене
    let size = 'small';
    if (business.price >= 10000000) size = 'large';
    else if (business.price >= 5000000) size = 'medium';
    
    const baseIncome = BUSINESS_CONFIG.baseIncome[size];
    const hourlyIncome = Math.floor(baseIncome * multiplier);
    
    return hourlyIncome;
}

// ============================================
// НАЧИСЛЕНИЕ ДОХОДА ЗА ПЕРИОД
// ============================================

async function processBusinessIncome(bot, db, addLog) {
    try {
        const businesses = await db.all(`
            SELECT p.id, p.owner_nick, b.level, b.last_income_calc, b.total_income 
            FROM property p 
            JOIN businesses b ON p.id = b.property_id 
            WHERE p.is_available = 0 AND p.owner_nick IS NOT NULL
        `);
        
        const now = new Date();
        let totalPaid = 0;
        
        for (const business of businesses) {
            const lastCalc = business.last_income_calc ? new Date(business.last_income_calc) : now;
            const hoursPassed = Math.max(0, (now - lastCalc) / (60 * 60 * 1000));
            
            if (hoursPassed >= 1) {
                const hourlyIncome = await calculateBusinessIncome(business.id, db);
                const incomeEarned = Math.floor(hourlyIncome * Math.floor(hoursPassed));
                
                if (incomeEarned > 0) {
                    // Начисляем доход владельцу
                    await db.updateMoney(business.owner_nick, incomeEarned, 'business_income', 
                        `Доход от бизнеса #${business.id} за ${Math.floor(hoursPassed)} ч`, 'system');
                    
                    // Обновляем общий доход бизнеса
                    await db.run(`
                        UPDATE businesses SET 
                            total_income = total_income + ?,
                            last_income_calc = CURRENT_TIMESTAMP
                        WHERE property_id = ?
                    `, [incomeEarned, business.id]);
                    
                    totalPaid += incomeEarned;
                    
                    if (addLog) addLog(`💰 Бизнес #${business.id} принёс доход ${utils.formatMoney(incomeEarned)} владельцу ${business.owner_nick}`, 'debug');
                }
            }
        }
        
        if (totalPaid > 0) {
            addLog(`💰 Общий доход от бизнесов за час: ${utils.formatMoney(totalPaid)}`, 'info');
        }
        
    } catch (error) {
        addLog(`❌ Ошибка начисления дохода бизнесов: ${error.message}`, 'error');
    }
}

// ============================================
// УЛУЧШЕНИЕ БИЗНЕСА
// ============================================

async function upgradeBusiness(bot, sender, businessId, db, addLog) {
    const business = await db.get(`
        SELECT p.*, b.level 
        FROM property p 
        LEFT JOIN businesses b ON p.id = b.property_id 
        WHERE p.id = ? AND p.owner_nick = ? AND p.type = 'business'
    `, [businessId, sender]);
    
    if (!business) {
        bot.chat(`/msg ${sender} &cУ вас нет бизнеса с ID ${businessId}!`);
        return false;
    }
    
    const currentLevel = business.level || 1;
    
    if (currentLevel >= 10) {
        bot.chat(`/msg ${sender} &cВаш бизнес уже достиг максимального уровня!`);
        return false;
    }
    
    const nextLevel = currentLevel + 1;
    const cost = BUSINESS_CONFIG.upgradeCost[nextLevel];
    
    const profile = await db.getRPProfile(sender);
    if (!profile || profile.money < cost) {
        bot.chat(`/msg ${sender} &cНедостаточно средств! Улучшение до ${nextLevel} уровня стоит ${utils.formatMoney(cost)}`);
        return false;
    }
    
    // Списываем деньги
    await db.updateMoney(sender, -cost, 'business_upgrade', `Улучшение бизнеса #${businessId} до ${nextLevel} уровня`, 'system');
    
    // Обновляем уровень
    await db.run(`
        INSERT INTO businesses (property_id, level, last_income_calc) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(property_id) DO UPDATE SET level = ?, last_income_calc = CURRENT_TIMESTAMP
    `, [businessId, nextLevel, nextLevel]);
    
    const newIncome = await calculateBusinessIncome(businessId, db);
    
    bot.chat(`/msg ${sender} &a✅ Бизнес #${businessId} улучшен до ${nextLevel} уровня!`);
    bot.chat(`/msg ${sender} &7Теперь доход составляет ${utils.formatMoney(newIncome)}/час`);
    
    if (addLog) addLog(`📈 ${sender} улучшил бизнес #${businessId} до ${nextLevel} уровня за ${cost}`, 'success');
    
    return true;
}

// ============================================
// ПОЛУЧЕНИЕ ИНФОРМАЦИИ О БИЗНЕСЕ
// ============================================

async function getBusinessInfo(businessId, db) {
    const business = await db.get(`
        SELECT p.*, b.level, b.total_income, b.last_income_calc 
        FROM property p 
        LEFT JOIN businesses b ON p.id = b.property_id 
        WHERE p.id = ? AND p.type = 'business'
    `, [businessId]);
    
    if (!business) return null;
    
    const level = business.level || 1;
    const hourlyIncome = await calculateBusinessIncome(businessId, db);
    const upgradeCost = level < 10 ? BUSINESS_CONFIG.upgradeCost[level + 1] : null;
    
    return {
        id: business.id,
        owner: business.owner_nick,
        price: business.price,
        level,
        hourlyIncome,
        totalIncome: business.total_income || 0,
        upgradeCost,
        isMaxLevel: level >= 10
    };
}

// ============================================
// ЗАПУСК ПЕРИОДИЧЕСКОГО НАЧИСЛЕНИЯ
// ============================================

function startBusinessIncomeLoop(bot, db, addLog) {
    // Начисляем доход каждый час
    setInterval(() => {
        processBusinessIncome(bot, db, addLog);
    }, 60 * 60 * 1000);
    
    addLog('🏪 Система доходов бизнесов запущена', 'success');
}

module.exports = {
    calculateBusinessIncome,
    processBusinessIncome,
    upgradeBusiness,
    getBusinessInfo,
    startBusinessIncomeLoop,
    BUSINESS_CONFIG
};