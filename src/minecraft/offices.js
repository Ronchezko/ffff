// src/minecraft/offices.js
// Управление офисами: типы, уровни, ежедневные вопросы для прокачки

const utils = require('../shared/utils');

// Конфигурация офисов
const OFFICE_CONFIG = {
    types: {
        crypto: {
            name: 'Крипто-майнинг',
            description: 'Добыча криптовалюты',
            baseIncome: 10000,
            questions: []
        },
        it: {
            name: 'IT-разработка',
            description: 'Разработка ПО и сайтов',
            baseIncome: 12000,
            questions: []
        },
        marketing: {
            name: 'Маркетинг',
            description: 'Реклама и продвижение',
            baseIncome: 8000,
            questions: []
        },
        finance: {
            name: 'Финансы',
            description: 'Инвестиции и трейдинг',
            baseIncome: 15000,
            questions: []
        },
        legal: {
            name: 'Юридические услуги',
            description: 'Консультации и сопровождение',
            baseIncome: 9000,
            questions: []
        }
    },
    levelMultipliers: {
        1: 0.3,
        2: 0.5,
        3: 0.7,
        4: 1.0,
        5: 1.3,
        6: 1.6,
        7: 2.0,
        8: 2.5,
        9: 3.0,
        10: 4.0
    },
    questionsPerLevel: 5,  // Вопросов нужно для повышения уровня
    dailyQuestionsLimit: 3  // Максимум вопросов в день
};

// ============================================
// ВОПРОСЫ ДЛЯ ОФИСОВ (ПО ТИПАМ)
// ============================================

const OFFICE_QUESTIONS = {
    crypto: [
        { level: 1, question: 'Что такое блокчейн?', answer: 'децентрализованная база данных' },
        { level: 1, question: 'Какой алгоритм используется в Bitcoin?', answer: 'sha256' },
        { level: 2, question: 'Что такое майнинг?', answer: 'процесс добычи криптовалюты' },
        { level: 2, question: 'Что такое смарт-контракт?', answer: 'программный код на блокчейне' },
        { level: 3, question: 'Что такое DeFi?', answer: 'децентрализованные финансы' }
    ],
    it: [
        { level: 1, question: 'Что такое API?', answer: 'интерфейс программирования' },
        { level: 1, question: 'Что такое Git?', answer: 'система контроля версий' },
        { level: 2, question: 'Что такое Docker?', answer: 'контейнеризация' },
        { level: 2, question: 'Что такое REST API?', answer: 'архитектурный стиль' },
        { level: 3, question: 'Что такое CI/CD?', answer: 'непрерывная интеграция' }
    ],
    marketing: [
        { level: 1, question: 'Что такое SEO?', answer: 'поисковая оптимизация' },
        { level: 1, question: 'Что такое конверсия?', answer: 'процент целевых действий' },
        { level: 2, question: 'Что такое SMM?', answer: 'маркетинг в соцсетях' },
        { level: 2, question: 'Что такое таргетинг?', answer: 'настройка аудитории' },
        { level: 3, question: 'Что такое A/B тестирование?', answer: 'сравнение версий' }
    ],
    finance: [
        { level: 1, question: 'Что такое инфляция?', answer: 'обесценивание денег' },
        { level: 1, question: 'Что такое диверсификация?', answer: 'распределение рисков' },
        { level: 2, question: 'Что такое сложный процент?', answer: 'процент на процент' },
        { level: 2, question: 'Что такое ликвидность?', answer: 'способность быть проданным' },
        { level: 3, question: 'Что такое хеджирование?', answer: 'страхование рисков' }
    ],
    legal: [
        { level: 1, question: 'Что такое оферта?', answer: 'предложение договора' },
        { level: 1, question: 'Что такое иск?', answer: 'судебное требование' },
        { level: 2, question: 'Что такое доверенность?', answer: 'передача полномочий' },
        { level: 2, question: 'Что такое нотариус?', answer: 'заверение документов' },
        { level: 3, question: 'Что такое юрлицо?', answer: 'организация' }
    ]
};

// ============================================
// РАСЧЁТ ДОХОДА ОФИСА
// ============================================

async function calculateOfficeIncome(officeId, db) {
    const office = await db.get(`
        SELECT p.*, o.office_type, o.level, o.total_income 
        FROM property p 
        LEFT JOIN offices o ON p.id = o.property_id 
        WHERE p.id = ? AND p.type = 'office'
    `, [officeId]);
    
    if (!office || !office.owner_nick) return 0;
    
    const type = office.office_type || 'crypto';
    const level = office.level || 4;
    const multiplier = OFFICE_CONFIG.levelMultipliers[level] || 1.0;
    const baseIncome = OFFICE_CONFIG.types[type]?.baseIncome || 10000;
    
    return Math.floor(baseIncome * multiplier);
}

// ============================================
// НАЧИСЛЕНИЕ ДОХОДА ОФИСАМ
// ============================================

async function processOfficeIncome(bot, db, addLog) {
    try {
        const offices = await db.all(`
            SELECT p.id, p.owner_nick, o.office_type, o.level, o.total_income, o.last_income_calc
            FROM property p 
            JOIN offices o ON p.id = o.property_id 
            WHERE p.is_available = 0 AND p.owner_nick IS NOT NULL
        `);
        
        const now = new Date();
        let totalPaid = 0;
        
        for (const office of offices) {
            const lastCalc = office.last_income_calc ? new Date(office.last_income_calc) : now;
            const hoursPassed = Math.max(0, (now - lastCalc) / (60 * 60 * 1000));
            
            if (hoursPassed >= 1) {
                const hourlyIncome = await calculateOfficeIncome(office.id, db);
                const incomeEarned = Math.floor(hourlyIncome * Math.floor(hoursPassed));
                
                if (incomeEarned > 0) {
                    await db.updateMoney(office.owner_nick, incomeEarned, 'office_income', 
                        `Доход от офиса #${office.id} за ${Math.floor(hoursPassed)} ч`, 'system');
                    
                    await db.run(`
                        UPDATE offices SET 
                            total_income = total_income + ?,
                            last_income_calc = CURRENT_TIMESTAMP
                        WHERE property_id = ?
                    `, [incomeEarned, office.id]);
                    
                    totalPaid += incomeEarned;
                }
            }
        }
        
        if (totalPaid > 0) {
            addLog(`💰 Общий доход от офисов за час: ${utils.formatMoney(totalPaid)}`, 'info');
        }
        
    } catch (error) {
        addLog(`❌ Ошибка начисления дохода офисов: ${error.message}`, 'error');
    }
}

// ============================================
// ЕЖЕДНЕВНЫЙ ВОПРОС ДЛЯ ПРОКАЧКИ
// ============================================

async function askDailyQuestion(bot, sender, officeId, db, addLog) {
    const office = await db.get(`
        SELECT p.*, o.office_type, o.level, o.daily_questions_asked, o.correct_answers, o.last_question_date
        FROM property p 
        LEFT JOIN offices o ON p.id = o.property_id 
        WHERE p.id = ? AND p.owner_nick = ? AND p.type = 'office'
    `, [officeId, sender]);
    
    if (!office) {
        bot.chat(`/msg ${sender} &cУ вас нет офиса с ID ${officeId}!`);
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const lastDate = office.last_question_date;
    
    if (lastDate === today && office.daily_questions_asked >= OFFICE_CONFIG.dailyQuestionsLimit) {
        bot.chat(`/msg ${sender} &cСегодня вы уже ответили на все вопросы (${OFFICE_CONFIG.dailyQuestionsLimit}/3)! Приходите завтра.`);
        return;
    }
    
    const currentLevel = office.level || 4;
    const type = office.office_type;
    
    if (!type || !OFFICE_QUESTIONS[type]) {
        bot.chat(`/msg ${sender} &cТип офиса не выбран! Обратитесь к администратору.`);
        return;
    }
    
    // Получаем вопросы для текущего уровня
    const levelQuestions = OFFICE_QUESTIONS[type].filter(q => q.level === currentLevel);
    if (levelQuestions.length === 0) {
        bot.chat(`/msg ${sender} &a🎉 Поздравляем! Ваш офис достиг максимального уровня!`);
        return;
    }
    
    // Выбираем случайный вопрос
    const randomIndex = Math.floor(Math.random() * levelQuestions.length);
    const question = levelQuestions[randomIndex];
    
    // Сохраняем вопрос в временное хранилище
    if (!global.pendingQuestions) global.pendingQuestions = new Map();
    global.pendingQuestions.set(sender, {
        officeId,
        question: question.question,
        answer: question.answer,
        level: currentLevel,
        expiresAt: Date.now() + 60 * 1000 // 1 минута на ответ
    });
    
    bot.chat(`/msg ${sender} &6📚 ЕЖЕДНЕВНЫЙ ВОПРОС ДЛЯ ОФИСА #${officeId} (${OFFICE_CONFIG.types[type].name})`);
    bot.chat(`/msg ${sender} &7Вопрос: &e${question.question}`);
    bot.chat(`/msg ${sender} &7Напишите ответ в ЛС боту командой &e/office answer [ответ]`);
}

// ============================================
// ОТВЕТ НА ВОПРОС
// ============================================

async function answerQuestion(bot, sender, answer, db, addLog) {
    if (!global.pendingQuestions || !global.pendingQuestions.has(sender)) {
        bot.chat(`/msg ${sender} &cУ вас нет активных вопросов! Используйте /office ask [id]`);
        return;
    }
    
    const pending = global.pendingQuestions.get(sender);
    
    if (Date.now() > pending.expiresAt) {
        global.pendingQuestions.delete(sender);
        bot.chat(`/msg ${sender} &cВремя на ответ истекло! Попробуйте снова.`);
        return;
    }
    
    const isCorrect = answer.toLowerCase().includes(pending.answer.toLowerCase()) ||
                      pending.answer.toLowerCase().includes(answer.toLowerCase());
    
    const office = await db.get('SELECT * FROM offices WHERE property_id = ?', [pending.officeId]);
    const today = new Date().toISOString().split('T')[0];
    
    if (isCorrect) {
        // Правильный ответ
        const newCorrectAnswers = (office.correct_answers || 0) + 1;
        const dailyAsked = (office.daily_questions_asked || 0) + 1;
        
        await db.run(`
            UPDATE offices SET 
                correct_answers = ?,
                daily_questions_asked = ?,
                last_question_date = ?
            WHERE property_id = ?
        `, [newCorrectAnswers, dailyAsked, today, pending.officeId]);
        
        bot.chat(`/msg ${sender} &a✅ Правильный ответ! +1 балл к прокачке.`);
        
        // Проверяем, можно ли повысить уровень
        const questionsNeeded = pending.level * OFFICE_CONFIG.questionsPerLevel;
        if (newCorrectAnswers >= questionsNeeded) {
            await upgradeOfficeLevel(sender, pending.officeId, db, bot, addLog);
        } else {
            const remaining = questionsNeeded - newCorrectAnswers;
            bot.chat(`/msg ${sender} &7До следующего уровня осталось ${remaining} правильных ответов.`);
        }
        
    } else {
        // Неправильный ответ
        bot.chat(`/msg ${sender} &c❌ Неправильный ответ! Правильно: ${pending.answer}`);
        bot.chat(`/msg ${sender} &7Попробуйте снова завтра.`);
    }
    
    global.pendingQuestions.delete(sender);
}

// ============================================
// ПОВЫШЕНИЕ УРОВНЯ ОФИСА
// ============================================

async function upgradeOfficeLevel(sender, officeId, db, bot, addLog) {
    const office = await db.get('SELECT level FROM offices WHERE property_id = ?', [officeId]);
    const currentLevel = office?.level || 4;
    
    if (currentLevel >= 10) {
        bot.chat(`/msg ${sender} &a🎉 Ваш офис уже достиг максимального уровня!`);
        return;
    }
    
    const newLevel = currentLevel + 1;
    
    await db.run(`
        UPDATE offices SET 
            level = ?,
            correct_answers = 0,
            daily_questions_asked = 0
        WHERE property_id = ?
    `, [newLevel, officeId]);
    
    const newIncome = await calculateOfficeIncome(officeId, db);
    
    bot.chat(`/msg ${sender} &a🎉 ПОЗДРАВЛЯЕМ! Офис #${officeId} повышен до ${newLevel} уровня!`);
    bot.chat(`/msg ${sender} &7Теперь доход составляет ${utils.formatMoney(newIncome)}/час`);
    
    if (addLog) addLog(`📈 ${sender} повысил уровень офиса #${officeId} до ${newLevel}`, 'success');
}

// ============================================
// ВЫБОР ТИПА ОФИСА (ЧЕРЕЗ DISCORD)
// ============================================

async function setOfficeType(propertyId, officeType, db, addLog) {
    if (!OFFICE_CONFIG.types[officeType]) {
        return { success: false, reason: 'Неизвестный тип офиса' };
    }
    
    await db.run(`
        INSERT INTO offices (property_id, office_type, level, last_income_calc)
        VALUES (?, ?, 4, CURRENT_TIMESTAMP)
        ON CONFLICT(property_id) DO UPDATE SET office_type = ?
    `, [propertyId, officeType, officeType]);
    
    if (addLog) addLog(`🏛️ Офису #${propertyId} установлен тип ${officeType}`, 'info');
    
    return { success: true };
}

// ============================================
// ЗАПУСК ПЕРИОДИЧЕСКОГО НАЧИСЛЕНИЯ
// ============================================

function startOfficeIncomeLoop(bot, db, addLog) {
    setInterval(() => {
        processOfficeIncome(bot, db, addLog);
    }, 60 * 60 * 1000);
    
    addLog('🏛️ Система доходов офисов запущена', 'success');
}

module.exports = {
    calculateOfficeIncome,
    processOfficeIncome,
    askDailyQuestion,
    answerQuestion,
    upgradeOfficeLevel,
    setOfficeType,
    startOfficeIncomeLoop,
    OFFICE_CONFIG,
    OFFICE_QUESTIONS
};