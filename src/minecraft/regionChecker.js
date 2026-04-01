// src/minecraft/regionChecker.js
// Периодическая проверка регионов на соответствие владельцам

const utils = require('../shared/utils');

// Кэш для хранения информации о регионах
const regionCache = new Map(); // { regionName: { owner, members, lastCheck } }

// ============================================
// ОСНОВНАЯ ПРОВЕРКА ВСЕХ РЕГИОНОВ
// ============================================

async function checkAllRegions(bot, db, addLog) {
    try {
        addLog('🏠 Запуск проверки регионов...', 'debug');
        
        // Получаем все занятые имущества
        const properties = await db.all('SELECT id, owner_nick, type FROM property WHERE is_available = 0');
        
        if (!properties || properties.length === 0) {
            return;
        }
        
        let issuesFound = 0;
        
        for (const property of properties) {
            const regionName = `TRTR${property.id}`;
            const regionInfo = await checkRegion(bot, regionName);
            
            if (!regionInfo) {
                addLog(`⚠️ Регион ${regionName} не найден на сервере`, 'warn');
                continue;
            }
            
            // Проверяем, соответствует ли владелец
            if (!regionInfo.members.includes(property.owner_nick)) {
                addLog(`⚠️ Владелец ${property.owner_nick} не найден в регионе ${regionName}`, 'warn');
                
                // Восстанавливаем владельца
                bot.chat(`/rg addmember ${regionName} ${property.owner_nick}`);
                await utils.sleep(500);
                issuesFound++;
            }
            
            // Для квартир и домов проверяем сожителей
            if (property.type === 'apartment' || property.type === 'house') {
                const residents = await db.getPropertyResidents(property.id);
                
                for (const resident of residents) {
                    if (!regionInfo.members.includes(resident) && resident !== property.owner_nick) {
                        addLog(`⚠️ Сожитель ${resident} не найден в регионе ${regionName}`, 'warn');
                        bot.chat(`/rg addmember ${regionName} ${resident}`);
                        await utils.sleep(500);
                        issuesFound++;
                    }
                }
            }
        }
        
        if (issuesFound > 0) {
            addLog(`🏠 Проверка регионов завершена. Исправлено ${issuesFound} проблем.`, 'info');
        }
        
    } catch (error) {
        addLog(`❌ Ошибка проверки регионов: ${error.message}`, 'error');
    }
}

// ============================================
// ПРОВЕРКА ОДНОГО РЕГИОНА
// ============================================

async function checkRegion(bot, regionName) {
    // Проверяем кэш (не чаще раза в 5 минут)
    const cached = regionCache.get(regionName);
    if (cached && Date.now() - cached.lastCheck < 5 * 60 * 1000) {
        return cached;
    }
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve(null);
        }, 5000);
        
        const handler = (message) => {
            const msg = message.toString();
            
            // Парсим информацию о регионе
            // Формат: "Участники: ник1, ник2, ник3"
            const membersMatch = msg.match(/Участники:\s*(.+)/i);
            
            if (membersMatch) {
                clearTimeout(timeout);
                bot.removeListener('message', handler);
                
                const membersStr = membersMatch[1];
                const members = membersStr.split(',').map(m => m.trim());
                
                const regionInfo = {
                    regionName,
                    members,
                    lastCheck: Date.now()
                };
                
                regionCache.set(regionName, regionInfo);
                resolve(regionInfo);
            }
        };
        
        bot.once('message', handler);
        bot.chat(`/rg info ${regionName}`);
    });
}

// ============================================
// ВОССТАНОВЛЕНИЕ ВЛАДЕЛЬЦА В РЕГИОНЕ
// ============================================

async function restoreRegionOwner(bot, propertyId, owner, db, addLog) {
    const regionName = `TRTR${propertyId}`;
    
    addLog(`🏠 Восстановление владельца ${owner} в регионе ${regionName}`, 'info');
    
    bot.chat(`/rg addmember ${regionName} ${owner}`);
    await utils.sleep(1000);
    
    // Проверяем, что добавилось
    const regionInfo = await checkRegion(bot, regionName);
    if (regionInfo && regionInfo.members.includes(owner)) {
        addLog(`✅ Владелец ${owner} восстановлен в регионе ${regionName}`, 'success');
        return true;
    } else {
        addLog(`❌ Не удалось восстановить владельца ${owner} в регионе ${regionName}`, 'error');
        return false;
    }
}

// ============================================
// ПРОВЕРКА НАЛОГОВ НА ИМУЩЕСТВО
// ============================================

async function checkPropertyTaxes(bot, db, addLog) {
    try {
        const properties = await db.all('SELECT id, owner_nick, price, tax_accumulated, last_tax_pay FROM property WHERE is_available = 0');
        const taxRate = await db.getSetting('property_tax_rate') || 0.01;
        const now = new Date();
        
        for (const property of properties) {
            const lastPay = property.last_tax_pay ? new Date(property.last_tax_pay) : now;
            const monthsPassed = Math.max(0, (now - lastPay) / (30 * 24 * 60 * 60 * 1000));
            
            if (monthsPassed >= 1) {
                const monthlyTax = property.price * taxRate;
                const taxOwed = monthlyTax * Math.floor(monthsPassed);
                
                // Обновляем накопленный долг
                const newDebt = (property.tax_accumulated || 0) + taxOwed;
                await db.run('UPDATE property SET tax_accumulated = ?, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?', [newDebt, property.id]);
                
                // Если долг превышает 50% стоимости имущества, отправляем уведомление
                if (newDebt > property.price * 0.5) {
                    bot.chat(`/msg ${property.owner_nick} &c⚠️ ВНИМАНИЕ! Ваш долг по налогу за имущество #${property.id} составляет ${utils.formatMoney(newDebt)}!`);
                    bot.chat(`/msg ${property.owner_nick} &cОплатите налог командой &e/imnalog dep ${property.id} [сумма]`);
                }
                
                if (addLog) addLog(`💰 Начислен налог ${utils.formatMoney(taxOwed)} на имущество #${property.id} (долг: ${utils.formatMoney(newDebt)})`, 'info');
            }
        }
        
    } catch (error) {
        addLog(`❌ Ошибка проверки налогов: ${error.message}`, 'error');
    }
}

// ============================================
// ПРОВЕРКА ЛИЦЕНЗИЙ
// ============================================

async function checkLicenses(bot, db, addLog) {
    try {
        const licenses = await db.all('SELECT * FROM licenses WHERE is_active = 1 AND expires_at < datetime("now", "+2 days")');
        
        for (const license of licenses) {
            const expiresAt = new Date(license.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
            
            // Уведомляем за 2 дня, 1 день и в день истечения
            if (daysLeft === 2 && !license.last_reminded_at) {
                bot.chat(`/msg ${license.owner_nick} &c⚠️ Ваша лицензия на ${license.type} истекает через 2 дня!`);
                await db.run('UPDATE licenses SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?', [license.id]);
                
            } else if (daysLeft === 1) {
                bot.chat(`/msg ${license.owner_nick} &c⚠️⚠️ Ваша лицензия на ${license.type} истекает ЗАВТРА!`);
                
            } else if (daysLeft === 0) {
                bot.chat(`/msg ${license.owner_nick} &c❌ Ваша лицензия на ${license.type} ИСТЕКЛА! Продлите её в Discord.`);
                await db.run('UPDATE licenses SET is_active = 0 WHERE id = ?', [license.id]);
                
                // Если лицензия на бизнес/офис истекла, замораживаем имущество
                const property = await db.get('SELECT id FROM property WHERE owner_nick = ? AND type = ? AND is_available = 0', [license.owner_nick, license.type]);
                if (property) {
                    await db.run('UPDATE property SET is_available = 1, owner_nick = NULL WHERE id = ?', [property.id]);
                    bot.chat(`/msg ${license.owner_nick} &cВаш ${license.type} #${property.id} заморожен до продления лицензии!`);
                }
            }
        }
        
    } catch (error) {
        addLog(`❌ Ошибка проверки лицензий: ${error.message}`, 'error');
    }
}

// ============================================
// ЗАПУСК ПЕРИОДИЧЕСКИХ ПРОВЕРОК
// ============================================

function startPeriodicChecks(bot, db, addLog) {
    // Проверка регионов каждые 10 минут
    setInterval(() => {
        checkAllRegions(bot, db, addLog);
    }, 10 * 60 * 1000);
    
    // Проверка налогов каждые 30 минут
    setInterval(() => {
        checkPropertyTaxes(bot, db, addLog);
    }, 30 * 60 * 1000);
    
    // Проверка лицензий каждый час
    setInterval(() => {
        checkLicenses(bot, db, addLog);
    }, 60 * 60 * 1000);
    
    addLog('🏠 Система периодических проверок запущена', 'success');
}

module.exports = {
    checkAllRegions,
    checkRegion,
    restoreRegionOwner,
    checkPropertyTaxes,
    checkLicenses,
    startPeriodicChecks
};