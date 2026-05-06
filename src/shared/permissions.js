// src/shared/permissions.js — Система прав и разрешений Resistance City
// Проверяет права игроков, персонала, организации, RP-статус
// Учитывает: тюрьму, болезни, заморозку, городской статус, чёрные списки

'use strict';

const config = require('../config');

// ==================== ИЕРАРХИЯ РАНГОВ ПЕРСОНАЛА ====================
const STAFF_HIERARCHY = {
    'administrator': 100,
    'curator': 90,
    'headModerator': 80,
    'seniorModerator': 70,
    'moderator': 60,
    'juniorModerator': 50,
};

// ==================== ИЕРАРХИЯ РАНГОВ ОРГАНИЗАЦИЙ ====================
const ORG_RANK_HIERARCHY = {
    // Полиция
    'police': {
        'Рядовой': 1,
        'Сержант': 2,
        'Прапорщик': 3,
        'Лейтенант': 4,
        'Капитан': 5,
        'Подполковник': 6,
        'Полковник': 7,
    },
    // Армия
    'army': {
        'Рядовой': 1,
        'Сержант': 2,
        'Старшина': 3,
        'Прапорщик': 4,
        'Лейтенант': 5,
        'Капитан': 6,
        'Майор': 7,
        'Подполковник': 8,
        'Полковник': 9,
        'Маршал': 10,
    },
    // Больница
    'hospital': {
        'Санитар(ка)': 1,
        'Сестра-хозяйка': 2,
        'Медсёстры/Брат': 3,
        'Фельдшер': 4,
        'Лаборант': 5,
        'Акушерка': 6,
        'Врач': 7,
        'Главный врач': 8,
    },
    // Академия
    'academy': {
        'Стажёр': 1,
        'Ассистент': 2,
        'Преподаватель': 3,
        'Зав. кафедрой': 4,
        'Проректор': 5,
        'Директор': 6,
    },
    // Мэрия и Суд
    'government': {
        'Адвокат': 1,
        'Прокурор': 2,
        'Помощник судьи': 3,
        'Судья': 4,
        'Министр': 5,
        'Мэр': 6,
    },
};

// ==================== КОМАНДЫ, ДОСТУПНЫЕ В ТЮРЬМЕ ====================
const JAIL_ALLOWED_COMMANDS = [
    '/help',
    '/pass',
    '/balance',
    '/id',
    '/ds',
    '/discord',
    '/link',
];

// ==================== КОМАНДЫ, ДОСТУПНЫЕ БОЛЬНЫМ ====================
const SICK_ALLOWED_COMMANDS = [
    '/help',
    '/pass',
    '/balance',
    '/id',
    '/ds',
    '/discord',
    '/link',
    '/pay',
];

// ==================== КОМАНДЫ, ДОСТУПНЫЕ НЕ В ГОРОДЕ ====================
const OUT_OF_CITY_ALLOWED_COMMANDS = [
    '/help',
    '/balance',
    '/id',
    '/ds',
    '/discord',
    '/link',
    '/pass',
    '/keys',
];

// ==================== ПРОВЕРКИ ДЛЯ ИГРОКОВ ====================

/**
 * Проверить, является ли пользователь администратором
 */
function isAdmin(username, db) {
    if (!db || !username) return false;
    const staff = db.staff.get(username);
    return staff && staff.rank === 'administrator' && staff.is_active === 1;
}

/**
 * Проверить, является ли пользователь куратором
 */
function isCurator(username, db) {
    if (!db || !username) return false;
    const staff = db.staff.get(username);
    return staff && staff.rank === 'curator' && staff.is_active === 1;
}

/**
 * Проверить, является ли пользователь членом персонала
 */
function isStaff(username, db) {
    if (!db || !username) return false;
    const staff = db.staff.get(username);
    return staff && staff.is_active === 1;
}

/**
 * Получить ранг персонала пользователя
 */
function getStaffRank(username, db) {
    if (!db || !username) return null;
    const staff = db.staff.get(username);
    return staff && staff.is_active === 1 ? staff.rank : null;
}

/**
 * Получить уровень персонала (числовой)
 */
function getStaffLevel(username, db) {
    const rank = getStaffRank(username, db);
    if (!rank) return 0;
    return STAFF_HIERARCHY[rank] || 0;
}

/**
 * Проверить, имеет ли персонал право выполнить действие над другим персоналом
 * Вышестоящий может управлять нижестоящим, но не наоборот
 * Администратор может управлять всеми
 * Куратор не может управлять администратором
 */
function canManageStaff(issuerUsername, targetUsername, db) {
    if (!db) return false;

    const issuerLevel = getStaffLevel(issuerUsername, db);
    const targetLevel = getStaffLevel(targetUsername, db);

    // Если issuer не персонал — не может управлять
    if (issuerLevel === 0) return false;

    // Если target не персонал — можно управлять
    if (targetLevel === 0) return true;

    // Администратор может всё
    if (issuerLevel >= STAFF_HIERARCHY['administrator']) return true;

    // Куратор не может управлять администратором
    if (issuerLevel === STAFF_HIERARCHY['curator'] && targetLevel >= STAFF_HIERARCHY['administrator']) {
        return false;
    }

    // Вышестоящий может управлять нижестоящим
    return issuerLevel > targetLevel;
}

/**
 * Проверить, может ли персонал выдать наказание
 * Учитывает дневные лимиты
 */
function canPunish(issuerUsername, punishmentType, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const staff = db.staff.get(issuerUsername);
    if (!staff || staff.is_active !== 1) {
        return { allowed: false, reason: 'not_staff' };
    }

    const rankConfig = config.staffRanks[staff.rank];
    if (!rankConfig) {
        return { allowed: false, reason: 'unknown_rank' };
    }

    // Проверка дневных лимитов
    if (rankConfig.dailyLimits) {
        if (punishmentType === 'kick' && staff.kicks_today >= rankConfig.dailyLimits.kicks) {
            return { allowed: false, reason: 'daily_limit_kicks' };
        }
        if (punishmentType === 'mute' && staff.mutes_today >= rankConfig.dailyLimits.mutes) {
            return { allowed: false, reason: 'daily_limit_mutes' };
        }
        if (punishmentType === 'blacklist' && staff.blacklists_today >= rankConfig.dailyLimits.blacklists) {
            return { allowed: false, reason: 'daily_limit_blacklists' };
        }
    }

    return { allowed: true };
}

/**
 * Проверить, имеет ли персонал право на выполнение команды
 */
function canExecuteStaffCommand(issuerUsername, command, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const staff = db.staff.get(issuerUsername);
    if (!staff || staff.is_active !== 1) {
        return { allowed: false, reason: 'not_staff' };
    }

    // Администратор и куратор могут всё
    if (staff.rank === 'administrator' || staff.rank === 'curator') {
        return { allowed: true };
    }

    // Проверки для конкретных команд
    const staffLevel = STAFF_HIERARCHY[staff.rank] || 0;

    // Команды, требующие определённого уровня
    const commandRequirements = {
        'arp': STAFF_HIERARCHY['seniorModerator'], // Большинство /arp команд от ст. модератора
        'admin': STAFF_HIERARCHY['curator'], // /admin команды от куратора
        'awarn': STAFF_HIERARCHY['seniorModerator'],
        'spam': STAFF_HIERARCHY['headModerator'],
        'r': STAFF_HIERARCHY['headModerator'],
        'stopall': STAFF_HIERARCHY['administrator'],
        'reloadbd': STAFF_HIERARCHY['administrator'],
        'logs': STAFF_HIERARCHY['juniorModerator'],
    };

    const requiredLevel = commandRequirements[command];
    if (requiredLevel && staffLevel < requiredLevel) {
        return { allowed: false, reason: 'insufficient_rank' };
    }

    return { allowed: true };
}

// ==================== ПРОВЕРКИ ДЛЯ RP-ИГРОКОВ ====================

/**
 * Проверить, состоит ли игрок в RP
 */
function isRpMember(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.is_active === 1;
}

/**
 * Проверить, находится ли игрок в городе (не уходил через команду /leavecity)
 */
function isInCity(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.is_active === 1 && member.is_in_city === 1;
}

/**
 * Проверить, находится ли игрок в тюрьме
 */
function isInJail(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    if (!member || member.is_in_jail !== 1) return false;

    // Проверить, не истёк ли срок
    if (member.jail_until && new Date(member.jail_until) < new Date()) {
        // Автоматическое освобождение
        db.rpMembers.releaseFromJail(username);
        return false;
    }

    return true;
}

/**
 * Проверить, болен ли игрок
 */
function isSick(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    if (!member || member.is_sick !== 1) return false;

    // Проверить, не истёк ли срок болезни
    if (member.sick_until && new Date(member.sick_until) < new Date()) {
        // Автоматическое выздоровление
        db.rpMembers.healFromSick(username, 'natural');
        return false;
    }

    return true;
}

/**
 * Проверить, заморожен ли игрок
 */
function isFrozen(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.is_frozen === 1;
}

/**
 * Проверить, в чёрном списке ли игрок (для RP)
 */
function isBlacklistedFromRp(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.blacklisted_from_rp === 1;
}

/**
 * Проверить, состоит ли игрок в организации
 */
function isInOrganization(username, organizationKey, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    if (!member || !member.organization) return false;

    // Определяем key организации по названию
    const orgMapping = {
        'Полиция (МВД)': 'police',
        'Армия': 'army',
        'Больница': 'hospital',
        'Академия': 'academy',
        'Мэрия и Суд': 'government',
    };

    const memberOrgKey = orgMapping[member.organization];
    return memberOrgKey === organizationKey;
}

/**
 * Получить организацию игрока
 */
function getPlayerOrganization(username, db) {
    if (!db || !username) return null;
    const member = db.rpMembers.get(username);
    if (!member || !member.organization) return null;
    return member.organization;
}

/**
 * Получить ранг игрока в организации
 */
function getPlayerOrgRank(username, db) {
    if (!db || !username) return null;
    const member = db.rpMembers.get(username);
    if (!member || !member.rank) return null;
    return member.rank;
}

/**
 * Получить числовой уровень ранга в организации
 */
function getPlayerOrgLevel(username, db) {
    const member = db.rpMembers.get(username);
    if (!member || !member.organization || !member.rank) return 0;

    const orgMapping = {
        'Полиция (МВД)': 'police',
        'Армия': 'army',
        'Больница': 'hospital',
        'Академия': 'academy',
        'Мэрия и Суд': 'government',
    };

    const orgKey = orgMapping[member.organization];
    if (!orgKey || !ORG_RANK_HIERARCHY[orgKey]) return 0;

    return ORG_RANK_HIERARCHY[orgKey][member.rank] || 0;
}

/**
 * Проверить, является ли игрок лидером организации
 */
function isOrgLeader(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    if (!member || !member.organization) return false;

    // Лидеры в каждой организации
    const leaders = {
        'Полиция (МВД)': 'Полковник',
        'Армия': 'Маршал',
        'Больница': 'Главный врач',
        'Академия': 'Директор',
        'Мэрия и Суд': 'Мэр',
    };

    return member.rank === leaders[member.organization];
}

/**
 * Проверить, является ли игрок министром
 */
function isMinister(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.rank === 'Министр';
}

/**
 * Проверить, является ли игрок мэром
 */
function isMayor(username, db) {
    if (!db || !username) return false;
    const member = db.rpMembers.get(username);
    return member && member.rank === 'Мэр' && member.organization === 'Мэрия и Суд';
}

/**
 * Проверить, имеет ли игрок образование
 */
function hasEducation(username, db) {
    if (!db || !username) return false;
    const edu = db.education.get(username);
    return edu && edu.has_basic === 1;
}

/**
 * Проверить, имеет ли игрок дополнительное образование
 */
function hasAdvancedEducation(username, db) {
    if (!db || !username) return false;
    const edu = db.education.get(username);
    return edu && edu.has_advanced === 1;
}

/**
 * Проверить, имеет ли игрок медкнижку
 */
function hasMedicalBook(username, db) {
    if (!db || !username) return false;
    return db.medicalBooks.isValid(username);
}

// ==================== ПРОВЕРКИ ДОСТУПА К КОМАНДАМ ====================

/**
 * Полная проверка доступа игрока к команде
 * Возвращает объект с результатом проверки
 */
function checkCommandAccess(username, command, db) {
    if (!db) {
        return { allowed: false, reason: 'no_database', message: '&cОшибка базы данных' };
    }

    // Проверка существования игрока в клане
    const member = db.members.get(username);
    if (!member || member.is_in_clan !== 1) {
        return { allowed: false, reason: 'not_in_clan', message: '&cВы не состоите в клане!' };
    }

    // Проверка глобальной заморозки
    const globalFreeze = db.settings.getBoolean('global_freeze');
    if (globalFreeze) {
        const adminCommands = ['/arp', '/admin', '/stopall'];
        const isAdminCommand = adminCommands.some(cmd => command.startsWith(cmd));
        if (!isAdminCommand && !isAdmin(username, db)) {
            return {
                allowed: false,
                reason: 'global_freeze',
                message: '&cСистема заморожена администратором. Команды временно недоступны.'
            };
        }
    }
        const alwaysAllowed = ['/rp', '/help', '/discord', '/ds', '/link'];
        if (alwaysAllowed.includes(command)) {
            return { allowed: true };
        }
    // Проверка тюрьмы
    if (isInJail(username, db)) {
        const isAllowed = JAIL_ALLOWED_COMMANDS.some(cmd => command.startsWith(cmd));
        if (!isAllowed) {
            return {
                allowed: false,
                reason: 'in_jail',
                message: '&cВы находитесь в тюрьме и не можете использовать эту команду!'
            };
        }
    }

    // Проверка болезни
    if (isSick(username, db)) {
        // Болезнь не блокирует полностью, но ограничивает RP-команды
        const rpCommands = ['/org', '/fr', '/grab', '/biz', '/office', '/search', '/fine', '/heal'];
        const isRpCommand = rpCommands.some(cmd => command.startsWith(cmd));
        if (isRpCommand) {
            // Проверяем, состоит ли в организации
            const rpMember = db.rpMembers.get(username);
            if (rpMember && rpMember.organization) {
                return {
                    allowed: false,
                    reason: 'sick',
                    message: '&cВы на больничном и не можете выполнять служебные обязанности!'
                };
            }
        }
    }

    // Проверка нахождения в городе
    if (!isInCity(username, db)) {
        const isAllowed = OUT_OF_CITY_ALLOWED_COMMANDS.some(cmd => command.startsWith(cmd));
        if (!isAllowed) {
            return {
                allowed: false,
                reason: 'out_of_city',
                message: '&cВы не в городе! Используйте команду возвращения или доступны только базовые команды.'
            };
        }
    }

    // Проверка заморозки игрока
    if (isFrozen(username, db)) {
        return {
            allowed: false,
            reason: 'frozen',
            message: '&cВаш профиль заморожен. Причина: ' + (db.rpMembers.get(username)?.frozen_reason || 'не указана')
        };
    }

    // Проверка чёрного списка RP
    if (isBlacklistedFromRp(username, db)) {
        const rpCommands = ['/rp', '/org', '/fr', '/grab', '/biz', '/office'];
        const isRpCommand = rpCommands.some(cmd => command.startsWith(cmd));
        if (isRpCommand) {
            return {
                allowed: false,
                reason: 'blacklisted_from_rp',
                message: '&cВы заблокированы в RolePlay и не можете использовать RP-команды!'
            };
        }
    }

    // Все проверки пройдены
    return { allowed: true };
}

/**
 * Проверить, может ли игрок выполнить команду организации
 */
function checkOrgCommandAccess(username, command, minRank, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const baseCheck = checkCommandAccess(username, command, db);
    if (!baseCheck.allowed) return baseCheck;

    const member = db.rpMembers.get(username);
    if (!member || !member.organization) {
        return { allowed: false, reason: 'no_organization', message: '&cВы не состоите в организации!' };
    }

    const playerLevel = getPlayerOrgLevel(username, db);
    const orgKey = Object.keys(ORG_RANK_HIERARCHY).find(
        key => config.organizations[key]?.name === member.organization
    );

    if (!orgKey || !ORG_RANK_HIERARCHY[orgKey]) {
        return { allowed: false, reason: 'unknown_org', message: '&cНеизвестная организация!' };
    }

    const requiredLevel = ORG_RANK_HIERARCHY[orgKey][minRank] || 999;

    if (playerLevel < requiredLevel) {
        return {
            allowed: false,
            reason: 'insufficient_org_rank',
            message: `&cНедостаточный ранг! Требуется: ${minRank} или выше.`
        };
    }

    return { allowed: true };
}

/**
 * Проверить, может ли игрок использовать команду лидера организации
 */
function checkOrgLeaderAccess(username, command, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const baseCheck = checkCommandAccess(username, command, db);
    if (!baseCheck.allowed) return baseCheck;

    if (!isOrgLeader(username, db)) {
        return {
            allowed: false,
            reason: 'not_org_leader',
            message: '&cТолько лидер организации может использовать эту команду!'
        };
    }

    return { allowed: true };
}

// ==================== ПРОВЕРКИ ДЛЯ БАНД ====================

/**
 * Проверить, состоит ли игрок в банде
 */
function isInGang(username, db) {
    if (!db || !username) return false;
    const gangMember = db.gangs.getMemberGang(username);
    return !!gangMember;
}

/**
 * Получить банду игрока
 */
function getPlayerGang(username, db) {
    if (!db || !username) return null;
    return db.gangs.getMemberGang(username);
}

/**
 * Проверить, является ли игрок лидером банды
 */
function isGangLeader(username, db) {
    if (!db || !username) return false;
    const gangMember = db.gangs.getMemberGang(username);
    return gangMember && gangMember.role === 'leader';
}

// ==================== ПРОВЕРКИ ДЛЯ ГРАБЕЖЕЙ ====================

/**
 * Проверить, может ли игрок участвовать в ограблении
 */
function canRob(username, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const baseCheck = checkCommandAccess(username, '/grab', db);
    if (!baseCheck.allowed) return baseCheck;

    // Проверка RP-статуса
    const rpMember = db.rpMembers.get(username);
    if (!rpMember || rpMember.is_active !== 1) {
        return { allowed: false, reason: 'not_rp_member', message: '&cВы не участник RolePlay!' };
    }

    // Проверка, не в организации ли (госслужащие не грабят)
    if (rpMember.organization) {
        return {
            allowed: false,
            reason: 'is_government',
            message: '&cГосударственные служащие не могут участвовать в ограблениях!'
        };
    }

    // Проверка кулдауна
    const lastRobbery = db.robberies.getCooldown(username);
    if (lastRobbery) {
        const cooldownEnd = new Date(lastRobbery.getTime() + config.robbery.cooldownHours * 3600000);
        if (cooldownEnd > new Date()) {
            const remaining = Math.ceil((cooldownEnd - new Date()) / 60000);
            return {
                allowed: false,
                reason: 'cooldown',
                message: `&cВы недавно участвовали в ограблении. Подождите ещё ${remaining} мин.`
            };
        }
    }

    return { allowed: true };
}

// ==================== ПРОВЕРКИ ДЛЯ АРМИИ (ПОСТАВКИ) ====================

/**
 * Проверить, может ли игрок участвовать в поставке
 */
function canSupply(username, db) {
    if (!db) return { allowed: false, reason: 'no_db' };

    const baseCheck = checkCommandAccess(username, '/supply', db);
    if (!baseCheck.allowed) return baseCheck;

    if (!isInOrganization(username, 'army', db)) {
        return { allowed: false, reason: 'not_army', message: '&cТолько военнослужащие могут участвовать в поставках!' };
    }

    return { allowed: true };
}

// ==================== УТИЛИТЫ ====================

/**
 * Получить читаемое название ранга персонала
 */
function getStaffRankName(rankKey) {
    const rank = config.staffRanks[rankKey];
    return rank ? rank.name : 'Неизвестно';
}

/**
 * Получить читаемое название организации
 */
function getOrganizationName(orgKey) {
    const org = config.organizations[orgKey];
    return org ? org.name : 'Неизвестно';
}

/**
 * Получить список всех организаций
 */
function getAllOrganizationKeys() {
    return Object.keys(config.organizations);
}

/**
 * Получить список всех рангов организации
 */
function getOrganizationRanks(orgKey) {
    const org = config.organizations[orgKey];
    if (!org) return [];
    return Object.keys(org.ranks);
}

module.exports = {
    // Константы
    STAFF_HIERARCHY,
    ORG_RANK_HIERARCHY,
    JAIL_ALLOWED_COMMANDS,
    SICK_ALLOWED_COMMANDS,
    OUT_OF_CITY_ALLOWED_COMMANDS,

    // Проверки персонала
    isAdmin,
    isCurator,
    isStaff,
    getStaffRank,
    getStaffLevel,
    canManageStaff,
    canPunish,
    canExecuteStaffCommand,

    // Проверки RP
    isRpMember,
    isInCity,
    isInJail,
    isSick,
    isFrozen,
    isBlacklistedFromRp,
    isInOrganization,
    getPlayerOrganization,
    getPlayerOrgRank,
    getPlayerOrgLevel,
    isOrgLeader,
    isMinister,
    isMayor,
    hasEducation,
    hasAdvancedEducation,
    hasMedicalBook,

    // Проверки доступа
    checkCommandAccess,
    checkOrgCommandAccess,
    checkOrgLeaderAccess,

    // Проверки банд
    isInGang,
    getPlayerGang,
    isGangLeader,

    // Проверки ограблений
    canRob,

    // Проверки армии
    canSupply,

    // Утилиты
    getStaffRankName,
    getOrganizationName,
    getAllOrganizationKeys,
    getOrganizationRanks,
};