// src/discord/verification.js
// Обработка верификации через кнопки

async function handleVerification(interaction, db) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60000);
    
    await db.generateVerificationCode('pending', interaction.user.id, interaction.user.username);
    await db.run('UPDATE verification_codes SET code = ?, expires_at = ? WHERE discord_id = ? AND is_active = 1', 
        [code, expiresAt.toISOString(), interaction.user.id]);
    
    return { code, expiresAt };
}

async function checkVerification(interaction, db) {
    const linked = await db.get('SELECT * FROM linked_accounts WHERE discord_id = ?', [interaction.user.id]);
    
    if (linked) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = interaction.guild.roles.cache.get(process.env.DISCORD_VERIFICATION_ROLE);
        if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
        }
        return true;
    }
    return false;
}

module.exports = { handleVerification, checkVerification };