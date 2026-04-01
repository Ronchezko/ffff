// src/shared/permissions.js
// Модуль для проверки прав доступа (ранги, роли)

const database = require('../database');

// Соответствие рангов клана уровням доступа
const RANK_LEVELS = {
    'Новичок': 0,
    'Участник': 10,
    'Мл.Модератор': 20,
    'Модератор': 30,
    'Ст.Модератор': 40,
    'Гл.Модератор': 50,
    'Куратор': 60,
    'Администратор': 100
};

// Соответствие уровней персонала (staff_stats.rank_level)
const STAFF_LEVELS = {
    0: 'Не в персонале',
    1: 'Мл.Модератор',
    2: 'Модератор',
    3: 'Ст.Модератор',
    4: 'Гл.Модератор',
    5: 'Куратор',
    6: 'Администратор'
};

// Проверка, является ли игрок администратором
async function isAdmin(nick) {
    const staff = await database.getStaffRank(nick);
    return staff.rank_level >= 6;
}

// Проверка, является ли игрок куратором или выше
async function isCuratorOrHigher(nick) {
    const staff = await database.getStaffRank(nick);
    return staff.rank_level >= 5;
}

// Проверка, имеет ли игрок право на определённое действие
async function hasPermission(nick, action) {
    const staff = await database.getStaffRank(nick);
    const level = staff.rank_level;
    
    const permissions = {
        // Модераторские действия
        'mute': level >= 1,
        'kick': level >= 1,
        'blacklist': level >= 1,
        'warn': level >= 2,
        
        // Административные действия
        'promote': level >= 4,
        'admin': level >= 6,
        'stopall': level >= 6,
        'reloadbd': level >= 6,
        
        // Действия с настройками
        'spam_toggle': level >= 4,
        'chat_ad_toggle': level >= 3,
        
        // Действия с экономикой
        'balance_set': level >= 3,
        'points_add': level >= 2,
        'rank_set': level >= 2,
        
        // Действия с имуществом
        'property_admin': level >= 3,
        
        // Действия с организациями
        'org_freeze': level >= 4,
        'org_unfreeze': level >= 4
    };
    
    return permissions[action] || false;
}

// Проверка, может ли один модератор наказать другого
async function canModerate(actor, target) {
    if (actor === target) return false; // Нельзя наказывать себя
    
    const actorRank = await database.getStaffRank(actor);
    const targetRank = await database.getStaffRank(target);
    
    // Администратор может всё
    if (actorRank.rank_level >= 6) return true;
    
    // Куратор может всё, кроме снятия администратора
    if (actorRank.rank_level >= 5) {
        return targetRank.rank_level < 6;
    }
    
    // Обычный модератор не может наказывать вышестоящих
    return actorRank.rank_level > targetRank.rank_level;
}

// Получение ранга клана игрока
async function getClanRank(nick) {
    const member = await database.getClanMember(nick);
    if (!member) return null;
    return {
        name: member.rank_name,
        priority: member.rank_priority,
        level: RANK_LEVELS[member.rank_name] || 0
    };
}

// Проверка, является ли игрок лидером организации
async function isOrgLeader(nick, orgName) {
    const org = await database.getOrganization(orgName);
    return org && org.leader_nick === nick;
}

// Проверка, может ли игрок управлять организацией
async function canManageOrg(nick, orgName) {
    const member = await database.getOrgMember(nick, orgName);
    if (!member) return false;
    
    // Лидер может всё
    if (await isOrgLeader(nick, orgName)) return true;
    
    // Проверяем права ранга
    const rank = await database.getOrgRank(orgName, member.rank_name);
    return rank && (rank.can_invite || rank.can_kick || rank.can_promote);
}

// Получение уровня доступа для вывода
async function getAccessLevel(nick) {
    const staff = await database.getStaffRank(nick);
    if (staff.rank_level > 0) {
        return STAFF_LEVELS[staff.rank_level] || 'Персонал';
    }
    
    const clanRank = await getClanRank(nick);
    return clanRank ? clanRank.name : 'Не в клане';
}

module.exports = {
    RANK_LEVELS,
    STAFF_LEVELS,
    isAdmin,
    isCuratorOrHigher,
    hasPermission,
    canModerate,
    getClanRank,
    isOrgLeader,
    canManageOrg,
    getAccessLevel
};