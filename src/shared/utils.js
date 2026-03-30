// src/shared/utils.js
const moment = require('moment');

const emojis = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    money: '💰',
    house: '🏠',
    office: '🏢',
    business: '🏪',
    police: '👮',
    army: '⚔️',
    hospital: '🏥',
    academy: '📚',
    court: '⚖️',
    mute: '🔇',
    kick: '👢',
    ban: '🚫',
    payday: '💵',
    info: 'ℹ️',
    time: '⏰',
    stats: '📊',
    discord: '💬',
    link: '🔗',
    key: '🔑',
    staff: '👑',
    wave: '👋',
    alert: '🚨',
    gift: '🎁',
    upgrade: '⭐',
    gift: '🎁'
};

const gradients = {
    error: '&#FF0202',
    username: '&#76C519',
    text: '&#D4D4D4',
    command: '&#80C4C5',
    errorCommand: '&#CA4E4E',
    noPermission: '&#C58383',
    success: '&#55FF55',
    warning: '&#FFFF55',
    info: '&#55FFFF',
    clan: '&#6343d4'
};

function formatMessage(text, options = {}) {
    const { username, command, noPermission, usage } = options;
    
    if (command) {
        const cmd = command.length > 8 ? command.substring(0, 8) + '...' : command;
        return `${gradients.error}| ${gradients.username}${username || ''}${gradients.text}, неизвестная команда: &c'${gradients.errorCommand}${cmd}&c'${gradients.text}. Напишите &c'${gradients.command}/help&c'${gradients.text} для списка команд&r`;
    }
    
    if (noPermission) {
        return `${gradients.error}| ${gradients.username}${username || ''}${gradients.noPermission}, у вас нет прав для использования этой команды&r`;
    }
    
    if (usage) {
        return `${gradients.error}| ${gradients.username}${username || ''}${gradients.text}, использование: &c'${gradients.command}${usage}&c'&r`;
    }
    
    return text;
}

function truncateMessage(message, maxLength = 190) {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
}
function calculateSimilarity(s1, s2) {
    let longer = s1.toLowerCase();
    let shorter = s2.toLowerCase();
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    let costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}
function parseTimeToMinutes(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1/60, m: 1, h: 60, d: 1440 };
    return value * multipliers[unit];
}

function formatTime(minutes) {
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return mins ? `${hours}ч ${mins}м` : `${hours}ч`;
    const days = Math.floor(hours / 24);
    const hrs = hours % 24;
    return hrs ? `${days}д ${hrs}ч` : `${days}д`;
}

function formatMoney(amount) {
    return `${amount.toLocaleString('ru-RU')} ₽`;
}

function msUntilNextHour() {
    const now = moment();
    const next = moment().startOf('hour').add(1, 'hour');
    return next.diff(now);
}

function getSalaryForRank(structure, rank) {
    const salaries = {
        police: {
            'Рядовой': 4500, 'Сержант': 5500, 'Прапорщик': 6200,
            'Лейтенант': 7500, 'Капитан': 9500, 'Подполковник': 11000, 'Полковник': 13000
        },
        army: {
            'Рядовой': 4300, 'Сержант': 5000, 'Старшина': 5200, 'Прапорщик': 5800,
            'Лейтенант': 6500, 'Капитан': 8000, 'Майор': 9000, 'Подполковник': 10500,
            'Полковник': 12000, 'Маршал': 15000
        },
        hospital: {
            'Санитар(ка)': 4200, 'Сестра-хозяйка': 4500, 'Медсёстры/Брат': 5000,
            'Фельдшер': 5800, 'Лаборант': 5500, 'Акушерка': 6000,
            'Врач': 9000, 'Главный врач': 14000
        },
        academy: {
            'Стажёр': 4200, 'Ассистент': 4800, 'Преподаватель': 6000,
            'Зав. кафедрой': 7000, 'Проректор': 9000, 'Директор': 11000
        },
        government: {
            'Адвокат': 7500, 'Прокурор': 10500, 'Помощник судьи': 6500,
            'Судья': 12000, 'Министр': 15000, 'Мэр': 17000
        }
    };
    
    const structureSalaries = salaries[structure.toLowerCase()];
    if (structureSalaries && structureSalaries[rank]) {
        return structureSalaries[rank];
    }
    
    return 4000;
}

function getPropertyColor(type) {
    const colors = {
        apartment: '#00FF00',
        house: '#00AAFF',
        business: '#FFAA00',
        office: '#AA00FF',
        port: '#FF5500'
    };
    return colors[type] || '#FFFFFF';
}

function getRankColor(rank) {
    const colors = {
        'Новичок': '#7c9c5e',
        'Участник': '#4ade80',
        'Ветеран': '#60a5fa',
        'Легенда': '#fbbf24',
        'Мл.Модератор': '#59ff6d',
        'Модератор': '#114fff',
        'Ст.Модератор': '#ffb10c',
        'Гл.Модератор': '#5323ff',
        'Куратор': '#ff118d',
        'Администратор': '#790101'
    };
    return colors[rank] || '#ffffff';
}

function getStructureEmoji(structure) {
    const emojisMap = {
        'Полиция': '🚔',
        'Армия': '⚔️',
        'Больница': '🏥',
        'Академия': '📚',
        'Мэрия': '🏛️',
        'Суд': '⚖️'
    };
    return emojisMap[structure] || '📌';
}

function isPlayerOnline(bot, nickname) {
    if (!bot || !bot.players) return false;
    return bot.players[nickname] && bot.players[nickname].entity;
}

module.exports = {
    emojis,
    gradients,
    formatMessage,
    truncateMessage,
    parseTimeToMinutes,
    formatTime,
    formatMoney,
    msUntilNextHour,
    getSalaryForRank,
    getPropertyColor,
    getRankColor,
    getStructureEmoji,
    isPlayerOnline,
    calculateSimilarity
};