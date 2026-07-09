const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

function buildModerationEmbed(interaction, user, reason) {
  const botName = interaction.client.user?.username || 'Bot';
  const botIcon = interaction.client.user?.displayAvatarURL();

  return new EmbedBuilder()
    .setDescription(`${user} (ID: ${user.id}) has been unbanned.`)
    .setAuthor({ name: `${botName}`, iconURL: botIcon })
    .addFields({ name: 'Reason', value: reason, inline: true })
    .setColor(0x57F287)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to unban')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the unban')
        .setMaxLength(512)
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
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    const existingBan = await interaction.guild.bans.fetch(targetUser.id).catch(() => null);
    if (!existingBan) {
      await interaction.reply({
        content: 'That user is not currently banned.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.guild.members.unban(targetUser.id, `${reason} | Unbanned by ${interaction.user.tag}`);

    let caseId = null;
    try {
      caseId = await interaction.client.punishmentManager.addPunishment({
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        type: 'unban',
        reason
      });
    } catch (error) {
      console.error('Failed to log unban punishment:', error);
    }

    const userEmbed = buildModerationEmbed(interaction, targetUser, reason)
      .setTitle(`You were unbanned from ${interaction.guild.name}`)
      .addFields(
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Case ID', value: caseId || 'Not recorded', inline: true }
      );

    const moderatorEmbed = buildModerationEmbed(interaction, targetUser, reason)
      .setTitle('User Unbanned')
      .addFields({
        name: 'Case ID',
        value: caseId || 'Unban succeeded, case logging failed',
        inline: true
      });

    const dmSent = await targetUser.send({ embeds: [userEmbed] }).then(() => true).catch(() => false);

    if (!dmSent) {
      moderatorEmbed.addFields({
        name: 'Notice',
        value: 'The user could not be notified by direct message.',
        inline: false
      });
    }

    await interaction.reply({
      embeds: [moderatorEmbed],
      flags: MessageFlags.Ephemeral
    });
  }
};