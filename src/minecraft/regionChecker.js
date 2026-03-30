// src/minecraft/regionChecker.js
const logger = require('../shared/logger');
const database = require('../database');

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

let bot = null;
let pendingRegionChecks = new Map();
let regionCache = new Map();

// Префикс региона (должен совпадать с property.js)
const REGION_PREFIX = 'TRTR';

/**
 * Инициализация модуля
 */
function init(minecraftBot) {
    bot = minecraftBot;
    logger.info('🏷️ Система проверки регионов инициализирована');
    if (bot) {
        setupMessageListener();
    }
}

/**
 * Настройка обработчика сообщений для ответов на /rg i
 */
function setupMessageListener() {
    if (!bot) return;
    
    bot.on('message', (jsonMsg) => {
        let text = '';
        try {
            if (typeof jsonMsg === 'string') {
                text = jsonMsg;
            } else if (jsonMsg.toString) {
                text = jsonMsg.toString();
            } else {
                text = String(jsonMsg);
            }
            text = text.replace(/§[0-9a-fklmnor]/g, '');
        } catch (e) {
            text = String(jsonMsg);
        }
        
        // Обработка ответов на /rg i
        const regionMatch = text.match(/Информация о регионе '([^']+)'/);
        if (regionMatch) {
            const regionName = regionMatch[1];
            const pending = pendingRegionChecks.get(regionName);
            if (pending) {
                clearTimeout(pending.timeout);
                parseRegionInfo(text, regionName, pending.callback);
                pendingRegionChecks.delete(regionName);
            }
            return;
        }
        
        // Обработка ошибки "регион не найден"
        const notFoundMatch = text.match(/Регион '([^']+)' не найден/);
        if (notFoundMatch) {
            const regionName = notFoundMatch[1];
            const pending = pendingRegionChecks.get(regionName);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.callback(false, null);
                pendingRegionChecks.delete(regionName);
            }
            return;
        }
        
        // Обработка информации об участниках региона
        const membersMatch = text.match(/Участники: (.+)/);
        if (membersMatch && text.includes('Информация о регионе')) {
            // Это уже обработано в регионе выше
        }
    });
}

/**
 * Парсинг информации о регионе
 */
function parseRegionInfo(message, regionName, callback) {
    try {
        const info = {
            name: regionName,
            exists: true,
            owner: null,
            members: [],
            flags: {},
            priority: 0
        };
        
        // Поиск владельца
        const ownerMatch = message.match(/Владелец: ([^\n]+)/);
        if (ownerMatch) {
            info.owner = ownerMatch[1].trim();
        }
        
        // Поиск участников
        const membersMatch = message.match(/Участники: ([^\n]+)/);
        if (membersMatch) {
            const membersStr = membersMatch[1];
            info.members = membersStr.split(',').map(m => m.trim()).filter(m => m && m !== info.owner);
        }
        
        // Поиск флагов
        const flagsMatch = message.match(/Флаги: ([^\n]+)/);
        if (flagsMatch) {
            const flagsStr = flagsMatch[1];
            const flagPairs = flagsStr.split(',').map(f => f.trim());
            for (const pair of flagPairs) {
                const [flag, value] = pair.split(':');
                if (flag && value) {
                    info.flags[flag.trim()] = value.trim();
                }
            }
        }
        
        // Поиск приоритета
        const priorityMatch = message.match(/Приоритет: (\d+)/);
        if (priorityMatch) {
            info.priority = parseInt(priorityMatch[1]);
        }
        
        // Кэшируем информацию
        regionCache.set(regionName, {
            ...info,
            cachedAt: Date.now()
        });
        
        callback(true, info);
        
    } catch (error) {
        logger.error(`Ошибка парсинга информации о регионе ${regionName}:`, error);
        callback(false, null);
    }
}

/**
 * Проверка существования региона
 * @param {string} regionName - название региона
 * @param {Function} callback - callback(exists, info)
 * @param {number} timeoutMs - таймаут ожидания ответа (мс)
 */
function checkRegionExists(regionName, callback, timeoutMs = 5000) {
    if (!bot || !bot.chat) {
        callback(false, null);
        return;
    }
    
    // Проверяем кэш (актуально 5 минут)
    const cached = regionCache.get(regionName);
    if (cached && Date.now() - cached.cachedAt < 300000) {
        callback(true, cached);
        return;
    }
    
    // Удаляем старый pending запрос
    if (pendingRegionChecks.has(regionName)) {
        const old = pendingRegionChecks.get(regionName);
        clearTimeout(old.timeout);
        pendingRegionChecks.delete(regionName);
    }
    
    // Создаём новый запрос
    const timeout = setTimeout(() => {
        if (pendingRegionChecks.has(regionName)) {
            pendingRegionChecks.delete(regionName);
            logger.warn(`⏰ Таймаут проверки региона ${regionName}`);
            callback(false, null);
        }
    }, timeoutMs);
    
    pendingRegionChecks.set(regionName, {
        timeout,
        callback
    });
    
    // Отправляем запрос
    bot.chat(`/rg i ${regionName}`);
}

/**
 * Проверка региона по ID имущества
 * @param {number} propertyId - ID имущества
 * @param {Function} callback - callback(exists, info)
 */
function checkRegionByPropertyId(propertyId, callback) {
    const regionName = `${REGION_PREFIX}${propertyId}`;
    checkRegionExists(regionName, callback);
}

/**
 * Получение информации о регионе из кэша
 */
function getRegionInfo(regionName) {
    return regionCache.get(regionName) || null;
}

/**
 * Получение информации о регионе по ID имущества
 */
function getRegionInfoByPropertyId(propertyId) {
    const regionName = `${REGION_PREFIX}${propertyId}`;
    return regionCache.get(regionName) || null;
}

/**
 * Обновление информации о регионе
 */
async function refreshRegionInfo(regionName) {
    return new Promise((resolve) => {
        checkRegionExists(regionName, (exists, info) => {
            resolve(info);
        });
    });
}

/**
 * Проверка, является ли игрок владельцем региона
 */
function isRegionOwner(regionName, playerNickname) {
    const info = regionCache.get(regionName);
    if (!info) return false;
    return info.owner === playerNickname;
}

/**
 * Проверка, является ли игрок участником региона
 */
function isRegionMember(regionName, playerNickname) {
    const info = regionCache.get(regionName);
    if (!info) return false;
    return info.owner === playerNickname || info.members.includes(playerNickname);
}

/**
 * Получение списка участников региона
 */
function getRegionMembers(regionName) {
    const info = regionCache.get(regionName);
    if (!info) return [];
    return [info.owner, ...info.members];
}

/**
 * Проверка всех регионов клана (периодическая)
 */
async function checkAllRegions(botInstance, logCallback) {
    bot = botInstance || bot;
    if (!bot) {
        if (logCallback) logCallback('❌ Бот не инициализирован для проверки регионов', 'error');
        return;
    }
    
    try {
        const db = database.getDb();
        const properties = db.prepare(`
            SELECT id, owner, type FROM properties WHERE owner IS NOT NULL
        `).all();
        
        if (properties.length === 0) {
            if (logCallback) logCallback('🏷️ Нет имущества для проверки регионов', 'info');
            return;
        }
        
        let checked = 0;
        let failed = 0;
        
        if (logCallback) logCallback(`🔍 Начинаю проверку ${properties.length} регионов...`, 'info');
        
        for (const property of properties) {
            const regionName = `${REGION_PREFIX}${property.id}`;
            
            await new Promise((resolve) => {
                checkRegionExists(regionName, (exists, info) => {
                    checked++;
                    if (!exists) {
                        failed++;
                        if (logCallback) {
                            logCallback(`⚠️ Регион ${regionName} (имущество #${property.id}) не найден! Владелец: ${property.owner}`, 'warn');
                        }
                        
                        // Отправляем уведомление в Discord
                        const member = db.prepare('SELECT discord_id FROM clan_members WHERE minecraft_nick = ?').get(property.owner);
                        if (member?.discord_id && global.botComponents?.discord) {
                            global.botComponents.discord.users.fetch(member.discord_id).then(user => {
                                user?.send(`⚠️ **Внимание!** Регион вашего имущества **#${property.id}** (${regionName}) не найден на сервере. Обратитесь к администрации.`);
                            }).catch(() => {});
                        }
                    }
                    resolve();
                }, 3000);
            });
            
            // Небольшая задержка между запросами
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const lines = [
            `${colors.white}Проверка регионов завершена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Всего проверено: ${colors.green}${checked}`,
            `${colors.white}Ошибок: ${failed > 0 ? colors.red : colors.green}${failed}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Дата проверки: ${colors.yellow}${new Date().toLocaleString('ru-RU')}`
        ];
        const frame = createFrame(`🔍 ПРОВЕРКА РЕГИОНОВ`, lines);
        
        if (logCallback) logCallback(frame, 'info');
        
    } catch (error) {
        logger.error('Ошибка при проверке регионов:', error);
        if (logCallback) logCallback(`❌ Ошибка проверки регионов: ${error.message}`, 'error');
    }
}

/**
 * Проверка конкретного региона
 */
async function checkRegion(regionName, callback, logCallback) {
    return new Promise((resolve) => {
        checkRegionExists(regionName, (exists, info) => {
            if (callback) callback(exists, info);
            
            if (logCallback) {
                if (exists && info) {
                    const lines = [
                        `${colors.white}Регион: ${colors.aqua}${info.name}`,
                        `${colors.white}Владелец: ${colors.yellow}${info.owner || 'нет'}`,
                        `${colors.white}Участники: ${colors.green}${info.members.length}`,
                        `${colors.white}Приоритет: ${colors.gray}${info.priority}`
                    ];
                    const frame = createFrame(`🔍 ИНФОРМАЦИЯ О РЕГИОНЕ`, lines);
                    logCallback(frame, 'info');
                } else {
                    logCallback(formatMessage('❌', `Регион &e${regionName}&r не найден!`, colors.red), 'warn');
                }
            }
            
            resolve({ exists, info });
        });
    });
}

/**
 * Очистка кэша регионов
 */
function clearRegionCache() {
    regionCache.clear();
    logger.info('🧹 Кэш регионов очищен');
}

/**
 * Получение списка всех зарегистрированных регионов в кэше
 */
function getAllCachedRegions() {
    return Array.from(regionCache.entries()).map(([name, info]) => ({
        name,
        owner: info.owner,
        members: info.members,
        priority: info.priority,
        cachedAt: info.cachedAt
    }));
}

module.exports = {
    init,
    checkAllRegions,
    checkRegion,
    checkRegionExists,
    checkRegionByPropertyId,
    parseRegionInfo,
    getRegionInfo,
    getRegionInfoByPropertyId,
    refreshRegionInfo,
    isRegionOwner,
    isRegionMember,
    getRegionMembers,
    clearRegionCache,
    getAllCachedRegions,
    REGION_PREFIX
};