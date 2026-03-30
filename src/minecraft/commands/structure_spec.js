const database = require('../../database');

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendPrivate, sendClan } = callbacks;
    const db = database.getDb();
    const player = await db.get("SELECT structure, job_rank FROM rp_players WHERE minecraft_nick = ?", [nick]);
    if (!player || player.structure === 'Гражданин') return;

    // --- ПОЛИЦИЯ (МВД) ---
    if (player.structure === 'Полиция') {
        if (cmd === '/search') {
            sendPrivate(nick, `🔍 Вы проводите личный досмотр игрока ${args[0]}... (RP процесс)`);
            sendPrivate(args[0], `⚠️ Вас обыскивает сотрудник полиции ${nick}!`);
        }
        if (cmd === '/fine') {
            const target = args[0];
            const sum = parseFloat(args[1]);
            const reason = args.slice(2).join(' ');
            await db.run("UPDATE rp_players SET money = money - ? WHERE minecraft_nick = ?", [sum, target]);
            sendClan(`&#114fff👮 Штраф! ${target} оштрафован на ${sum}₽. Причина: ${reason}`);
        }
    }

    // --- АРМИЯ ---
    if (player.structure === 'Армия') {
        if (cmd === '/tr') { // Тревога
            const level = args[0];
            if (level === 'status') return sendPrivate(nick, "📡 Текущий уровень угрозы: ЗЕЛЕНЫЙ (Обычный)");
            sendClan(`&#FF0202🏮 ТРЕВОГА! Объявлен уровень угрозы: ${level.toUpperCase()}! Посты занять!`);
        }
    }

    // --- БОЛЬНИЦА ---
    if (player.structure === 'Больница') {
        if (cmd === '/redcode' || cmd === '/rc') {
            if (args[0] === 'on') sendClan(`&#e63030🚑 КРАСНЫЙ КОД! Всем врачам прибыть в госпиталь!`);
            else sendPrivate(nick, "Статус больницы: Стабильный.");
        }
    }

    // --- АКАДЕМИЯ ---
    if (player.structure === 'Академия') {
        if (cmd === '/grade') {
            const target = args[0];
            const score = parseInt(args[2]);
            const status = score >= 3 ? "ПРОШЕЛ" : "ЗАВАЛИЛ";
            sendClan(`&#59ff6d🎓 Экзамен! ${target} получил оценку ${score}. Результат: ${status}`);
            if (score >= 3) await db.run("UPDATE rp_players SET has_education = 1 WHERE minecraft_nick = ?", [target]);
        }
    }
}

module.exports = { handle };