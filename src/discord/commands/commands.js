// src/discord/commands/commands.js — Основные Discord-команды Resistance City v5.0.0
// Полный набор слеш-команд для управления городом через Discord

'use strict';

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const utils = require('../../shared/utils');
const permissions = require('../../shared/permissions');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Проверить, привязан ли Discord к Minecraft аккаунту
 */
function getLinkedUsername(discordId, db) {
    const member = db.get('SELECT * FROM members WHERE discord_id = ? AND discord_verified = 1', [discordId]);
    return member ? member.username : null;
}

/**
 * Получить RP-профиль по Discord ID
 */
function getRpByDiscord(discordId, db) {
    const member = db.get('SELECT * FROM members WHERE discord_id = ? AND discord_verified = 1', [discordId]);
    if (!member) return null;
    return db.rpMembers.get(member.username);
}

/**
 * Создать базовый ембед Resistance
 */
function createEmbed(title, description, color = '#6343d4') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'Resistance City v5.0.0' })
        .setTimestamp();
}

// ==================== СПИСОК КОМАНД ====================

const commands = [
    // ==================== /HELP ====================
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Показать список доступных команд'),
        cooldown: 5,
        async execute(interaction, client, db, config, utils, permissions) {
            const username = getLinkedUsername(interaction.user.id, db);
            const rpMember = username ? db.rpMembers.get(username) : null;

            const embed = createEmbed('📋 Команды Resistance', 'Полный список команд доступен в игре через /help');

            embed.addFields(
                { name: '🎮 Игровые команды', value: '`/help` — список команд\n`/rp` — регистрация в RolePlay\n`/balance` — баланс\n`/pay` — перевод денег\n`/pass` — паспорт', inline: false },
                { name: '🏠 Имущество', value: '`/im` — управление имуществом\n`/biz` — бизнесы\n`/office` — офисы\n`/license` — лицензии', inline: false },
            );

            if (rpMember && rpMember.organization) {
                embed.addFields({
                    name: '🏛️ Организация',
                    value: `Вы состоите в: **${rpMember.organization}**\nРанг: ${rpMember.rank || 'Нет'}\nИспользуйте \`/org\` в игре`,
                    inline: false,
                });
            }

            if (!username) {
                embed.addFields({
                    name: '🔗 Верификация',
                    value: 'Вы не привязали Minecraft аккаунт!\nИспользуйте `/verify` для привязки.',
                    inline: false,
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        },
    },

    // ==================== /VERIFY ====================
    {
        data: new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Привязать Minecraft аккаунт к Discord'),
        cooldown: 30,
        async execute(interaction, client, db, config, utils, permissions) {
            const discordId = interaction.user.id;

            // Проверка существующей верификации
            const member = db.get('SELECT * FROM members WHERE discord_id = ? AND discord_verified = 1', [discordId]);

            if (member) {
                const embed = createEmbed('✅ Уже верифицирован',
                    `Ваш Discord привязан к аккаунту: **${member.username}**\n\n` +
                    'Если нужно перепривязать — обратитесь к администратору.',
                    '#76C519');

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Проверка активного кода
            const existingCodes = db.verification.getByDiscordId(discordId);
            const activeCode = existingCodes.find(c => c.is_active === 1);

            if (activeCode) {
                const embed = createEmbed('🔗 Код верификации',
                    `Ваш код: **\`${activeCode.code}\`**\n\n` +
                    'Отправьте этот код в Minecraft:\n' +
                    `\`/link ${activeCode.code}\`\n\n` +
                    `Код истекает: ${utils.formatDate(activeCode.expires_at)}`,
                    '#FFB800');

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Создание нового кода
            const code = db.verification.createCode(discordId);

            const embed = createEmbed('🔗 Верификация Resistance',
                'Чтобы привязать Minecraft аккаунт к Discord:',
                '#6343d4');

            embed.addFields(
                { name: '📋 Инструкция', value: '1. Зайдите на сервер Minecraft\n2. Отправьте боту команду:\n**`/link ' + code + '`**\n3. Готово!' },
                { name: '⏰ Срок действия', value: 'Код действителен **30 минут**' },
                { name: '💡 Ваш код', value: `**\`${code}\`**` }
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });

            // Отправка в ЛС
            try {
                await interaction.user.send({ embeds: [embed] });
            } catch (e) {}
        },
    },

    // ==================== /PROFILE ====================
    {
        data: new SlashCommandBuilder()
            .setName('profile')
            .setDescription('Показать ваш RP-профиль')
            .addUserOption(option =>
                option.setName('игрок')
                    .setDescription('Показать профиль другого игрока')
                    .setRequired(false)),
        cooldown: 5,
        async execute(interaction, client, db, config, utils, permissions) {
            const targetUser = interaction.options.getUser('игрок') || interaction.user;
            const username = getLinkedUsername(targetUser.id, db);

            if (!username) {
                if (targetUser.id === interaction.user.id) {
                    await interaction.reply({
                        content: 'Вы не привязали аккаунт! Используйте `/verify`.',
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: 'Этот пользователь не привязал Minecraft аккаунт.',
                        ephemeral: true,
                    });
                }
                return;
            }

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.is_active !== 1) {
                await interaction.reply({
                    content: `${username} не зарегистрирован в RolePlay.`,
                    ephemeral: true,
                });
                return;
            }

            const clanMember = db.members.get(username);
            const bankAccount = db.bank.getAccount(username);
            const properties = db.properties.getOwned(username);

            const embed = createEmbed(`📋 Профиль: ${username}`, null, '#6343d4');

            // Основное
            embed.addFields(
                { name: '👤 Основное', value: `ID: ${rpMember.id}\nВ RP с: ${utils.formatDate(rpMember.rp_joined_at)}\nЧасов: ${(rpMember.total_hours || 0).toFixed(1)}`, inline: true },
                { name: '💰 Финансы', value: `Баланс: ${utils.formatMoney(rpMember.balance)}\nБанк: ${utils.formatMoney(rpMember.bank_balance)}`, inline: true },
            );

            // Клан
            if (clanMember) {
                embed.addFields({
                    name: '⚔️ Клан',
                    value: `Убийств: ${clanMember.kills}\nСмертей: ${clanMember.deaths}\nK/D: ${clanMember.deaths > 0 ? (clanMember.kills / clanMember.deaths).toFixed(2) : clanMember.kills}`,
                    inline: true,
                });
            }

            // Организация
            if (rpMember.organization) {
                embed.addFields({
                    name: '🏛️ Организация',
                    value: `${rpMember.organization}\nРанг: ${rpMember.rank || 'Нет'}`,
                    inline: false,
                });
            }

            // Имущество
            if (properties.length > 0) {
                embed.addFields({
                    name: `🏠 Имущество (${properties.length})`,
                    value: properties.slice(0, 5).map(p => `#${p.property_id} ${p.property_type}`).join('\n') + (properties.length > 5 ? `\n... и ещё ${properties.length - 5}` : ''),
                    inline: false,
                });
            }

            // Статус
            const statusLines = [];
            if (rpMember.is_in_jail) statusLines.push('🔒 В тюрьме');
            if (rpMember.is_sick) statusLines.push('🤒 Болен');
            if (rpMember.is_frozen) statusLines.push('❄️ Заморожен');
            if (!rpMember.is_in_city) statusLines.push('📍 Не в городе');
            if (statusLines.length === 0) statusLines.push('✅ Всё хорошо');

            embed.addFields({
                name: '📍 Статус',
                value: statusLines.join('\n'),
                inline: false,
            });

            await interaction.reply({ embeds: [embed] });
        },
    },

    // ==================== /BALANCE ====================
    {
        data: new SlashCommandBuilder()
            .setName('balance')
            .setDescription('Проверить баланс'),
        cooldown: 3,
        async execute(interaction, client, db, config, utils, permissions) {
            const username = getLinkedUsername(interaction.user.id, db);

            if (!username) {
                await interaction.reply({
                    content: 'Привяжите аккаунт через `/verify`!',
                    ephemeral: true,
                });
                return;
            }

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.is_active !== 1) {
                await interaction.reply({
                    content: 'Вы не зарегистрированы в RP. Используйте `/rp` в игре.',
                    ephemeral: true,
                });
                return;
            }

            const bankAccount = db.bank.getAccount(username);

            const embed = createEmbed('💰 Баланс', null, '#76C519');
            embed.addFields(
                { name: 'Наличные', value: utils.formatMoney(rpMember.balance), inline: true },
                { name: 'Банк', value: utils.formatMoney(bankAccount?.balance || 0), inline: true },
                { name: 'Всего', value: utils.formatMoney(rpMember.balance + (bankAccount?.balance || 0)), inline: true },
            );

            if (bankAccount && bankAccount.credit_amount > 0) {
                embed.addFields({
                    name: '⚠ Кредит',
                    value: `${utils.formatMoney(bankAccount.credit_amount)}\nДо: ${utils.formatDate(bankAccount.credit_due_date)}`,
                    inline: false,
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        },
    },

    // ==================== /PAY ====================
    {
        data: new SlashCommandBuilder()
            .setName('pay')
            .setDescription('Перевести деньги игроку')
            .addStringOption(option =>
                option.setName('ник')
                    .setDescription('Никнейм получателя')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('сумма')
                    .setDescription('Сумма перевода')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(50000)),
        cooldown: 15,
        async execute(interaction, client, db, config, utils, permissions) {
            const username = getLinkedUsername(interaction.user.id, db);

            if (!username) {
                await interaction.reply({
                    content: 'Привяжите аккаунт через `/verify`!',
                    ephemeral: true,
                });
                return;
            }

            const target = interaction.options.getString('ник');
            const amount = interaction.options.getInteger('сумма');

            const rpMember = db.rpMembers.get(username);
            if (!rpMember || rpMember.is_active !== 1) {
                await interaction.reply({
                    content: 'Вы не в RP. Используйте `/rp` в игре.',
                    ephemeral: true,
                });
                return;
            }

            if (rpMember.balance < amount) {
                await interaction.reply({
                    content: `Недостаточно средств! Баланс: ${utils.formatMoney(rpMember.balance)}`,
                    ephemeral: true,
                });
                return;
            }

            const targetMember = db.rpMembers.get(target);
            if (!targetMember || targetMember.is_active !== 1) {
                await interaction.reply({
                    content: 'Получатель не найден в RP.',
                    ephemeral: true,
                });
                return;
            }

            db.rpMembers.updateBalance(username, -amount, 'transfer_sent', `Перевод ${target}`, 'Discord');
            db.rpMembers.updateBalance(target, amount, 'transfer_received', `Перевод от ${username}`, 'Discord');

            const embed = createEmbed('✅ Перевод выполнен', null, '#76C519');
            embed.addFields(
                { name: 'Отправитель', value: username, inline: true },
                { name: 'Получатель', value: target, inline: true },
                { name: 'Сумма', value: utils.formatMoney(amount), inline: true },
            );

            await interaction.reply({ embeds: [embed] });

            // Уведомление в игру (через IPC)
            if (process.send) {
                process.send({
                    type: 'minecraft_command',
                    command: `/msg ${target} &#76C519📥 Перевод ${utils.formatMoney(amount)} от ${username}`,
                });
            }
        },
    },

    // ==================== /TOP ====================
    {
        data: new SlashCommandBuilder()
            .setName('top')
            .setDescription('Топ игроков')
            .addStringOption(option =>
                option.setName('тип')
                    .setDescription('Категория топа')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Баланс', value: 'balance' },
                        { name: 'Убийства', value: 'kills' },
                        { name: 'Часы в RP', value: 'hours' },
                        { name: 'PayDay', value: 'payday' },
                    )),
        cooldown: 10,
        async execute(interaction, client, db, config, utils, permissions) {
            const type = interaction.options.getString('тип');

            let title, results;

            switch (type) {
                case 'balance': {
                    title = '💰 Топ по балансу';
                    results = db.all(
                        'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT 10'
                    );
                    break;
                }
                case 'kills': {
                    title = '⚔️ Топ по убийствам';
                    results = db.all(
                        'SELECT username, kills FROM members WHERE is_in_clan = 1 ORDER BY kills DESC LIMIT 10'
                    );
                    break;
                }
                case 'hours': {
                    title = '⏰ Топ по часам в RP';
                    results = db.all(
                        'SELECT username, total_hours FROM rp_members WHERE is_active = 1 ORDER BY total_hours DESC LIMIT 10'
                    );
                    break;
                }
                case 'payday': {
                    title = '💵 Топ по PayDay';
                    results = db.all(
                        'SELECT username, payday_count FROM rp_members WHERE is_active = 1 ORDER BY payday_count DESC LIMIT 10'
                    );
                    break;
                }
            }

            const embed = createEmbed(title, null, '#FFB800');

            if (results.length === 0) {
                embed.setDescription('Нет данных');
            } else {
                const medals = ['🥇', '🥈', '🥉'];
                let description = '';

                for (let i = 0; i < results.length; i++) {
                    const medal = medals[i] || `${i + 1}.`;
                    let value;
                    switch (type) {
                        case 'balance': value = utils.formatMoney(results[i].balance); break;
                        case 'kills': value = `${results[i].kills} убийств`; break;
                        case 'hours': value = `${(results[i].total_hours || 0).toFixed(1)} ч`; break;
                        case 'payday': value = `${results[i].payday_count} PayDay'ев`; break;
                    }
                    description += `${medal} **${results[i].username}** — ${value}\n`;
                }

                embed.setDescription(description);
            }

            await interaction.reply({ embeds: [embed] });
        },
    },

    // ==================== /STATS ====================
    {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Статистика города')
            .addStringOption(option =>
                option.setName('тип')
                    .setDescription('Тип статистики')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Общая', value: 'general' },
                        { name: 'Организации', value: 'orgs' },
                        { name: 'Экономика', value: 'economy' },
                    )),
        cooldown: 10,
        async execute(interaction, client, db, config, utils, permissions) {
            const type = interaction.options.getString('тип') || 'general';

            const embed = createEmbed('📊 Статистика Resistance', null, '#80C4C5');

            switch (type) {
                case 'general': {
                    const rpCount = db.rpMembers.count();
                    const clanCount = db.members.count();
                    const onlineCount = db.rpMembers.countOnline();
                    const jailedCount = db.all(
                        "SELECT COUNT(*) as count FROM rp_members WHERE is_in_jail = 1 AND is_active = 1"
                    )[0]?.count || 0;
                    const sickCount = db.all(
                        "SELECT COUNT(*) as count FROM rp_members WHERE is_sick = 1 AND is_active = 1"
                    )[0]?.count || 0;

                    embed.addFields(
                        { name: '👥 Население', value: `RP: ${rpCount}\nКлан: ${clanCount}\nВ городе: ${onlineCount}`, inline: true },
                        { name: '⚠ Статус', value: `В тюрьме: ${jailedCount}\nБольны: ${sickCount}`, inline: true },
                    );
                    break;
                }
                case 'orgs': {
                    const allOrgs = db.orgBudgets.getAll();
                    let orgsText = '';
                    for (const org of allOrgs) {
                        const employees = db.all(
                            'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                            [org.name]
                        )[0]?.count || 0;
                        orgsText += `**${org.name}**: ${employees} чел., ${utils.formatMoney(org.budget)}\n`;
                    }
                    embed.setDescription(orgsText);
                    break;
                }
                case 'economy': {
                    const totalMoney = db.all(
                        'SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1'
                    )[0]?.total || 0;
                    const totalBank = db.all(
                        'SELECT SUM(balance) as total FROM bank_accounts WHERE is_active = 1'
                    )[0]?.total || 0;

                    embed.addFields(
                        { name: '💰 Денег у игроков', value: utils.formatMoney(totalMoney), inline: true },
                        { name: '🏦 В банках', value: utils.formatMoney(totalBank), inline: true },
                        { name: '💵 Всего', value: utils.formatMoney(totalMoney + totalBank), inline: true },
                    );
                    break;
                }
            }

            await interaction.reply({ embeds: [embed] });
        },
    },

    // ==================== /PING ====================
    {
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Проверить задержку бота'),
        cooldown: 3,
        async execute(interaction, client, db, config, utils, permissions) {
            const sent = await interaction.reply({
                content: 'Измеряю пинг...',
                ephemeral: true,
                fetchReply: true,
            });

            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);

            await interaction.editReply({
                content: `🏓 Понг!\nЗадержка бота: ${latency}ms\nAPI задержка: ${apiLatency}ms`,
            });
        },
    },
];

// ==================== КОМАНДЫ ДЛЯ ПЕРСОНАЛА ====================

// /logs — просмотр логов (только для персонала)
commands.push({
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Просмотреть логи игрока [Персонал]')
        .addStringOption(option =>
            option.setName('ник')
                .setDescription('Никнейм игрока')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('тип')
                .setDescription('Тип логов')
                .setRequired(false)
                .addChoices(
                    { name: 'Всё', value: 'all' },
                    { name: 'Наказания', value: 'punishments' },
                    { name: 'Финансы', value: 'balance' },
                    { name: 'Чат', value: 'chat' },
                )),
    cooldown: 5,
    async execute(interaction, client, db, config, utils, permissions) {
        const username = getLinkedUsername(interaction.user.id, db);
        if (!username) {
            await interaction.reply({ content: 'Привяжите аккаунт!', ephemeral: true });
            return;
        }

        // Проверка прав персонала
        const staff = db.staff.get(username);
        if (!staff || staff.is_active !== 1) {
            await interaction.reply({ content: 'Недостаточно прав!', ephemeral: true });
            return;
        }

        const target = interaction.options.getString('ник');
        const logType = interaction.options.getString('тип') || 'all';

        const embed = createEmbed(`📋 Логи: ${target}`, null, '#80C4C5');

        switch (logType) {
            case 'punishments': {
                const punishments = db.punishments.getByUsername(target, 20);
                if (punishments.length === 0) {
                    embed.setDescription('Нет наказаний');
                } else {
                    let text = '';
                    for (const p of punishments.slice(0, 10)) {
                        const status = p.is_active ? '🟥' : '🟩';
                        text += `${status} **${p.type}** — ${p.reason}\n`;
                        text += `Выдал: ${p.issued_by} | ${utils.formatDate(p.issued_at)}\n\n`;
                    }
                    embed.setDescription(text);
                }
                break;
            }
            case 'balance': {
                const logs = db.all(
                    'SELECT * FROM balance_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT 20',
                    [target.toLowerCase()]
                );
                if (logs.length === 0) {
                    embed.setDescription('Нет финансовых операций');
                } else {
                    let text = '';
                    for (const l of logs.slice(0, 10)) {
                        const sign = l.amount >= 0 ? '+' : '';
                        text += `${sign}${utils.formatMoney(l.amount)} — ${l.type}\n`;
                        text += `${utils.formatDate(l.created_at)}\n\n`;
                    }
                    embed.setDescription(text);
                }
                break;
            }
            case 'chat': {
                const chatLogs = db.chatLogs.getClanChatLogs(target, 20);
                if (chatLogs.length === 0) {
                    embed.setDescription('Нет сообщений');
                } else {
                    let text = '';
                    for (const l of chatLogs.slice(0, 10)) {
                        text += `**${utils.formatDate(l.created_at)}**\n${l.message.substring(0, 200)}\n\n`;
                    }
                    embed.setDescription(text);
                }
                break;
            }
            default: {
                const punishments = db.punishments.getByUsername(target, 5);
                const balanceLogs = db.all(
                    'SELECT * FROM balance_logs WHERE username_lower = ? ORDER BY created_at DESC LIMIT 5',
                    [target.toLowerCase()]
                );

                let text = '';
                if (punishments.length > 0) {
                    text += '**Наказания:**\n';
                    for (const p of punishments.slice(0, 3)) {
                        text += `- ${p.type}: ${p.reason}\n`;
                    }
                }
                if (balanceLogs.length > 0) {
                    text += '\n**Финансы:**\n';
                    for (const l of balanceLogs.slice(0, 3)) {
                        text += `- ${utils.formatMoney(l.amount)} (${l.type})\n`;
                    }
                }
                embed.setDescription(text || 'Нет данных');
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
});

// ==================== ЭКСПОРТ ====================
module.exports = { commands };