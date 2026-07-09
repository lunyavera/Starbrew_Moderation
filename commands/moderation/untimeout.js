const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

function buildModerationEmbed(interaction, member, reason) {
  const botName = interaction.client.user?.username || 'Bot';
  const botIcon = interaction.client.user?.displayAvatarURL();

  return new EmbedBuilder()
    .setDescription(`${member.user} (ID: ${member.id}) is no longer timed out.`)
    .setAuthor({ name: `${botName}`, iconURL: botIcon })
    .addFields({ name: 'Reason', value: reason, inline: true })
    .setColor(0x57F287)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a member in the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to remove timeout from')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for removing timeout')
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
    const moderatorMember = interaction.member;

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        content: 'You cannot modify your own timeout status.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetUser.id === interaction.client.user.id) {
      await interaction.reply({
        content: 'You cannot untimeout this bot.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      await interaction.reply({
        content: 'That user is not in this server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const moderatorTopRole = moderatorMember.roles?.highest;
    const targetTopRole = targetMember.roles?.highest;
    const moderatorIsOwner = interaction.guild.ownerId === interaction.user.id;

    if (!targetMember.moderatable) {
      await interaction.reply({
        content: 'I cannot modify timeout for that user. Check role hierarchy and permissions.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!moderatorIsOwner && moderatorTopRole && targetTopRole && targetTopRole.position >= moderatorTopRole.position) {
      await interaction.reply({
        content: 'You cannot modify timeout for a member with an equal or higher role.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!targetMember.isCommunicationDisabled()) {
      await interaction.reply({
        content: 'That member is not currently timed out.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await targetMember.timeout(null, `${reason} | Timeout removed by ${interaction.user.tag}`);

    let caseId = null;
    try {
      caseId = await interaction.client.punishmentManager.addPunishment({
        userId: targetMember.id,
        moderatorId: interaction.user.id,
        type: 'untimeout',
        reason
      });
    } catch (error) {
      console.error('Failed to log untimeout punishment:', error);
    }

    const userEmbed = buildModerationEmbed(interaction, targetMember, reason)
      .setTitle(`Your timeout was removed in ${interaction.guild.name}`)
      .addFields(
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Case ID', value: caseId || 'Not recorded', inline: true }
      );

    const moderatorEmbed = buildModerationEmbed(interaction, targetMember, reason)
      .setTitle('User Timeout Removed')
      .addFields({
        name: 'Case ID',
        value: caseId || 'Timeout removal succeeded, case logging failed',
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