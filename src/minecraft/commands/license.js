// src/minecraft/commands/license.js
const utils = require('../../shared/utils');
const database = require('../../database');
const cleanNick = require('../../shared/cleanNick'); 
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
    BUSINESS: 'business',
    OFFICE: 'office'
};

// Стоимость лицензий (в ₽)
const LICENSE_PRICES = {
    business: 800000,
    office: 900000
};

// Длительность лицензии (дней)
const LICENSE_DURATION = 7;

// Типы офисов
const OFFICE_TYPES = {
    CRYPTO: 'crypto',
    IT: 'it',
    MARKETING: 'marketing',
    CONSULTING: 'consulting'
};

const OFFICE_TYPE_NAMES = {
    crypto: '🏭 Крипто-майнинг',
    it: '💻 IT-разработка',
    marketing: '📢 Маркетинговое агентство',
    consulting: '📊 Консалтинг'
};

const OFFICE_TYPE_COLORS = {
    crypto: colors.green,
    it: colors.aqua,
    marketing: colors.yellow,
    consulting: colors.light_purple
};

/**
 * Покупка лицензии на бизнес или офис
 */
async function buyLicense(bot, player, type, db, logCallback, sendPrivate) {
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay. Используйте &e/rp&r!', colors.red));
        return;
    }
    
    const price = LICENSE_PRICES[type];
    if (!price) {
        sendPrivate(player, formatMessage('❌', 'Неверный тип лицензии. Доступно: &ebusiness&r, &eoffice', colors.red));
        return;
    }
    
    if (rpPlayer.money < price) {
        const needed = price - rpPlayer.money;
        sendPrivate(player, formatMessage('❌', `Недостаточно средств. Нужно ещё &e${needed.toLocaleString('ru-RU')}&r ₽. Стоимость: &e${price.toLocaleString('ru-RU')}&r ₽`, colors.red));
        return;
    }
    
    // Проверяем, есть ли уже активная лицензия
    const existingLicense = db.prepare(`
        SELECT * FROM properties 
        WHERE owner = ? AND license_type = ? AND license_expires > datetime('now')
    `).get(player, type);
    
    if (existingLicense) {
        const expiresDate = new Date(existingLicense.license_expires).toLocaleDateString('ru-RU');
        sendPrivate(player, formatMessage('⚠️', `У вас уже есть активная лицензия на &e${type === 'business' ? 'бизнес' : 'офис'}&r до &e${expiresDate}`, colors.yellow));
        return;
    }
    
    // Списываем деньги
    await database.updatePlayerMoney(player, -price, `Покупка лицензии на ${type}`, 'system');
    
    // Сохраняем лицензию
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LICENSE_DURATION);
    const expiresDateStr = expiresAt.toLocaleDateString('ru-RU');
    
    // Если это офис, нужно будет выбрать тип
    if (type === 'office') {
        // Сохраняем временную запись, ожидаем выбора типа
        const tempLicense = {
            player,
            type,
            price,
            expiresAt: expiresAt.toISOString()
        };
        
        if (!global.pendingLicenses) global.pendingLicenses = new Map();
        global.pendingLicenses.set(player, tempLicense);
        
        // Создаём красивое сообщение с выбором типа офиса
        const lines = [
            `${colors.white}Лицензия на офис оплачена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Сумма: ${colors.green}${price.toLocaleString('ru-RU')}₽`,
            `${colors.white}Действует до: ${colors.yellow}${expiresDateStr}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Выберите тип офиса:`,
            ``
        ];
        
        for (const [key, name] of Object.entries(OFFICE_TYPE_NAMES)) {
            const color = OFFICE_TYPE_COLORS[key] || colors.white;
            lines.push(`${color}${key}${colors.white} - ${name}`);
        }
        
        lines.push(``);
        lines.push(`${colors.green}Введите команду: &e/office type [тип]`);
        
        const frame = createFrame(`🏢 ПОКУПКА ЛИЦЕНЗИИ`, lines);
        sendPrivate(player, frame);
        
        if (logCallback) logCallback(`📝 ${player} купил лицензию на офис, ожидает выбора типа`, 'info');
        
    } else {
        // Для бизнеса сохраняем сразу
        db.prepare(`
            INSERT INTO properties (type, price, owner, license_type, license_expires)
            VALUES (?, ?, ?, ?, ?)
        `).run(type, price, player, type, expiresAt.toISOString());
        
        const lines = [
            `${colors.white}Лицензия на &e${type === 'business' ? 'бизнес' : 'офис'}&r успешно приобретена!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Сумма: ${colors.green}${price.toLocaleString('ru-RU')}₽`,
            `${colors.white}Действует до: ${colors.yellow}${expiresDateStr}`,
            `${colors.white}Осталось дней: ${colors.green}${LICENSE_DURATION}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Для продления используйте: &e/renewlicense ${type}`
        ];
        
        const frame = createFrame(`✅ ПОКУПКА ЛИЦЕНЗИИ`, lines);
        sendPrivate(player, frame);
        
        if (logCallback) logCallback(`✅ ${player} купил лицензию на ${type}`, 'success');
    }
}

/**
 * Выбор типа офиса
 */
async function selectOfficeType(bot, player, officeType, db, logCallback, sendPrivate) {
    if (!global.pendingLicenses || !global.pendingLicenses.has(player)) {
        sendPrivate(player, formatMessage('❌', 'У вас нет ожидающей лицензии на офис. Используйте &e/buylicense office', colors.red));
        return;
    }
    
    const pending = global.pendingLicenses.get(player);
    
    const validTypes = ['crypto', 'it', 'marketing', 'consulting'];
    const normalizedType = officeType.toLowerCase();
    
    if (!validTypes.includes(normalizedType)) {
        const typesList = validTypes.map(t => `&e${t}`).join(', ');
        sendPrivate(player, formatMessage('❌', `Неверный тип офиса. Доступно: ${typesList}`, colors.red));
        return;
    }
    
    // Создаём имущество офиса
    const result = db.prepare(`
        INSERT INTO properties (type, price, owner, license_type, license_expires, level, profit_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('office', pending.price, player, 'office', pending.expiresAt, 4, JSON.stringify({ office_type: normalizedType }));
    
    const officeId = result.lastInsertRowid;
    const typeColor = OFFICE_TYPE_COLORS[normalizedType] || colors.white;
    const expiresDate = new Date(pending.expiresAt).toLocaleDateString('ru-RU');
    
    const lines = [
        `${colors.white}Офис &e#${officeId}&r успешно создан!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Тип: ${typeColor}${OFFICE_TYPE_NAMES[normalizedType]}`,
        `${colors.white}Уровень: ${colors.green}4/10`,
        `${colors.white}Лицензия до: ${colors.yellow}${expiresDate}`,
        `${colors.gold}────────────────────`,
        `${colors.white}Каждые &e2 дня&r вы будете получать вопрос для прокачки!`,
        `${colors.white}Отвечайте правильно, чтобы повышать уровень!`
    ];
    
    const frame = createFrame(`🏢 СОЗДАНИЕ ОФИСА`, lines);
    sendPrivate(player, frame);
    
    if (logCallback) logCallback(`🏢 ${player} создал офис ID:${officeId} (тип: ${normalizedType})`, 'success');
    
    global.pendingLicenses.delete(player);
    
    return officeId;
}

/**
 * Проверка истекающих лицензий и отправка уведомлений
 */
async function checkExpiringLicenses(bot, db, logCallback, sendPrivate) {
    try {
        const expiring = db.prepare(`
            SELECT p.*, cm.discord_id, cm.minecraft_nick
            FROM properties p
            JOIN clan_members cm ON cm.minecraft_nick = p.owner
            WHERE p.license_expires IS NOT NULL 
            AND date(p.license_expires) BETWEEN date('now', '+1 day') AND date('now', '+2 days')
            AND p.license_expires > datetime('now')
        `).all();
        
        for (const license of expiring) {
            const daysLeft = Math.ceil((new Date(license.license_expires) - new Date()) / (1000 * 60 * 60 * 24));
            const expiresDate = new Date(license.license_expires).toLocaleDateString('ru-RU');
            const typeName = license.type === 'business' ? 'бизнес' : 'офис';
            
            const lines = [
                `${colors.white}Ваша лицензия на &e${typeName}&r истекает!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Истекает через: ${colors.red}${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}`,
                `${colors.white}Дата истечения: ${colors.yellow}${expiresDate}`,
                `${colors.gold}────────────────────`,
                `${colors.white}Продлите её командой: &e/renewlicense ${license.type}`
            ];
            
            const frame = createFrame(`⚠️ ПРЕДУПРЕЖДЕНИЕ`, lines);
            
            // Уведомление в игре
            if (sendPrivate) {
                sendPrivate(license.owner, frame);
            }
            
            // Уведомление в Discord (если есть Discord ID)
            if (license.discord_id && global.botComponents && global.botComponents.discord) {
                try {
                    const user = await global.botComponents.discord.users.fetch(license.discord_id);
                    if (user) {
                        await user.send(`⚠️ **Внимание, ${license.minecraft_nick}!**\n\nВаша лицензия на **${typeName}** истекает через **${daysLeft}** ${daysLeft === 1 ? 'день' : 'дня'} (${expiresDate}).\n\nПродлите её в игре командой \`/renewlicense ${license.type}\`.`);
                    }
                } catch (e) {
                    // Игнорируем ошибки Discord
                }
            }
            
            if (logCallback) logCallback(`⚠️ Лицензия ${license.owner} (${typeName}) истекает через ${daysLeft} дней`, 'warn');
        }
    } catch (error) {
        if (logCallback) logCallback(`Ошибка проверки лицензий: ${error.message}`, 'error');
    }
}

/**
 * Продление лицензии
 */
async function renewLicense(bot, player, type, db, logCallback, sendPrivate) {
    const rpPlayer = await database.getRPPlayer(player);
    if (!rpPlayer) {
        sendPrivate(player, formatMessage('❌', 'Вы не зарегистрированы в RolePlay.', colors.red));
        return;
    }
    
    const license = db.prepare(`
        SELECT * FROM properties 
        WHERE owner = ? AND license_type = ? AND license_expires > datetime('now', '-30 days')
        ORDER BY license_expires DESC LIMIT 1
    `).get(player, type);
    
    if (!license) {
        sendPrivate(player, formatMessage('❌', `У вас нет активной лицензии на &e${type === 'business' ? 'бизнес' : 'офис'}&r. Используйте &e/buylicense ${type}`, colors.red));
        return;
    }
    
    const price = LICENSE_PRICES[type];
    if (rpPlayer.money < price) {
        const needed = price - rpPlayer.money;
        sendPrivate(player, formatMessage('❌', `Недостаточно средств. Нужно ещё &e${needed.toLocaleString('ru-RU')}&r ₽. Стоимость продления: &e${price.toLocaleString('ru-RU')}&r ₽`, colors.red));
        return;
    }
    
    const oldExpiresDate = new Date(license.license_expires).toLocaleDateString('ru-RU');
    
    // Списываем деньги
    await database.updatePlayerMoney(player, -price, `Продление лицензии на ${type}`, 'system');
    
    // Обновляем дату истечения
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + LICENSE_DURATION);
    const newExpiresDate = newExpiresAt.toLocaleDateString('ru-RU');
    
    db.prepare(`
        UPDATE properties SET license_expires = ? WHERE id = ?
    `).run(newExpiresAt.toISOString(), license.id);
    
    const lines = [
        `${colors.white}Лицензия на &e${type === 'business' ? 'бизнес' : 'офис'}&r продлена!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Сумма: ${colors.green}${price.toLocaleString('ru-RU')}₽`,
        `${colors.white}Старая дата: ${colors.red}${oldExpiresDate}`,
        `${colors.white}Новая дата: ${colors.green}${newExpiresDate}`,
        `${colors.white}Срок действия: ${colors.green}${LICENSE_DURATION} дней`,
        `${colors.gold}────────────────────`,
        `${colors.white}Следующее продление: &e/renewlicense ${type}`
    ];
    
    const frame = createFrame(`🔄 ПРОДЛЕНИЕ ЛИЦЕНЗИИ`, lines);
    sendPrivate(player, frame);
    
    if (logCallback) logCallback(`🔄 ${player} продлил лицензию на ${type}`, 'info');
}

/**
 * Отправка вопроса для прокачки офиса (каждые 2 дня)
 */
async function sendOfficeQuestions(bot, db, logCallback, sendPrivate) {
    try {
        const offices = db.prepare(`
            SELECT p.*, cm.minecraft_nick
            FROM properties p
            JOIN clan_members cm ON cm.minecraft_nick = p.owner
            WHERE p.type = 'office' 
            AND p.owner IS NOT NULL
            AND (p.last_question_sent IS NULL OR p.last_question_sent < datetime('now', '-2 days'))
        `).all();
        
        for (const office of offices) {
            let officeType = null;
            try {
                const profitData = JSON.parse(office.profit_data || '{}');
                officeType = profitData.office_type;
            } catch (e) {
                continue;
            }
            if (!officeType) continue;
            
            const questionData = await database.getRandomOfficeQuestion(officeType);
            if (!questionData) continue;
            
            // Сохраняем вопрос для этого офиса
            if (!global.pendingOfficeQuestions) global.pendingOfficeQuestions = new Map();
            global.pendingOfficeQuestions.set(`${office.minecraft_nick}_${office.id}`, {
                questionId: Date.now(),
                question: questionData.question,
                answer: questionData.answer,
                options: questionData.options,
                officeId: office.id,
                expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 часа на ответ
            });
            
            const typeColor = OFFICE_TYPE_COLORS[officeType] || colors.white;
            const level = office.level || 4;
            
            // Создаём красивое сообщение с вопросом
            const lines = [
                `${colors.white}Вопрос для прокачки вашего офиса!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Офис ID: ${colors.yellow}${office.id}`,
                `${colors.white}Тип: ${typeColor}${OFFICE_TYPE_NAMES[officeType]}`,
                `${colors.white}Уровень: ${colors.green}${level}/10`,
                `${colors.gold}────────────────────`,
                `${colors.white}${questionData.question}`,
                ``
            ];
            
            if (questionData.options && questionData.options.length > 0) {
                lines.push(`${colors.white}Варианты ответа:`);
                questionData.options.forEach((opt, idx) => {
                    lines.push(`${colors.green}${idx + 1}.${colors.white} ${opt}`);
                });
                lines.push(``);
                lines.push(`${colors.green}Введите номер варианта: &e/office answer ${office.id} [номер]`);
            } else {
                lines.push(`${colors.green}Введите ответ: &e/office answer ${office.id} [ответ]`);
            }
            
            lines.push(``);
            lines.push(`${colors.red}⚠️ Время на ответ: 24 часа!`);
            
            const frame = createFrame(`❓ ВОПРОС ОФИСА #${office.id}`, lines);
            
            if (sendPrivate) {
                sendPrivate(office.minecraft_nick, frame);
            }
            
            // Обновляем время отправки вопроса
            db.prepare(`
                UPDATE properties SET last_question_sent = datetime('now') WHERE id = ?
            `).run(office.id);
            
            if (logCallback) logCallback(`📚 Отправлен вопрос для офиса ID:${office.id} (${office.minecraft_nick})`, 'info');
        }
    } catch (error) {
        if (logCallback) logCallback(`Ошибка отправки вопросов для офисов: ${error.message}`, 'error');
    }
}

/**
 * Обработка ответа на вопрос офиса
 */
async function handleOfficeAnswer(bot, player, officeId, answer, db, logCallback, sendPrivate) {
    const pendingKey = `${player}_${officeId}`;
    const pending = global.pendingOfficeQuestions?.get(pendingKey);
    
    if (!pending) {
        sendPrivate(player, formatMessage('❌', 'Нет активного вопроса для этого офиса. Следующий вопрос придёт через 2 дня.', colors.red));
        return;
    }
    
    const isCorrect = checkAnswer(answer, pending.answer, pending.options);
    
    // Обновляем уровень офиса
    const result = await database.updateOfficeLevel(officeId, isCorrect);
    
    const typeNames = {
        crypto: 'Крипто-майнинг',
        it: 'IT-разработка',
        marketing: 'Маркетинговое агентство',
        consulting: 'Консалтинг'
    };
    
    let officeType = 'неизвестный';
    try {
        const prop = await database.getProperty(officeId);
        const profitData = JSON.parse(prop?.profit_data || '{}');
        officeType = profitData.office_type || 'неизвестный';
    } catch(e) {}
    
    const typeName = typeNames[officeType] || officeType;
    
    if (isCorrect) {
        const lines = [
            `${colors.white}✅ Правильный ответ!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Офис: ${colors.yellow}#${officeId} ${colors.green}${typeName}`,
            `${colors.white}Уровень повышен: ${colors.green}${result.level}/10`,
            ``
        ];
        
        if (result.nextUpgrade) {
            lines.push(`${colors.white}До следующего повышения: ${colors.green}${result.nextUpgrade} правильных ответов`);
        }
        
        if (result.level >= 10) {
            lines.push(`${colors.gold}🎉 МАКСИМАЛЬНЫЙ УРОВЕНЬ ДОСТИГНУТ! 🎉`);
        }
        
        const frame = createFrame(`📈 ПОВЫШЕНИЕ УРОВНЯ`, lines);
        sendPrivate(player, frame);
    } else {
        const lines = [
            `${colors.white}❌ Неправильный ответ!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Офис: ${colors.yellow}#${officeId} ${colors.green}${typeName}`,
            `${colors.white}Уровень: ${colors.red}${result.level}/10`,
            `${colors.white}Правильный ответ: ${colors.green}${pending.answer}`,
            ``
        ];
        
        if (result.nextDowngrade) {
            lines.push(`${colors.white}До понижения уровня: ${colors.red}${result.nextDowngrade} неправильных ответов`);
        }
        
        if (result.level <= 1) {
            lines.push(`${colors.red}⚠️ МИНИМАЛЬНЫЙ УРОВЕНЬ! Будьте внимательнее!`);
        }
        
        const frame = createFrame(`📉 ПОНИЖЕНИЕ УРОВНЯ`, lines);
        sendPrivate(player, frame);
    }
    
    if (logCallback) logCallback(`${player} ${isCorrect ? 'правильно' : 'неправильно'} ответил на вопрос офиса ID:${officeId}`, isCorrect ? 'success' : 'warn');
    
    global.pendingOfficeQuestions.delete(pendingKey);
}

function checkAnswer(userAnswer, correctAnswer, options) {
    // Если есть варианты ответов, сравниваем по номеру или тексту
    if (options && options.length > 0) {
        const answerNum = parseInt(userAnswer);
        if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= options.length) {
            return options[answerNum - 1].toLowerCase() === correctAnswer.toLowerCase();
        }
    }
    
    // Прямое сравнение строк
    return userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
}

/**
 * Запуск периодических задач (проверка лицензий, отправка вопросов)
 */
function startLicenseScheduler(bot, db, logCallback, sendPrivate) {
    // Проверка истекающих лицензий каждые 12 часов
    setInterval(() => {
        checkExpiringLicenses(bot, db, logCallback, sendPrivate);
    }, 12 * 60 * 60 * 1000);
    
    // Отправка вопросов для офисов каждые 6 часов (но реально отправляется раз в 2 дня)
    setInterval(() => {
        sendOfficeQuestions(bot, db, logCallback, sendPrivate);
    }, 6 * 60 * 60 * 1000);
    
    if (logCallback) logCallback('📋 Система лицензий и офисных вопросов запущена', 'info');
}

module.exports = {
    buyLicense,
    selectOfficeType,
    renewLicense,
    handleOfficeAnswer,
    startLicenseScheduler,
    checkExpiringLicenses,
    sendOfficeQuestions,
    LICENSE_TYPES,
    LICENSE_PRICES,
    OFFICE_TYPES,
    OFFICE_TYPE_NAMES
};