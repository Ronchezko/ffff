// src/shared/permissions.js
const database = require('../database');

// Ранги персонала (по возрастанию)
const staffRanks = {
    'Мл.Модератор': 1,
    'Модератор': 2,
    'Ст.Модератор': 3,
    'Гл.Модератор': 4,
    'Куратор': 5,
    'Администратор': 6
};

// Ранги в клане (для обычных участников)
const clanRanks = {
    'Новичок': 1,
    'Участник': 2,
    'Ветеран': 3,
    'Легенда': 4
};

// Структуры и их лидерские ранги
const structureLeaderRanks = {
    'Полиция': 'Полковник',
    'Армия': 'Маршал',
    'Больница': 'Главный врач',
    'Академия': 'Директор',
    'Мэрия': 'Мэр'
};

// Министерские должности
const ministerRanks = [
    'Министр обороны',
    'Министр МВД',
    'Министр здравоохранения',
    'Министр образования',
    'Министр экономики'
];

/**
 * Проверка прав на выполнение команды в клане
 * @param {string} nickname - ник игрока
 * @param {number} requiredLevel - требуемый уровень доступа
 * @returns {Promise<boolean>}
 */
async function canExecuteClanCommand(nickname, requiredLevel) {
    const player = database.getPlayerByNickname(nickname);
    if (!player) return false;
    
    // Администратор имеет все права
    const staffRank = database.getStaffRank(nickname);
    if (staffRank === 'Администратор' || staffRank === 'Куратор') return true;
    
    // Проверяем ранг в клане
    const clanRankLevel = clanRanks[player.rank] || 1;
    return clanRankLevel >= requiredLevel;
}

/**
 * Проверка, является ли игрок лидером структуры
 * @param {string} nickname - ник игрока
 * @param {string} structure - название структуры
 * @returns {Promise<boolean>}
 */
async function isStructureLeader(nickname, structure) {
    const rpPlayer = database.getRPPlayer(nickname);
    if (!rpPlayer || rpPlayer.structure !== structure) return false;
    
    const leaderRank = structureLeaderRanks[structure];
    return rpPlayer.organization_rank === leaderRank;
}

/**
 * Проверка, является ли игрок министром
 * @param {string} nickname - ник игрока
 * @param {string} ministry - конкретное министерство (опционально)
 * @returns {Promise<boolean>}
 */
async function isMinister(nickname, ministry = null) {
    const rpPlayer = database.getRPPlayer(nickname);
    if (!rpPlayer || rpPlayer.structure !== 'Мэрия') return false;
    
    if (ministry) {
        const ministerMap = {
            'economy': 'Министр экономики',
            'defense': 'Министр обороны',
            'mvd': 'Министр МВД',
            'health': 'Министр здравоохранения',
            'education': 'Министр образования'
        };
        return rpPlayer.organization_rank === ministerMap[ministry];
    }
    
    return ministerRanks.includes(rpPlayer.organization_rank) || rpPlayer.organization_rank === 'Мэр';
}

/**
 * Проверка, является ли игрок мэром
 * @param {string} nickname - ник игрока
 * @returns {Promise<boolean>}
 */
async function isMayor(nickname) {
    const rpPlayer = database.getRPPlayer(nickname);
    return rpPlayer && rpPlayer.organization_rank === 'Мэр';
}

/**
 * Проверка, имеет ли игрок доступ к RolePlay
 * @param {string} nickname - ник игрока
 * @returns {Promise<boolean>}
 */
async function hasRolePlay(nickname) {
    const rpPlayer = database.getRPPlayer(nickname);
    return !!rpPlayer && rpPlayer.warns < 3 && !rpPlayer.frozen;
}

/**
 * Проверка прав на команду в структуре
 * @param {string} nickname - ник игрока
 * @param {string} structure - название структуры
 * @param {string} requiredRank - требуемый ранг в структуре
 * @returns {Promise<boolean>}
 */
async function canExecuteStructureCommand(nickname, structure, requiredRank) {
    const rpPlayer = database.getRPPlayer(nickname);
    if (!rpPlayer || rpPlayer.structure !== structure) return false;
    
    // Ранги в структурах (порядок)
    const structureRanks = {
        'Полиция': ['Рядовой', 'Сержант', 'Прапорщик', 'Лейтенант', 'Капитан', 'Подполковник', 'Полковник'],
        'Армия': ['Рядовой', 'Сержант', 'Старшина', 'Прапорщик', 'Лейтенант', 'Капитан', 'Майор', 'Подполковник', 'Полковник', 'Маршал'],
        'Больница': ['Санитар(ка)', 'Сестра-хозяйка', 'Медсёстры/Брат', 'Фельдшер', 'Лаборант', 'Акушерка', 'Врач', 'Главный врач'],
        'Академия': ['Стажёр', 'Ассистент', 'Преподаватель', 'Зав. кафедрой', 'Проректор', 'Директор'],
        'Мэрия': ['Адвокат', 'Прокурор', 'Помощник судьи', 'Судья', 'Министр', 'Мэр']
    };
    
    const ranks = structureRanks[structure];
    if (!ranks) return false;
    
    const playerRankIndex = ranks.indexOf(rpPlayer.organization_rank);
    const requiredRankIndex = ranks.indexOf(requiredRank);
    
    return playerRankIndex >= requiredRankIndex;
}

/**
 * Проверка, не заблокирован ли игрок (мут и т.д.)
 * @param {string} nickname - ник игрока
 * @param {string} type - тип наказания
 * @returns {Promise<boolean>}
 */
async function isPunished(nickname, type) {
    const punishments = database.getActivePunishments(nickname, type);
    return punishments.length > 0;
}

/**
 * Получение уровня доступа игрока (для команд)
 * @param {string} nickname - ник игрока
 * @returns {Promise<number>}
 */
async function getAccessLevel(nickname) {
    const staffRank = database.getStaffRank(nickname);
    if (staffRank === 'Администратор') return 100;
    if (staffRank === 'Куратор') return 90;
    if (staffRank === 'Гл.Модератор') return 80;
    if (staffRank === 'Ст.Модератор') return 70;
    if (staffRank === 'Модератор') return 60;
    if (staffRank === 'Мл.Модератор') return 50;
    
    const rpPlayer = database.getRPPlayer(nickname);
    if (rpPlayer) {
        if (rpPlayer.organization_rank === 'Мэр') return 40;
        if (ministerRanks.includes(rpPlayer.organization_rank)) return 35;
        if (Object.values(structureLeaderRanks).includes(rpPlayer.organization_rank)) return 30;
        return 20;
    }
    
    const player = database.getPlayerByNickname(nickname);
    if (player) return 10;
    
    return 0;
}

module.exports = {
    staffRanks,
    clanRanks,
    structureLeaderRanks,
    ministerRanks,
    canExecuteClanCommand,
    isStructureLeader,
    isMinister,
    isMayor,
    hasRolePlay,
    canExecuteStructureCommand,
    isPunished,
    getAccessLevel
};