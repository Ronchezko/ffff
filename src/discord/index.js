// src/discord/index.js
// Discord бот для Resistance City

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ActivityType } = require('discord.js');
const logger = require('../shared/logger');
const verification = require('./verification');
const reminders = require('./reminders');

let client = null;
let db = null;

// ID каналов и ролей из .env
const VERIFY_CHANNEL_ID = process.env.DISCORD_VERIFY_CHANNEL || '1466550097759174773';
const COMMANDS_CHANNEL_ID = process.env.DISCORD_COMMANDS_CHANNEL;
const LOGS_CHANNEL_ID = process.env.DISCORD_LOGS_CHANNEL || '1474633679442804798';
const VERIFY_ROLE_ID = process.env.DISCORD_VERIFY_ROLE || '1466550097218113794';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// Роли для организаций
const ORG_ROLES = {
    police: '1489552034750529596',      // Рядовой
    police_sergeant: '1489552108872007845',
    police_praporshik: '1489552141881315338',
    police_lieutenant: '1489552162701705266',
    police_captain: '1489552204749733928',
    police_ltcolonel: '1489552226480296089',
    police_colonel: '1489552253940662383',
    army: '1489552700252356678',        // Рядовой
    army_sergeant: '1489552723798921368',
    army_starshina: '1489552753578475661',
    army_praporshik: '1489552883673333811',
    army_lieutenant: '1489552906427302022',
    army_captain: '1489552927545753722',
    army_major: '1489552993140342795',
    army_ltcolonel: '1489553011976966197',
    army_colonel: '1489553038522974300',
    army_marshal: '1489553059595026473',
    hospital: '1489553367444357140',    // Санитар
    hospital_nurse: '1489553409110446201',
    hospital_medic: '1489553482938585310',
    hospital_feldsher: '1489553518565003388',
    hospital_laborant: '1489553540031451186',
    hospital_akusher: '1489553560432545822',
    hospital_doctor: '1489553579940515852',
    hospital_chief: '1489553594465124433',
    academy: '1489553832064192532',     // Стажёр
    academy_assistant: '1489553873243996180',
    academy_teacher: '1489553895360299089',
    academy_zav: '1489553925228068955',
    academy_prorector: '1489553950473584770',
    academy_director: '1489553978701381695',
    government: '1489554527312150639',   // Адвокат
    government_prosecutor: '1489554554780651530',
    government_judge_assistant: '1489554582207205406',
    government_judge: '1489554605506560030',
    government_defense: '1489554694203510876',
    government_internal: '1489554886847762520',
    government_education: '1489554632249315462',
    government_health: '1489554747563446322',
    government_economy: '1489554777980538951',
    government_mayor: '1489555013180330136'
};

// Роли персонала
const STAFF_ROLES = {
    admin: '1466550097239212076',
    curator: '1489551910154403960',
    glmoder: '1466550097239212075',
    stmoder: '1466550097218113798',
    moder: '1466550097218113797',
    mlmoder: '1466550097218113796'
};

async function start(database) {
    db = database;
    
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages
        ]
    });
    
    client.once('ready', async () => {
        logger.success(`✅ Discord бот запущен как ${client.user.tag}`);
        
        // Устанавливаем статус "Играет в Minecraft"
        client.user.setPresence({
            activities: [{
                name: 'Minecraft на dexland.org:25565',
                type: ActivityType.Playing
            }],
            status: 'online'
        });
        
        // Регистрируем команды
        await registerCommands();
        
        // Запускаем напоминания
        reminders.start(client, db);
        
        // Запускаем синхронизацию ролей
        startRoleSync();
    });
    
    // Обработка команд
    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        }
    });
    
    // Обработка сообщений в командном канале
    client.on(Events.MessageCreate, async message => {
        if (message.author.bot) return;
        
        // Команды из игрового канала
        if (message.channel.id === COMMANDS_CHANNEL_ID) {
            await handleGameCommand(message);
        }
    });
    
    // Обработка новых участников
    client.on(Events.GuildMemberAdd, async member => {
        await handleNewMember(member);
    });
    
    await client.login(process.env.DISCORD_TOKEN);
    return client;
}

// ============================================
// РЕГИСТРАЦИЯ КОМАНД
// ============================================

async function registerCommands() {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    
    await guild.commands.set([
        {
            name: 'verify',
            description: 'Начать верификацию Minecraft аккаунта'
        },
        {
            name: 'profile',
            description: 'Показать профиль игрока',
            options: [
                {
                    name: 'ник',
                    description: 'Никнейм игрока',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'top',
            description: 'Топ игроков по различным категориям',
            options: [
                {
                    name: 'категория',
                    description: 'money, kills, duty, activity',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'stats',
            description: 'Статистика сервера'
        },
        {
            name: 'balance',
            description: 'Проверить баланс'
        },
        {
            name: 'pay',
            description: 'Перевести деньги',
            options: [
                { name: 'игрок', description: 'Кому', type: 3, required: true },
                { name: 'сумма', description: 'Сколько', type: 4, required: true }
            ]
        },
        {
            name: 'member',
            description: 'Информация об участнике',
            options: [
                { name: 'ник', description: 'Никнейм', type: 3, required: false }
            ]
        },
        {
            name: 'role',
            description: 'Информация о роли',
            options: [
                { name: 'роль', description: 'Название роли', type: 3, required: true }
            ]
        }
    ]);
    
    logger.info('📋 Слэш-команды Discord зарегистрированы');
}

// ============================================
// СИНХРОНИЗАЦИЯ РОЛЕЙ
// ============================================

function startRoleSync() {
    // Синхронизация каждые 10 минут
    setInterval(async () => {
        await syncAllRoles();
    }, 10 * 60 * 1000);
}

async function syncAllRoles() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;
        
        const members = await db.getAllClanMembers();
        if (!members) return;
        
        for (const member of members) {
            const discordMember = await findDiscordMember(member.minecraft_nick);
            if (!discordMember) continue;
            
            // Синхронизируем роли
            await syncMemberRoles(discordMember, member.minecraft_nick);
        }
        
        logger.info('🔄 Синхронизация ролей Discord завершена', 'debug');
    } catch (err) {
        logger.error(`❌ Ошибка синхронизации ролей: ${err.message}`);
    }
}

async function syncMemberRoles(discordMember, mcNick) {
    try {
        const rpProfile = await db.getRPProfile(mcNick);
        const staffRank = await db.getStaffRank(mcNick);
        
        // Сначала удаляем все организационные роли
        const allOrgRoles = Object.values(ORG_ROLES);
        const rolesToRemove = discordMember.roles.cache.filter(role => allOrgRoles.includes(role.id));
        if (rolesToRemove.size > 0) {
            await discordMember.roles.remove(rolesToRemove);
        }
        
        // Выдаём роль по структуре и рангу
        if (rpProfile && rpProfile.structure !== 'Гражданин') {
            const roleId = getRoleByStructure(rpProfile.structure, rpProfile.job_rank);
            if (roleId) {
                await discordMember.roles.add(roleId);
            }
        }
        
        // Выдаём роль персонала
        if (staffRank.rank_level > 0) {
            const staffRoleId = getStaffRoleByLevel(staffRank.rank_level);
            if (staffRoleId) {
                await discordMember.roles.add(staffRoleId);
            }
        }
        
    } catch (err) {
        logger.error(`❌ Ошибка синхронизации ролей для ${mcNick}: ${err.message}`);
    }
}

function getRoleByStructure(structure, rank) {
    const roleMap = {
        'police': {
            'Рядовой': ORG_ROLES.police,
            'Сержант': ORG_ROLES.police_sergeant,
            'Прапорщик': ORG_ROLES.police_praporshik,
            'Лейтенант': ORG_ROLES.police_lieutenant,
            'Капитан': ORG_ROLES.police_captain,
            'Подполковник': ORG_ROLES.police_ltcolonel,
            'Полковник': ORG_ROLES.police_colonel
        },
        'army': {
            'Рядовой': ORG_ROLES.army,
            'Сержант': ORG_ROLES.army_sergeant,
            'Старшина': ORG_ROLES.army_starshina,
            'Прапорщик': ORG_ROLES.army_praporshik,
            'Лейтенант': ORG_ROLES.army_lieutenant,
            'Капитан': ORG_ROLES.army_captain,
            'Майор': ORG_ROLES.army_major,
            'Подполковник': ORG_ROLES.army_ltcolonel,
            'Полковник': ORG_ROLES.army_colonel,
            'Маршал': ORG_ROLES.army_marshal
        },
        'hospital': {
            'Санитар(ка)': ORG_ROLES.hospital,
            'Сестра-хозяйка': ORG_ROLES.hospital_nurse,
            'Медсёстры/Брат': ORG_ROLES.hospital_medic,
            'Фельдшер': ORG_ROLES.hospital_feldsher,
            'Лаборант': ORG_ROLES.hospital_laborant,
            'Акушерка': ORG_ROLES.hospital_akusher,
            'Врач': ORG_ROLES.hospital_doctor,
            'Главный врач': ORG_ROLES.hospital_chief
        },
        'academy': {
            'Стажёр': ORG_ROLES.academy,
            'Ассистент': ORG_ROLES.academy_assistant,
            'Преподаватель': ORG_ROLES.academy_teacher,
            'Зав. кафедрой': ORG_ROLES.academy_zav,
            'Проректор': ORG_ROLES.academy_prorector,
            'Директор': ORG_ROLES.academy_director
        },
        'government': {
            'Адвокат': ORG_ROLES.government,
            'Прокурор': ORG_ROLES.government_prosecutor,
            'Помощник судьи': ORG_ROLES.government_judge_assistant,
            'Судья': ORG_ROLES.government_judge,
            'Министр Обороны': ORG_ROLES.government_defense,
            'Министр ВД': ORG_ROLES.government_internal,
            'Министр Образования': ORG_ROLES.government_education,
            'Министр Здравоохранения': ORG_ROLES.government_health,
            'Министр Экономики': ORG_ROLES.government_economy,
            'Мэр': ORG_ROLES.government_mayor
        }
    };
    
    return roleMap[structure]?.[rank] || null;
}

function getStaffRoleByLevel(level) {
    const staffMap = {
        6: STAFF_ROLES.admin,
        5: STAFF_ROLES.curator,
        4: STAFF_ROLES.glmoder,
        3: STAFF_ROLES.stmoder,
        2: STAFF_ROLES.moder,
        1: STAFF_ROLES.mlmoder
    };
    return staffMap[level] || null;
}

// ============================================
// ОБРАБОТКА КОМАНД
// ============================================

async function handleCommand(interaction) {
    const { commandName, user } = interaction;
    
    switch (commandName) {
        case 'verify':
            await verification.startVerification(interaction, db, client);
            break;
        case 'profile':
            await showProfile(interaction, db);
            break;
        case 'top':
            await showTop(interaction, db);
            break;
        case 'stats':
            await showStats(interaction, db);
            break;
        case 'balance':
            await showBalance(interaction, db);
            break;
        case 'pay':
            await handlePay(interaction, db);
            break;
        case 'member':
            await showMember(interaction, db);
            break;
        case 'role':
            await showRole(interaction, db);
            break;
    }
}

async function handleButton(interaction) {
    const { customId, user } = interaction;
    
    if (customId === 'verify_confirm') {
        await verification.generateCode(interaction, db, client);
    } else if (customId === 'verify_cancel') {
        await interaction.update({
            content: '❌ Верификация отменена',
            embeds: [],
            components: []
        });
    }
}

// ============================================
// ИГРОВЫЕ КОМАНДЫ ИЗ DISCORD
// ============================================

async function handleGameCommand(message) {
    const content = message.content;
    const discordId = message.author.id;
    
    // Получаем Minecraft ник по Discord ID
    const linked = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [discordId]);
    if (!linked) {
        await message.reply('❌ Сначала привяжите аккаунт через /verify');
        setTimeout(() => message.delete().catch(() => {}), 3000);
        return;
    }
    
    const mcNick = linked.minecraft_nick;
    
    // Обработка команды
    if (content.startsWith('/balance')) {
        const balance = await db.getBalance(mcNick);
        await message.reply(`💰 Баланс **${mcNick}**: ${balance.toLocaleString()}₽`);
    }
    else if (content.startsWith('/pay')) {
        const parts = content.split(' ');
        if (parts.length < 3) {
            await message.reply('❌ Использование: /pay [ник] [сумма]');
            setTimeout(() => message.delete().catch(() => {}), 3000);
            return;
        }
        const target = parts[1];
        const amount = parseInt(parts[2]);
        
        if (isNaN(amount) || amount <= 0 || amount > 50000) {
            await message.reply('❌ Сумма должна быть от 1 до 50 000₽');
            setTimeout(() => message.delete().catch(() => {}), 3000);
            return;
        }
        
        const success = await db.transferMoney(mcNick, target, amount, `Перевод из Discord от ${mcNick}`);
        if (success) {
            await message.reply(`✅ Переведено ${amount.toLocaleString()}₽ игроку ${target}`);
        } else {
            await message.reply('❌ Недостаточно средств или неверный ник');
        }
    }
    else if (content.startsWith('/pass')) {
        const profile = await db.getRPProfile(mcNick);
        if (!profile) {
            await message.reply('❌ Вы не зарегистрированы в RolePlay');
        } else {
            await message.reply(`📋 Паспорт ${mcNick}: ${profile.structure} | ${profile.job_rank} | 💰 ${profile.money?.toLocaleString()}₽`);
        }
    }
    else if (content.startsWith('/id')) {
        const member = await db.getClanMember(mcNick);
        if (!member) {
            await message.reply('❌ Вы не состоите в клане');
        } else {
            await message.reply(`🆔 ID: ${mcNick} | 📅 В клане с: ${new Date(member.joined_at).toLocaleDateString()}`);
        }
    }
    else {
        await message.reply(`❌ Неизвестная команда. Доступно: /balance, /pay [ник] [сумма], /pass, /id`);
    }
    
    // Удаляем сообщение пользователя через 3 секунды
    setTimeout(() => message.delete().catch(() => {}), 3000);
}

// ============================================
// ПРОФИЛЬ ИГРОКА
// ============================================

async function showProfile(interaction, db) {
    const nick = interaction.options.getString('ник') || interaction.user.username;
    
    // Ищем по нику или по Discord ID
    let mcNick = nick;
    if (nick === interaction.user.username) {
        const linked = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [interaction.user.id]);
        if (linked) mcNick = linked.minecraft_nick;
    }
    
    const member = await db.getClanMember(mcNick);
    const rpProfile = await db.getRPProfile(mcNick);
    const staffRank = await db.getStaffRank(mcNick);
    
    if (!member && !rpProfile) {
        await interaction.reply({ content: `❌ Игрок ${mcNick} не найден`, ephemeral: true });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`📋 Профиль игрока ${mcNick}`)
        .setColor(0x6343d4)
        .setThumbnail(`https://mc-heads.net/avatar/${mcNick}/100`)
        .addFields(
            { name: '📊 Статистика', value: `🗡️ Убийств: ${member?.kills || 0}\n💀 Смертей: ${member?.deaths || 0}`, inline: true },
            { name: '💰 Экономика', value: `💰 Баланс: ${rpProfile?.money?.toLocaleString() || 0}₽\n🏦 Банк: ${rpProfile?.bank_balance?.toLocaleString() || 0}₽`, inline: true },
            { name: '🎭 RolePlay', value: `🏛️ Структура: ${rpProfile?.structure || 'Гражданин'}\n⭐ Ранг: ${rpProfile?.job_rank || 'Нет'}`, inline: true }
        )
        .setFooter({ text: 'Resistance City', iconURL: 'https://i.imgur.com/logo.png' })
        .setTimestamp();
    
    if (staffRank.rank_level > 0) {
        embed.addFields({ name: '👑 Персонал', value: `${staffRank.rank_name}`, inline: true });
    }
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// ТОП ИГРОКОВ
// ============================================

async function showTop(interaction, db) {
    const category = interaction.options.getString('категория');
    
    let data = [];
    let title = '';
    let valueField = '';
    
    if (category === 'money') {
        data = await db.all('SELECT minecraft_nick, money FROM rp_players ORDER BY money DESC LIMIT 10');
        title = '💰 Топ по деньгам';
        valueField = 'money';
    } else if (category === 'kills') {
        data = await db.all('SELECT minecraft_nick, kills FROM clan_members ORDER BY kills DESC LIMIT 10');
        title = '🗡️ Топ по убийствам';
        valueField = 'kills';
    } else if (category === 'duty') {
        data = await db.all('SELECT minecraft_nick, total_duty_seconds FROM rp_players ORDER BY total_duty_seconds DESC LIMIT 10');
        title = '⏱️ Топ по времени на дежурстве';
        valueField = 'total_duty_seconds';
    } else if (category === 'activity') {
        data = await db.all('SELECT minecraft_nick, rp_points FROM rp_players ORDER BY rp_points DESC LIMIT 10');
        title = '⭐ Топ по активности';
        valueField = 'rp_points';
    } else {
        await interaction.reply({ content: '❌ Доступные категории: money, kills, duty, activity', ephemeral: true });
        return;
    }
    
    const description = data.map((item, i) => {
        let value = item[valueField];
        if (valueField === 'total_duty_seconds') {
            const hours = Math.floor(value / 3600);
            value = `${hours} ч`;
        } else if (valueField === 'money') {
            value = `${value.toLocaleString()}₽`;
        } else {
            value = value.toString();
        }
        return `${i+1}. **${item.minecraft_nick}** — ${value}`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || 'Нет данных')
        .setColor(0x6343d4);
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// СТАТИСТИКА СЕРВЕРА
// ============================================

async function showStats(interaction, db) {
    const totalMembers = await db.get('SELECT COUNT(*) as count FROM clan_members');
    const totalRP = await db.get('SELECT COUNT(*) as count FROM rp_players WHERE structure != "Гражданин"');
    const totalMoney = await db.get('SELECT SUM(money) as total FROM rp_players');
    const totalProperties = await db.get('SELECT COUNT(*) as count FROM property WHERE is_available = 0');
    const totalKills = await db.get('SELECT SUM(kills) as total FROM clan_members');
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Статистика сервера Resistance')
        .setColor(0x6343d4)
        .addFields(
            { name: '👥 Участники клана', value: `${totalMembers?.count || 0}`, inline: true },
            { name: '🎭 В RolePlay', value: `${totalRP?.count || 0}`, inline: true },
            { name: '🗡️ Всего убийств', value: `${totalKills?.total || 0}`, inline: true },
            { name: '💰 Общий капитал', value: `${Math.floor(totalMoney?.total || 0).toLocaleString()}₽`, inline: true },
            { name: '🏠 Имущества', value: `${totalProperties?.count || 0}`, inline: true }
        )
        .setFooter({ text: 'Resistance City' });
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// БАЛАНС
// ============================================

async function showBalance(interaction, db) {
    const linked = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [interaction.user.id]);
    if (!linked) {
        await interaction.reply({ content: '❌ Сначала привяжите аккаунт через /verify', ephemeral: true });
        return;
    }
    
    const balance = await db.getBalance(linked.minecraft_nick);
    await interaction.reply({ content: `💰 Ваш баланс: **${balance.toLocaleString()}₽**`, ephemeral: true });
}

// ============================================
// ПЕРЕВОД ДЕНЕГ
// ============================================

async function handlePay(interaction, db) {
    const linked = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [interaction.user.id]);
    if (!linked) {
        await interaction.reply({ content: '❌ Сначала привяжите аккаунт через /verify', ephemeral: true });
        return;
    }
    
    const target = interaction.options.getString('игрок');
    const amount = interaction.options.getInteger('сумма');
    
    if (amount > 50000) {
        await interaction.reply({ content: '❌ Максимальная сумма перевода 50 000₽', ephemeral: true });
        return;
    }
    
    if (amount <= 0) {
        await interaction.reply({ content: '❌ Сумма должна быть положительной', ephemeral: true });
        return;
    }
    
    const success = await db.transferMoney(linked.minecraft_nick, target, amount, `Перевод из Discord от ${linked.minecraft_nick}`);
    
    if (success) {
        await interaction.reply({ content: `✅ Переведено ${amount.toLocaleString()}₽ игроку ${target}`, ephemeral: true });
    } else {
        await interaction.reply({ content: '❌ Недостаточно средств или неверный ник', ephemeral: true });
    }
}

// ============================================
// ИНФОРМАЦИЯ ОБ УЧАСТНИКЕ
// ============================================

async function showMember(interaction, db) {
    let nick = interaction.options.getString('ник');
    let discordMember = null;
    
    if (!nick) {
        discordMember = interaction.member;
        const linked = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [interaction.user.id]);
        if (linked) nick = linked.minecraft_nick;
    }
    
    if (!discordMember && nick) {
        discordMember = await findDiscordMember(nick);
    }
    
    if (!discordMember) {
        await interaction.reply({ content: `❌ Участник ${nick || 'не найден'}`, ephemeral: true });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`👤 Участник ${discordMember.displayName}`)
        .setColor(discordMember.displayHexColor || 0x6343d4)
        .setThumbnail(discordMember.user.displayAvatarURL())
        .addFields(
            { name: '📅 Присоединился', value: `<t:${Math.floor(discordMember.joinedAt / 1000)}:R>`, inline: true },
            { name: '🤖 Бот', value: discordMember.user.bot ? 'Да' : 'Нет', inline: true },
            { name: '🎭 Роли', value: discordMember.roles.cache.filter(r => r.name !== '@everyone').map(r => r.toString()).join(', ') || 'Нет' }
        )
        .setFooter({ text: `ID: ${discordMember.id}` });
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// ИНФОРМАЦИЯ О РОЛИ
// ============================================

async function showRole(interaction, db) {
    const roleName = interaction.options.getString('роль');
    const guild = interaction.guild;
    
    const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(roleName.toLowerCase()));
    if (!role) {
        await interaction.reply({ content: `❌ Роль "${roleName}" не найдена`, ephemeral: true });
        return;
    }
    
    const membersWithRole = role.members.size;
    
    const embed = new EmbedBuilder()
        .setTitle(`🎭 Роль ${role.name}`)
        .setColor(role.hexColor)
        .addFields(
            { name: '📊 Участников', value: `${membersWithRole}`, inline: true },
            { name: '🎨 Цвет', value: role.hexColor, inline: true },
            { name: '📅 Создана', value: `<t:${Math.floor(role.createdAt / 1000)}:R>`, inline: true },
            { name: '🆔 ID', value: role.id, inline: true }
        );
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// НОВЫЙ УЧАСТНИК
// ============================================

async function handleNewMember(member) {
    // Выдаём роль "участник сервера"
    const participantRoleId = '1466550097218113795';
    try {
        await member.roles.add(participantRoleId);
        logger.info(`👋 Выдана роль участника ${member.user.tag}`);
    } catch (err) {
        logger.error(`❌ Ошибка выдачи роли участника: ${err.message}`);
    }
}

// ============================================
// ПОИСК УЧАСТНИКА ПО НИКУ MINECRAFT
// ============================================

async function findDiscordMember(mcNick) {
    const linked = await db.get('SELECT discord_id FROM linked_accounts WHERE minecraft_nick = ?', [mcNick]);
    if (!linked) return null;
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return null;
    
    try {
        return await guild.members.fetch(linked.discord_id);
    } catch (err) {
        return null;
    }
}

// ============================================
// ЛОГИРОВАНИЕ В DISCORD
// ============================================

async function logToDiscord(message, type = 'info') {
    if (!client || !LOGS_CHANNEL_ID) return;
    
    const channel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (!channel) return;
    
    const colors = {
        info: 0x3498db,
        warn: 0xf1c40f,
        error: 0xe74c3c,
        success: 0x2ecc71
    };
    
    const embed = new EmbedBuilder()
        .setTitle(`📋 ${type.toUpperCase()}`)
        .setDescription(message)
        .setColor(colors[type] || 0x6343d4)
        .setTimestamp();
    
    await channel.send({ embeds: [embed] }).catch(() => {});
}

// ============================================
// ОСТАНОВКА
// ============================================

async function stop() {
    if (client) {
        await client.destroy();
        logger.info('Discord бот остановлен');
    }
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = { start, stop, logToDiscord, findDiscordMember, syncMemberRoles };