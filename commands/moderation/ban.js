const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const messageRemovalChoices = [
  { name: 'Previous hour', value: 3600, label: 'Previous hour' },
  { name: 'Previous 6 hours', value: 21600, label: 'Previous 6 hours' },
  { name: 'Previous 12 hours', value: 43200, label: 'Previous 12 hours' },
  { name: 'Previous 24 hours', value: 86400, label: 'Previous 24 hours' },
  { name: 'Previous 3 days', value: 259200, label: 'Previous 3 days' },
  { name: 'Previous 7 days', value: 604800, label: 'Previous 7 days' }
];

function buildModerationEmbed(interaction, user, reason) {
  const botName = interaction.client.user?.username || 'Bot';
  const botIcon = interaction.client.user?.displayAvatarURL();

  return new EmbedBuilder()
    .setDescription(`${user} (ID: ${user.id}) has been banned.`)
    .setAuthor({ name: `${botName} Moderation`, iconURL: botIcon })
    .addFields({ name: 'Reason', value: reason, inline: true })
    .setColor(0xFF0000)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the ban')
        .setMaxLength(512)
    )
    .addIntegerOption((option) =>
      option
        .setName('remove_previous')
        .setDescription('Remove the user\'s previous messages from this time window')
        .addChoices(...messageRemovalChoices.map(({ name, value }) => ({ name, value })))
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
    const deleteMessageSeconds = interaction.options.getInteger('remove_previous') || 0;
    const removalLabel = messageRemovalChoices.find((choice) => choice.value === deleteMessageSeconds)?.label || 'No messages removed';
    const moderatorMember = interaction.member;

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        content: 'You cannot ban yourself.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetUser.id === interaction.client.user.id) {
      await interaction.reply({
        content: 'You cannot ban this bot.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember) {
      const moderatorTopRole = moderatorMember.roles?.highest;
      const targetTopRole = targetMember.roles?.highest;
      const moderatorIsOwner = interaction.guild.ownerId === interaction.user.id;

      if (!targetMember.bannable) {
        await interaction.reply({
          content: 'I cannot ban that user. Check role hierarchy and permissions.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!moderatorIsOwner && moderatorTopRole && targetTopRole && targetTopRole.position >= moderatorTopRole.position) {
        await interaction.reply({
          content: 'You cannot ban a member with an equal or higher role.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    const existingBan = await interaction.guild.bans.fetch(targetUser.id).catch(() => null);
    if (existingBan) {
      await interaction.reply({
        content: 'That user is already banned.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let caseId = null;
    try {
      caseId = await interaction.client.punishmentManager.addPunishment({
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        type: 'ban',
        reason
      });
    } catch (error) {
      console.error('Failed to log ban punishment:', error);
    }

    const userEmbed = buildModerationEmbed(interaction, targetUser, reason)
      .setTitle(`You were banned from ${interaction.guild.name}`)
      .addFields(
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Removed Messages', value: removalLabel, inline: true },
        { name: 'Case ID', value: caseId || 'Not recorded', inline: true }
      );

    const moderatorEmbed = buildModerationEmbed(interaction, targetUser, reason)
      .setTitle('User Banned')
      .addFields(
        { name: 'Removed Messages', value: removalLabel, inline: true },
        { name: 'Case ID', value: caseId || 'Ban succeeded, case logging failed', inline: true }
      );

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

    /*await interaction.guild.members.ban(targetUser, {
      deleteMessageSeconds,
      reason: `${reason} | Banned by ${interaction.user.tag}`
    });*/

  }
};