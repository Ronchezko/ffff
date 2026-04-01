// src/shared/logger.js
// Модуль для красивого логирования с цветами

const colors = require('colors');

// Настройка цветов
colors.setTheme({
    info: 'cyan',
    warn: 'yellow',
    error: 'red',
    success: 'green',
    debug: 'gray'
});

// Форматирование времени
function getTimestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString('ru-RU', { hour12: false })}]`;
}

// Основные методы логгера
const logger = {
    info: (message, ...args) => {
        console.log(`${getTimestamp()} ℹ️ `.info + String(message).info, ...args);
    },
    
    warn: (message, ...args) => {
        console.log(`${getTimestamp()} ⚠️ `.warn + String(message).warn, ...args);
    },
    
    error: (message, ...args) => {
        console.log(`${getTimestamp()} ❌ `.error + String(message).error, ...args);
    },
    
    success: (message, ...args) => {
        console.log(`${getTimestamp()} ✅ `.success + String(message).success, ...args);
    },
    
    debug: (message, ...args) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`${getTimestamp()} 🔍 `.debug + String(message).debug, ...args);
        }
    },
    
    // Для обычных сообщений без иконок
    log: (message, ...args) => {
        console.log(`${getTimestamp()} ${message}`, ...args);
    },
    
    // Разделитель
    separator: () => {
        console.log('─'.repeat(60).gray);
    },
    
    // Заголовок
    header: (title) => {
        console.log('\n' + '═'.repeat(60).cyan);
        console.log(`  ${title}`.cyan.bold);
        console.log('═'.repeat(60).cyan + '\n');
    }
};

module.exports = logger;