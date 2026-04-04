// src/discord/reminders.js
// Система напоминаний о лицензиях и налогах

const { EmbedBuilder } = require('discord.js');

// ============================================
// ЗАПУСК СИСТЕМЫ НАПОМИНАНИЙ
// ============================================

function start(client, db) {
    // Проверка каждые 6 часов
    setInterval(async () => {
        await checkLicensesReminders(client, db);
        await checkTaxReminders(client, db);
    }, 6 * 60 * 60 * 1000);
    
    console.log('🔔 Система напоминаний запущена');
}

// ============================================
// НАПОМИНАНИЯ О ЛИЦЕНЗИЯХ
// ============================================

async function checkLicensesReminders(client, db) {
    const licenses = await db.all(`
        SELECT l.*, la.discord_id 
        FROM licenses l
        JOIN linked_accounts la ON l.owner_nick = la.minecraft_nick
        WHERE l.is_active = 1 
        AND l.expires_at BETWEEN datetime('now', '+2 days') AND datetime('now', '+3 days')
        AND (l.last_reminded_at IS NULL OR l.last_reminded_at < datetime('now', '-1 day'))
    `);
    
    for (const license of licenses) {
        const user = await client.users.fetch(license.discord_id).catch(() => null);
        if (!user) continue;
        
        const expiresAt = new Date(license.expires_at);
        const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Лицензия истекает')
            .setDescription(`Ваша лицензия на **${license.type}** истекает через ${daysLeft} дня(ей)!`)
            .setColor(0xf1c40f)
            .addFields(
                { name: '📅 Дата истечения', value: expiresAt.toLocaleDateString(), inline: true },
                { name: '💰 Стоимость продления', value: license.type === 'business' ? '800 000₽' : '900 000₽', inline: true }
            )
            .setFooter({ text: 'Продлите лицензию в Discord' });
        
        await user.send({ embeds: [embed] }).catch(() => {});
        
        // Обновляем дату последнего напоминания
        await db.run('UPDATE licenses SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?', [license.id]);
    }
}

// ============================================
// НАПОМИНАНИЯ О НАЛОГАХ
// ============================================

async function checkTaxReminders(client, db) {
    const properties = await db.all(`
        SELECT p.id, p.owner_nick, p.tax_accumulated, p.price, la.discord_id
        FROM property p
        JOIN linked_accounts la ON p.owner_nick = la.minecraft_nick
        WHERE p.is_available = 0 AND p.tax_accumulated > p.price * 0.3
    `);
    
    for (const property of properties) {
        const user = await client.users.fetch(property.discord_id).catch(() => null);
        if (!user) continue;
        
        const debtPercent = (property.tax_accumulated / property.price * 100).toFixed(1);
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Задолженность по налогу')
            .setDescription(`Ваш долг по налогу за имущество **#${property.id}** составляет ${property.tax_accumulated.toLocaleString()}₽ (${debtPercent}% от стоимости)!`)
            .setColor(0xe74c3c)
            .addFields(
                { name: '🏠 Имущество', value: `#${property.id}`, inline: true },
                { name: '💰 Долг', value: `${property.tax_accumulated.toLocaleString()}₽`, inline: true }
            )
            .setFooter({ text: 'Оплатите налог командой /imnalog в игре' });
        
        await user.send({ embeds: [embed] }).catch(() => {});
    }
}

module.exports = { start };