const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View punishment history for a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to view history for')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);

    let punishments = [];
    try {
      punishments = await interaction.client.punishmentManager.getPunishmentsByUser(targetUser.id);
    } catch (error) {
      console.error('Failed to fetch punishment history:', error);
      await interaction.reply({
        content: 'I could not retrieve punishment history right now.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!punishments.length) {
      await interaction.reply({
        content: `No punishment history found for ${targetUser.tag}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const limitedCases = punishments.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle('Punishment History')
      .setDescription(`${targetUser} (ID: ${targetUser.id})`)
      .setColor(0x5865F2)
      .setTimestamp();

    for (const punishment of limitedCases) {
      const createdAtUnix = Math.floor(new Date(punishment.created_at).getTime() / 1000);
      const reason = punishment.reason || 'No reason provided.';

      embed.addFields({
        name: `${punishment.case_id} • ${String(punishment.type).toUpperCase()}`,
        value: `Moderator: <@${punishment.moderator_id}>\nDate: <t:${createdAtUnix}:f>\nReason: ${reason}`,
        inline: false
      });
    }

    if (punishments.length > limitedCases.length) {
      embed.setFooter({ text: `Showing ${limitedCases.length} of ${punishments.length} total cases.` });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};