// src/minecraft/chatHandler.js
// Обработка сообщений чата, кланового чата, личных сообщений

const utils = require('../shared/utils');
const { getModerationSystem } = require('./moderation');
// Регулярные выражения для распознавания сообщений
const PATTERNS = {
    clanChat: /^КЛАН:\s*(?:[&§][0-9a-fklmnor])*([^:]+):\s*(.+)$/i,
    clanChatWithRank: /^КЛАН:\s*[&§][0-9a-fklmnor]*[^\s]+\s+([^:]+):\s*(.+)$/i,
    privateMessage: /^\[\*\]\s*\[(?:~~)?([^\s\]]+)(?:\s*->\s*я)\]\s*(.+)$/i,
    realnameResult: /^\[\*\]\s*~~(\S+)\s+является\s+(\S+)$/i,
    joinRequest: /^\[\*\]\s*Игрок\s+(\S+)\s+подал заявку на вступление в ваш клан\.$/i,
    joinClan: /^\[\*\]\s*(\S+)\s+присоединился к клану\.$/i,
    leaveClan: /^\[\*\]\s*(\S+)\s+покинул клан\.$/i,
    kill: /^(\S+)\s+убил\s+(\S+)$/i,
    lobbyMove: /Ты перемещен в лобби/i,
    banMessage: /забанен/i
};

class ChatHandler {
    constructor(bot, db, parentBot) {
    this.bot = bot;
    this.db = db;
    this.parentBot = parentBot;
    this.moderation = null;
    this.realnameCache = new Map();
}
    
    async handleMessage(jsonMessage) {
        const rawMessage = jsonMessage.toString();
        const message = rawMessage.replace(/[&§][0-9a-fklmnor]/g, '');
        
        // 1. Проверка на перемещение в лобби
        if (PATTERNS.lobbyMove.test(message)) {
            await this.handleLobbyMove();
            return;
        }
        
        // 2. Проверка на результат /realname
        const realnameMatch = message.match(PATTERNS.realnameResult);
        if (realnameMatch) {
            this.handleRealnameResult(realnameMatch[1], realnameMatch[2]);
            return;
        }
        
        // 3. Проверка на клановый чат
        const clanMatch = message.match(PATTERNS.clanChat) || message.match(PATTERNS.clanChatWithRank);
        if (clanMatch) {
            const nickname = clanMatch[1].trim();
            const chatMessage = clanMatch[2].trim();
            await this.handleClanChat(nickname, chatMessage);
            return;
        }
        
        // 4. Проверка на личные сообщения
        const pmMatch = message.match(PATTERNS.privateMessage);
        if (pmMatch) {
            let nickname = pmMatch[1].trim();
            const pmMessage = pmMatch[2].trim();
            
            if (nickname.startsWith('~~')) {
                nickname = await this.getRealname(nickname.slice(2));
            }
            await this.handlePrivateMessage(nickname, pmMessage);
            return;
        }
        
        // 5. Проверка на заявку в клан
        const joinRequestMatch = message.match(PATTERNS.joinRequest);
        if (joinRequestMatch) {
            const nickname = joinRequestMatch[1];
            await this.handleJoinRequest(nickname);
            return;
        }
        
        // 6. Проверка на присоединение к клану
        const joinClanMatch = message.match(PATTERNS.joinClan);
        if (joinClanMatch) {
            const nickname = joinClanMatch[1];
            await this.handleJoinClan(nickname);
            return;
        }
        
        // 7. Проверка на выход из клана
        const leaveClanMatch = message.match(PATTERNS.leaveClan);
        if (leaveClanMatch) {
            const nickname = leaveClanMatch[1];
            await this.handleLeaveClan(nickname);
            return;
        }
        
        // 8. Проверка на убийство
        const killMatch = message.match(PATTERNS.kill);
        if (killMatch) {
            const killer = killMatch[1];
            const victim = killMatch[2];
            await this.handleKill(killer, victim);
            return;
        }
    }
    
    // ============================================
    // ОБРАБОТКА КЛАНОВОГО ЧАТА
    // ============================================
    
    // src/minecraft/chatHandler.js — ключевые изменения

// В методе handleClanChat:
// src/minecraft/chatHandler.js — ключевые изменения

    // В методе handleClanChat добавьте:
// В методе handleClanChat - обязательно вызываем checkClanChat
// В методе handleClanChat - УБРАН вывод о кулдауне
async handleClanChat(nickname, message) {
    if (nickname === this.bot.username) return;
    
    // ВРЕМЕННЫЙ ЛОГ ДЛЯ ОТЛАДКИ
    this.parentBot.addLog(`🔍 Клановый чат: ник="${nickname}", сообщение="${message}"`, 'debug');
    
    if (!this.moderation) {
        const { getModerationSystem } = require('./moderation');
        this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot.addLog);
    }
    
    const result = await this.moderation.checkClanChat(nickname, message);
    
    if (!result.allowed && result.reason) {
        this.parentBot.addLog(`🚫 Сообщение от ${nickname} отклонено: ${result.reason}`, 'debug');
    }
    
    if (this.db.logClanChat) {
        await this.db.logClanChat(nickname, message);
    }
}

// В методе handlePrivateMessage - проверка команд
async handlePrivateMessage(nickname, message) {
    if (!this.moderation) {
        const { getModerationSystem } = require('./moderation');
        this.moderation = await getModerationSystem(this.bot, this.db, this.parentBot.addLog);
    }
    
    // Проверка на мут
    if (await this.moderation.isMuted(nickname)) {
        this.parentBot.addLog(`🚫 Игнорирование ЛС от ${nickname} (в муте)`, 'debug');
        return;
    }
    
    if (message.startsWith('/')) {
        const command = message.slice(1).split(' ')[0];
        
        // Проверка на одинаковые команды
        const cmdResult = await this.moderation.checkPrivateCommand(nickname, command);
        if (!cmdResult.allowed) {
            if (!cmdResult.shouldIgnore && cmdResult.cooldown) {
                this.bot.chat(`/msg ${nickname} &e⏱️ ${cmdResult.reason}`);
            }
            return;
        }
        
        // Проверка на правильность команды
        const commands = require('./commands');
        const isValidCommand = commands.commandMap?.has(command.toLowerCase());
        
        if (!isValidCommand) {
            const invalidResult = await this.moderation.checkInvalidCommand(nickname, command);
            if (!invalidResult.allowed) {
                if (!invalidResult.shouldIgnore) {
                    this.bot.chat(`/msg ${nickname} &c❌ ${invalidResult.reason}`);
                }
                return;
            }
            this.bot.chat(`/msg ${nickname} &cНеизвестная команда. Используйте /help`);
            return;
        }
        
        const args = message.slice(1).split(' ').slice(1);
        await this.parentBot.executeCommand(nickname, command, args);
    }




    
    // Проверка на ответ на вопрос RP регистрации
    if (global.pendingRegistrations && global.pendingRegistrations.has(nickname)) {
        const pending = global.pendingRegistrations.get(nickname);
        if (Date.now() < pending.expires) {
            if (message.toUpperCase() === pending.code) {
                // Успешная регистрация
                await this.db.registerRP(nickname);
                global.pendingRegistrations.delete(nickname);
                
                await sendDelayedMessage(this.bot, nickname, `&a✅ Поздравляем! Вы зарегистрированы в RolePlay!`);
                await utils.sleep(500);
                await sendDelayedMessage(this.bot, nickname, `&7Теперь вы гражданин города Resistance.`);
                await utils.sleep(500);
                await sendDelayedMessage(this.bot, nickname, `&7Используйте &e/pass &7для просмотра паспорта.`);
                
                this.parentBot.addLog(`🎭 ${nickname} зарегистрирован в RolePlay`, 'success');
            } else {
                await sendDelayedMessage(this.bot, nickname, `&c❌ Неверный код! Попробуйте снова командой /rp`);
            }
        } else {
            global.pendingRegistrations.delete(nickname);
            await sendDelayedMessage(this.bot, nickname, `&c⏰ Время действия кода истекло. Используйте /rp снова.`);
        }
    }
}

    // Добавьте этот метод в класс ChatHandler
    async handleRPVerification(nickname, code) {
        if (global.pendingRegistrations && global.pendingRegistrations.has(nickname)) {
            const pending = global.pendingRegistrations.get(nickname);
            if (pending.code === code) {
                await this.db.registerRP(nickname);
                global.pendingRegistrations.delete(nickname);
                
                await sendDelayedMessage(this.bot, nickname, `&a✅ Вы успешно зарегистрированы в RolePlay!`);
                this.parentBot.addLog(`🎭 ${nickname} верифицирован в RP`, 'success');
            } else {
                await sendDelayedMessage(this.bot, nickname, `&c❌ Неверный код!`);
            }
        }
    }


    
    // ============================================
    // ОБРАБОТКА ЗАЯВОК И ВСТУПЛЕНИЙ
    // ============================================
    
    async handleJoinRequest(nickname) {
        const isBlacklisted = await this.db.isBlacklisted?.(nickname) || false;
        if (isBlacklisted) {
            this.parentBot.addLog(`🚫 Отклонена заявка от ${nickname} (чёрный список)`, 'warn');
            return;
        }
        
        this.bot.chat(`/c accept ${nickname}`);
        this.parentBot.addLog(`✅ Принята заявка от ${nickname}`, 'success');
    }
    
    async handleJoinClan(nickname) {
        if (this.db.addClanMember) {
            await this.db.addClanMember(nickname, 'system');
        }
        this.parentBot.addLog(`➕ ${nickname} вступил в клан`, 'success');
        this.bot.chat(`/cc &6&l🏙️ Добро пожаловать в город Resistance, &e${nickname}&6!`);
    }
    
    async handleLeaveClan(nickname) {
        if (this.db.removeClanMember) {
            await this.db.removeClanMember(nickname);
        }
        this.bot.chat(`/msg ${nickname} &cВы покинули клан. Ваш RolePlay профиль был сброшен.`);
        this.parentBot.addLog(`➖ ${nickname} покинул клан`, 'info');
    }
    
    // ============================================
    // ОБРАБОТКА УБИЙСТВ
    // ============================================
    
    async handleKill(killer, victim) {
        if (this.db.addKill) {
            const result = await this.db.addKill(killer, victim);
            if (result.killerInClan) {
                this.bot.chat(`/cc &c⚔️ &e${killer} &7убил &e${victim} &7(+1 убийство)`);
            }
            if (result.victimInClan) {
                this.bot.chat(`/cc &c💀 &e${victim} &7был убит &e${killer} &7(+1 смерть)`);
            }
        }
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    async getRealname(fakeNick) {
        if (this.realnameCache.has(fakeNick)) {
            const cached = this.realnameCache.get(fakeNick);
            if (Date.now() - cached.time < 60000) {
                return cached.realname;
            }
        }
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(fakeNick), 3000);
            
            const handler = (message) => {
                const match = message.toString().match(PATTERNS.realnameResult);
                if (match && match[1] === fakeNick) {
                    clearTimeout(timeout);
                    this.bot.removeListener('message', handler);
                    this.realnameCache.set(fakeNick, { realname: match[2], time: Date.now() });
                    resolve(match[2]);
                }
            };
            
            this.bot.once('message', handler);
            this.bot.chat(`/realname ${fakeNick}`);
        });
    }
    
    handleRealnameResult(fakeNick, realNick) {
        this.realnameCache.set(fakeNick, { realname: realNick, time: Date.now() });
    }
    
    async handleLobbyMove() {
        this.parentBot.addLog('🎮 Бот перемещён в лобби, отправка /s3...', 'info');
        await utils.sleep(3000);
        this.bot.chat(this.parentBot.config.loginCommand);
    }
    
    async handleVerification(nickname, code) {
        if (this.db.verifyCode) {
            const result = await this.db.verifyCode(code, nickname);
            if (result.success) {
                this.bot.chat(`/msg ${nickname} &a✅ Вы успешно верифицированы!`);
            } else {
                this.bot.chat(`/msg ${nickname} &c❌ Неверный код верификации.`);
            }
        }
    }
    
    async giveWarning(nickname) {
        if (!this.db.get) return 1;
        
        const warnings = await this.db.get('SELECT COUNT(*) as count FROM player_warnings WHERE player_nick = ? AND is_active = 1', [nickname]);
        const newCount = (warnings?.count || 0) + 1;
        
        if (this.db.run) {
            await this.db.run(
                `INSERT INTO player_warnings (player_nick, reason, issued_by, expires_at)
                 VALUES (?, ?, ?, datetime("now", "+1 hour"))`,
                [nickname, 'Авто-модерация: спам', 'system']
            );
        }
        
        return newCount;
    }
}
// Вспомогательная функция для отправки сообщений с задержкой
async function sendDelayedMessage(bot, target, message) {
    bot.chat(`/msg ${target} ${message}`);
    await utils.sleep(400);
}
// Фабричная функция
async function handleMessage(bot, message, db, parentBot) {
    const handler = new ChatHandler(bot, db, parentBot);
    await handler.handleMessage(message);
}

module.exports = { handleMessage, ChatHandler };