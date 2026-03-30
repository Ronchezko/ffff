const database = require('../../database');

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendPrivate, sendClan } = callbacks;
    const db = database.getDb();
    const player = await db.get("SELECT job_rank, structure FROM rp_players WHERE minecraft_nick = ?", [nick]);
    
    if (!player || (!player.job_rank.includes('Министр') && player.job_rank !== 'Мэр')) return;

    if (cmd === '/org' || cmd === '/o') {
        const sub = args[0]?.toLowerCase();

        switch (sub) {
            case 'tax': { // /o tax set apartment 0.02
                if (player.job_rank !== 'Министр Экономики' && player.job_rank !== 'Мэр') return;
                const type = args[2];
                const rate = parseFloat(args[3]);
                await db.run("UPDATE organizations SET tax_rate = ? WHERE name = 'CityBudget'", [rate]); // Условно
                sendClan(`&#76C519📊 Министр Экономики установил налог на ${type}: ${(rate * 100).toFixed(1)}%`);
                break;
            }

            case 'budget': {
                const orgName = args[1] || player.structure; // Если министр ВД, смотрит бюджет МВД
                const org = await db.get("SELECT budget FROM organizations WHERE name = ?", [orgName]);
                sendPrivate(nick, `🏦 Текущий бюджет [${orgName}]: ${org.budget.toLocaleString()}₽`);
                break;
            }

            case 'grant': { // Выдать грант из казны города
                if (player.job_rank !== 'Министр Экономики' && player.job_rank !== 'Мэр') return;
                const target = args[1];
                const sum = parseFloat(args[2]);
                await db.run("UPDATE rp_players SET money = money + ? WHERE minecraft_nick = ?", [sum, target]);
                sendClan(`&#FFD700⭐ Государственный грант! Игрок ${target} получил ${sum}₽ на развитие.`);
                break;
            }

            case 'im': { // Забрать имущество (Конфискация)
                const id = args[2];
                await db.run("UPDATE property SET owner_nick = NULL, tax_accumulated = 0 WHERE id = ?", [id]);
                bot.chat(`/rg removemember TRTR${id} ${args[1]}`);
                sendClan(`&#FF0202⚖️ Судебное решение: Имущество #${id} игрока ${args[1]} конфисковано.`);
                break;
            }
        }
    }
}

module.exports = { handle };