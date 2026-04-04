// src/minecraft/index.js
// Главный модуль Minecraft бота для Resistance City

const mineflayer = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const EventEmitter = require('events');
const utils = require('../shared/utils');

class MinecraftBot extends EventEmitter {
    constructor(database, addLog) {
        super();
        this.db = database;
        this.addLog = addLog || ((msg, type) => console.log(`[${type}] ${msg}`));
        this.bot = null;
        this.isConnected = false;
        this.isRestartMode = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.isConnecting = false; // Флаг для предотвращения множественных подключений
        
        // Настройки из .env
        this.config = {
            host: process.env.MC_SERVER || 'ru.dexland.org',
            port: parseInt(process.env.MC_PORT) || 25565,
            username: process.env.MC_MAIN_ACCOUNT || 'YT_FLATT807',
            password: process.env.MC_BOT_PASSWORD,
            auth: process.env.MC_AUTH || 'offline',
            version: process.env.MC_VERSION || '1.12.2',
            loginCommand: process.env.MC_LOGIN_COMMAND || '/s4',
            proxyEnabled: process.env.PROXY_ENABLED === 'true',
            proxyHost: process.env.PROXY_HOST,
            proxyPort: parseInt(process.env.PROXY_PORT),
            proxyType: process.env.PROXY_TYPE || 'socks5'
        };
        
        this.spamDetector = new utils.SpamDetector(3, 30);
    }
    
    // ============================================
    // ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
    // ============================================
    
    async connect() {
        if (this.isConnecting) {
            this.addLog(`⚠️ Уже выполняется подключение, пропускаю...`, 'debug');
            return;
        }
        
        this.isConnecting = true;
        
        const options = {
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            auth: this.config.auth,
            version: this.config.version,
            viewDistance: 'tiny'
        };
        
        if (this.config.proxyEnabled && this.config.proxyHost) {
            const proxyUrl = `${this.config.proxyType}://${this.config.proxyHost}:${this.config.proxyPort}`;
            options.agent = new SocksProxyAgent(proxyUrl);
            this.addLog(`🔌 Используется прокси: ${proxyUrl}`, 'info');
        }
        
        this.addLog(`🔌 Подключение к ${this.config.host}:${this.config.port} как ${this.config.username}`, 'info');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.isConnecting = false;
                reject(new Error('Таймаут подключения'));
            }, 30000);
            
            this.bot = mineflayer.createBot(options);
            
            this.bot.once('login', () => {
                clearTimeout(timeout);
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.addLog(`✅ Подключен как ${this.bot.username}`, 'success');
                resolve();
            });
            
            this.bot.once('error', (err) => {
                clearTimeout(timeout);
                this.isConnecting = false;
                reject(err);
            });
        });
    }
    
    // ============================================
    // АВТОРИЗАЦИЯ НА СЕРВЕРЕ
    // ============================================
    
    async authorize() {
        if (!this.bot || !this.bot._client || !this.bot._client.socket) {
            this.addLog(`⚠️ Бот не готов к отправке команд`, 'warn');
            return;
        }
        
        await utils.sleep(5000);
        
        if (this.config.loginCommand) {
            try {
                this.bot.chat(this.config.loginCommand);
                this.addLog(`📝 Отправлена команда: ${this.config.loginCommand}`, 'info');
            } catch (err) {
                this.addLog(`❌ Ошибка отправки команды: ${err.message}`, 'error');
            }
        }
        
        await utils.sleep(1000);
        
        try {
            this.bot.chat(`/cc &6[Resistance Bot] &aБот запущен и готов к работе!`);
        } catch (err) {
            this.addLog(`❌ Ошибка отправки приветствия: ${err.message}`, 'error');
        }
    }
    
    // ============================================
    // ОБРАБОТКА СОБЫТИЙ БОТА
    // ============================================
    
    setupEventHandlers() {
        if (!this.bot) return;
        
        this.bot.once('spawn', async () => {
    this.addLog('🎮 Бот появился в мире', 'success');
    
    try {
        const { getModerationSystem } = require('./moderation');
        const moderation = await getModerationSystem(this.bot, this.db, this.addLog);
        
        if (typeof moderation.checkAllPlayersPunishments === 'function') {
            await moderation.checkAllPlayersPunishments();
        }
        if (typeof moderation.checkActivePunishments === 'function') {
            await moderation.checkActivePunishments(this.bot.username);
        }
    } catch (err) {
        this.addLog(`⚠️ Ошибка проверки наказаний: ${err.message}`, 'warn');
    }
    
    await this.authorize();
});
        
        this.bot.on('message', async (json) => {
            const message = json.toString();
            const chatHandler = require('./chatHandler');
            await chatHandler.handleMessage(this.bot, message, this.db, this);
        });
        
        this.bot.on('kicked', async (reason) => {
            const reasonStr = reason.toString();
            this.addLog(`⚠️ Бот был кикнут: ${reasonStr}`, 'warn');
            this.isConnected = false;
            
            // Закрываем текущее соединение принудительно
            if (this.bot && this.bot._client) {
                try {
                    this.bot._client.end();
                } catch (err) {}
            }
            
            // Ждём 5 секунд перед переподключением
            await utils.sleep(5000);
            await this.handleDisconnect();
        });
        
        this.bot.on('end', async (reason) => {
            this.addLog(`🔌 Соединение разорвано: ${reason || 'неизвестно'}`, 'warn');
            this.isConnected = false;
            await this.handleDisconnect();
        });
        
        this.bot.on('error', (err) => {
            if (err.message?.includes('ECONNRESET')) {
                this.addLog(`⚠️ Сетевая ошибка: ${err.message}`, 'warn');
            } else if (!err.message?.includes('skin')) {
                this.addLog(`❌ Ошибка бота: ${err.message}`, 'error');
            }
        });
    }
    
    // ============================================
    // ОБРАБОТКА ОТКЛЮЧЕНИЙ
    // ============================================
    
    async handleDisconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.addLog(`❌ Достигнут лимит попыток переподключения (${this.maxReconnectAttempts})`, 'error');
            this.emit('max_reconnect_reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
        
        this.addLog(`🔄 Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay/1000} сек...`, 'info');
        
        await utils.sleep(delay);
        
        try {
            if (this.bot) {
                try {
                    this.bot.end();
                } catch (err) {}
                this.bot = null;
            }
            await this.connect();
            this.setupEventHandlers();
        } catch (err) {
            this.addLog(`❌ Ошибка переподключения: ${err.message}`, 'error');
            await this.handleDisconnect();
        }
    }
    
    // ============================================
    // ВЫПОЛНЕНИЕ КОМАНД
    // ============================================
    
    async executeCommand(sender, command, args) {
        try {
            const { getModerationSystem } = require('./moderation');
            const moderation = await getModerationSystem(this.bot, this.db, this.addLog);
            
            const isMuted = await moderation.isClanMuted(sender);
            if (isMuted) {
                this.bot.chat(`/msg ${sender} &c🔇 Вы в клановом муте и не можете использовать команды.`);
                return;
            }
            
            const commands = require('./commands');
            const cmd = commands.commandMap?.get(command.toLowerCase());
            
            if (!cmd || typeof cmd.handler !== 'function') {
                this.bot.chat(`/msg ${sender} &cНеизвестная команда. Используйте /help`);
                return;
            }
            
            if (cmd.requiredRank > 0) {
                let staffRank = { rank_level: 0 };
                try {
                    staffRank = await this.db.getStaffRank?.(sender) || { rank_level: 0 };
                } catch (err) {}
                
                if (staffRank.rank_level < cmd.requiredRank) {
                    this.bot.chat(`/msg ${sender} &cУ вас недостаточно прав!`);
                    return;
                }
            }
            
            await cmd.handler(this.bot, sender, args, this.db, this.addLog);
            
        } catch (err) {
            this.addLog(`❌ Ошибка команды ${command}: ${err.message}`, 'error');
            if (this.bot && this.bot.chat) {
                this.bot.chat(`/msg ${sender} &cОшибка: ${err.message}`);
            }
        }
    }
    
    // ============================================
    // ОСТАНОВКА
    // ============================================
    
    async stop() {
        this.addLog('🛑 Остановка Minecraft бота...', 'info');
        if (this.bot) {
            try {
                this.bot.quit();
                this.bot.end();
            } catch (err) {}
            this.bot = null;
        }
        this.isConnected = false;
    }
}

// ============================================
// ЗАПУСК (ФАБРИЧНАЯ ФУНКЦИЯ)
// ============================================

async function start(database, addLog) {
    const bot = new MinecraftBot(database, addLog);
    
    try {
        await bot.connect();
        bot.setupEventHandlers();
        return bot;
    } catch (err) {
        bot.addLog(`❌ Не удалось запустить бота: ${err.message}`, 'error');
        throw err;
    }
}

module.exports = { start };