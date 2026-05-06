// src/discord/commands/slash.js — Регистрация и управление слеш-командами Resistance City v5.0.0
// Динамическая загрузка, регистрация в Discord API, обновление команд

'use strict';

const { REST, Routes, Collection, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logger, createLogger } = require('../../shared/logger');
const config = require('../../config');

const slashLogger = createLogger('SlashCommands');

// ==================== КОНСТАНТЫ ====================
const COMMANDS_DIR = __dirname;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// ==================== ЗАГРУЗКА КОМАНД ИЗ ФАЙЛОВ ====================

/**
 * Загрузить все команды из указанной директории
 * @param {string} directory - Путь к папке с командами
 * @returns {Collection} Коллекция команд
 */
function loadCommandsFromDirectory(directory) {
    const commands = new Collection();

    if (!fs.existsSync(directory)) {
        slashLogger.warn(`Директория не найдена: ${directory}`);
        return commands;
    }

    const commandFiles = fs.readdirSync(directory).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const filePath = path.join(directory, file);
            const command = require(filePath);

            // Поддержка одиночных команд
            if (command.data && command.execute) {
                commands.set(command.data.name, command);
                slashLogger.debug(`Загружена команда: /${command.data.name} (из ${file})`);
                continue;
            }

            // Поддержка массивов команд (commands.js)
            if (command.commands && Array.isArray(command.commands)) {
                for (const cmd of command.commands) {
                    if (cmd.data && cmd.execute) {
                        commands.set(cmd.data.name, cmd);
                        slashLogger.debug(`Загружена команда: /${cmd.data.name} (из ${file})`);
                    }
                }
                continue;
            }

            slashLogger.warn(`Файл ${file} не содержит валидных команд`);
        } catch (error) {
            slashLogger.error(`Ошибка загрузки команды из ${file}: ${error.message}`);
            if (error.stack) slashLogger.debug(error.stack);
        }
    }

    return commands;
}

/**
 * Загрузить все команды из всех подпапок
 * @returns {Collection} Полная коллекция команд
 */
function loadAllCommands() {
    const allCommands = new Collection();

    // Загрузка из основной папки
    const mainCommands = loadCommandsFromDirectory(COMMANDS_DIR);
    mainCommands.forEach((cmd, name) => allCommands.set(name, cmd));

    // Загрузка из подпапок
    const subdirs = ['admin', 'economy', 'player', 'staff', 'moderation', 'rp', 'property', 'org']
        .map(dir => path.join(COMMANDS_DIR, dir))
        .filter(dir => fs.existsSync(dir));

    for (const subdir of subdirs) {
        const subCommands = loadCommandsFromDirectory(subdir);
        subCommands.forEach((cmd, name) => {
            if (allCommands.has(name)) {
                slashLogger.warn(`Конфликт имён команд: /${name} (перезаписана из ${subdir})`);
            }
            allCommands.set(name, cmd);
        });
    }

    slashLogger.success(`Всего загружено ${allCommands.size} слеш-команд`);
    return allCommands;
}

// ==================== РЕГИСТРАЦИЯ В DISCORD API ====================

/**
 * Зарегистрировать команды в Discord API
 * @param {Collection} commands - Коллекция команд
 * @param {boolean} global - Глобальная регистрация (может занять до часа)
 * @returns {Promise<object>} Результат регистрации
 */
async function registerCommands(commands, global = false) {
    if (!DISCORD_TOKEN || !CLIENT_ID) {
        slashLogger.error('Отсутствуют DISCORD_TOKEN или DISCORD_CLIENT_ID');
        return { success: false, reason: 'missing_credentials' };
    }

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    // Подготовка данных команд
    const commandsData = [];
    for (const cmd of commands.values()) {
        if (cmd.data) {
            try {
                commandsData.push(cmd.data.toJSON());
            } catch (error) {
                slashLogger.error(`Ошибка сериализации команды /${cmd.data.name}: ${error.message}`);
            }
        }
    }

    slashLogger.info(`Подготовлено ${commandsData.length} команд для регистрации`);

    try {
        let result;

        if (global) {
            // Глобальная регистрация
            slashLogger.info('Выполняется глобальная регистрация команд...');
            result = await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commandsData }
            );
            slashLogger.success(`Глобально зарегистрировано ${result.length} команд`);
        } else if (GUILD_ID) {
            // Регистрация для конкретного сервера (мгновенно)
            slashLogger.info(`Регистрация команд для сервера ${GUILD_ID}...`);
            result = await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commandsData }
            );
            slashLogger.success(`Зарегистрировано ${result.length} команд для сервера`);
        } else {
            slashLogger.error('Не указан GUILD_ID и не выбран глобальный режим');
            return { success: false, reason: 'no_guild_id' };
        }

        return {
            success: true,
            count: result.length,
            commands: result.map(c => ({ name: c.name, id: c.id })),
        };
    } catch (error) {
        slashLogger.error(`Ошибка регистрации команд: ${error.message}`);
        if (error.stack) slashLogger.debug(error.stack);

        // Детальная информация об ошибках Discord API
        if (error.rawError) {
            slashLogger.error(`Discord API ошибка: ${JSON.stringify(error.rawError)}`);
        }

        return {
            success: false,
            reason: error.message,
            code: error.code,
        };
    }
}

/**
 * Удалить все команды
 * @param {boolean} global - Глобальное удаление
 */
async function deleteAllCommands(global = false) {
    if (!DISCORD_TOKEN || !CLIENT_ID) {
        slashLogger.error('Отсутствуют учетные данные Discord');
        return { success: false, reason: 'missing_credentials' };
    }

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        if (global) {
            slashLogger.warn('Удаление ВСЕХ глобальных команд...');
            const existingCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));

            for (const cmd of existingCommands) {
                await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
                slashLogger.debug(`Удалена глобальная команда: ${cmd.name} (${cmd.id})`);
            }

            slashLogger.success(`Удалено ${existingCommands.length} глобальных команд`);
            return { success: true, count: existingCommands.length };
        } else if (GUILD_ID) {
            slashLogger.warn(`Удаление команд сервера ${GUILD_ID}...`);
            const existingCommands = await rest.get(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            );

            for (const cmd of existingCommands) {
                await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id));
                slashLogger.debug(`Удалена команда сервера: ${cmd.name} (${cmd.id})`);
            }

            slashLogger.success(`Удалено ${existingCommands.length} команд сервера`);
            return { success: true, count: existingCommands.length };
        }

        return { success: false, reason: 'no_guild_id' };
    } catch (error) {
        slashLogger.error(`Ошибка удаления команд: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Получить список зарегистрированных команд
 */
async function getRegisteredCommands(global = false) {
    if (!DISCORD_TOKEN || !CLIENT_ID) {
        return { success: false, reason: 'missing_credentials' };
    }

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        let commands;
        if (global) {
            commands = await rest.get(Routes.applicationCommands(CLIENT_ID));
        } else if (GUILD_ID) {
            commands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
        } else {
            return { success: false, reason: 'no_guild_id' };
        }

        return {
            success: true,
            count: commands.length,
            commands: commands.map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                options: c.options?.length || 0,
                createdAt: c.created_at,
            })),
        };
    } catch (error) {
        slashLogger.error(`Ошибка получения команд: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

/**
 * Обновить конкретную команду
 */
async function updateSingleCommand(commandName, commandData, global = false) {
    if (!DISCORD_TOKEN || !CLIENT_ID) {
        return { success: false, reason: 'missing_credentials' };
    }

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        // Получаем существующие команды
        let existingCommands;
        if (global) {
            existingCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));
        } else if (GUILD_ID) {
            existingCommands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
        } else {
            return { success: false, reason: 'no_guild_id' };
        }

        // Ищем команду по имени
        const existingCommand = existingCommands.find(c => c.name === commandName);

        if (existingCommand) {
            // Обновляем существующую
            if (global) {
                await rest.patch(
                    Routes.applicationCommand(CLIENT_ID, existingCommand.id),
                    { body: commandData.toJSON() }
                );
            } else {
                await rest.patch(
                    Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, existingCommand.id),
                    { body: commandData.toJSON() }
                );
            }
            slashLogger.info(`Команда /${commandName} обновлена`);
        } else {
            // Создаём новую
            if (global) {
                await rest.post(
                    Routes.applicationCommands(CLIENT_ID),
                    { body: commandData.toJSON() }
                );
            } else {
                await rest.post(
                    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                    { body: commandData.toJSON() }
                );
            }
            slashLogger.info(`Команда /${commandName} создана`);
        }

        return { success: true };
    } catch (error) {
        slashLogger.error(`Ошибка обновления команды /${commandName}: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

// ==================== ВАЛИДАЦИЯ КОМАНД ====================

/**
 * Проверить команду на корректность
 */
function validateCommand(command) {
    const errors = [];

    if (!command.data) {
        errors.push('Отсутствует data');
    } else {
        if (!command.data.name) errors.push('Отсутствует имя команды');
        if (!command.data.description) errors.push('Отсутствует описание команды');

        // Проверка имени (строчные буквы, без пробелов)
        if (command.data.name && !/^[a-z0-9_-]{1,32}$/.test(command.data.name)) {
            errors.push(`Некорректное имя: ${command.data.name}`);
        }

        // Проверка длины описания
        if (command.data.description && command.data.description.length > 100) {
            errors.push('Описание слишком длинное (макс. 100 символов)');
        }
    }

    if (!command.execute || typeof command.execute !== 'function') {
        errors.push('Отсутствует execute функция');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Проверить все команды и вывести отчёт
 */
function validateAllCommands(commands) {
    const report = {
        total: commands.size,
        valid: 0,
        invalid: 0,
        errors: [],
    };

    for (const [name, cmd] of commands) {
        const validation = validateCommand(cmd);
        if (validation.valid) {
            report.valid++;
        } else {
            report.invalid++;
            report.errors.push({
                command: name,
                errors: validation.errors,
            });
        }
    }

    return report;
}

// ==================== ЭКСПОРТИРОВАНИЕ КОМАНД ====================

/**
 * Экспортировать список команд в JSON для документации
 */
function exportCommandsList(commands) {
    const list = [];

    for (const [name, cmd] of commands) {
        if (!cmd.data) continue;

        const entry = {
            name: cmd.data.name,
            description: cmd.data.description,
            options: [],
            cooldown: cmd.cooldown || 3,
            category: cmd.category || 'general',
            staffOnly: cmd.staffOnly || false,
        };

        if (cmd.data.options) {
            for (const option of cmd.data.options) {
                entry.options.push({
                    name: option.name,
                    description: option.description,
                    type: option.type,
                    required: option.required || false,
                    choices: option.choices?.map(c => ({ name: c.name, value: c.value })) || [],
                });
            }
        }

        list.push(entry);
    }

    // Сортировка по категориям и именам
    list.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
    });

    return list;
}

// ==================== ДЕПЛОЙ (ОСНОВНАЯ ФУНКЦИЯ) ====================

/**
 * Загрузить и зарегистрировать все команды
 * @param {boolean} global - Глобальная регистрация
 * @param {boolean} clearFirst - Удалить существующие команды перед регистрацией
 */
async function deployCommands(global = false, clearFirst = false) {
    slashLogger.info('╔══════════════════════════════════════╗');
    slashLogger.info('║  ДЕПЛОЙ DISCORD КОМАНД               ║');
    slashLogger.info('╚══════════════════════════════════════╝');

    // Загрузка команд
    const commands = loadAllCommands();

    if (commands.size === 0) {
        slashLogger.warn('Нет команд для регистрации');
        return { success: false, reason: 'no_commands' };
    }

    // Валидация
    const validationReport = validateAllCommands(commands);
    slashLogger.info(`Валидация: ${validationReport.valid} OK, ${validationReport.invalid} ошибок`);

    if (validationReport.invalid > 0) {
        for (const err of validationReport.errors) {
            slashLogger.warn(`Команда /${err.command}: ${err.errors.join('; ')}`);
        }
    }

    // Очистка если нужно
    if (clearFirst) {
        slashLogger.warn('Очистка существующих команд...');
        await deleteAllCommands(global);
    }

    // Регистрация
    const result = await registerCommands(commands, global);

    if (result.success) {
        slashLogger.success(`✅ Деплой завершён! Зарегистрировано ${result.count} команд.`);
    } else {
        slashLogger.error(`❌ Ошибка деплоя: ${result.reason}`);
    }

    return result;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    loadCommandsFromDirectory,
    loadAllCommands,
    registerCommands,
    deleteAllCommands,
    getRegisteredCommands,
    updateSingleCommand,
    validateCommand,
    validateAllCommands,
    exportCommandsList,
    deployCommands,
};