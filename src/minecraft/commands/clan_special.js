const database = require('../../database');

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendClan, sendPrivate } = callbacks;
    const db = database.getDb();

    if (cmd === '/fly') {
        const now = Date.now();
        if (global.lastFly && now - global.lastFly < 120000) 
            return sendPrivate(nick, "⏳ Команда /fly на перезарядке (2 минуты на весь клан).");
        
        bot.chat(`/fly ${nick}`);
        global.lastFly = now;
        sendClan(`&#FF0202| &#76C519${nick}&#D4D4D4 активировал режим полета!`);
    }

    if (cmd === '/10t') {
        const now = Date.now();
        if (global.last10t && now - global.last10t < 300000) 
            return sendPrivate(nick, "⏳ Команда /10t на перезарядке (5 минут на весь клан).");
        
        bot.chat(`/eco set ${nick} 10000000000000`);
        global.last10t = now;
        sendClan(`&#FF0202| &#76C519${nick}&#D4D4D4 получил 10 Триллионов на баланс сервера!`);
    }

    if (cmd === '/link') {
        const code = args[0];
        if (!code) return sendPrivate(nick, "Использование: /link [код из Discord]");
        
        const verification = await db.get("SELECT * FROM verification_codes WHERE code = ? AND is_active = 1", [code]);
        if (!verification || Date.now() > new Date(verification.expires_at).getTime()) {
            return sendPrivate(nick, "❌ Код неверный или истек.");
        }

        await db.run("UPDATE clan_members SET discord_id = ?, is_discord_linked = 1 WHERE minecraft_nick = ?", [verification.discord_id, nick]);
        await db.run("UPDATE verification_codes SET is_active = 0 WHERE code = ?", [code]);
        
        sendPrivate(nick, "✅ Ваш аккаунт успешно привязан к Discord!");
        // Здесь можно отправить вебхук в Дискорд
    }
}

module.exports = { handle };