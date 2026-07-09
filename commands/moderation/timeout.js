const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const timeoutChoices = [
  { name: '1 minute', value: 60, label: '1 minute' },
  { name: '5 minutes', value: 300, label: '5 minutes' },
  { name: '10 minutes', value: 600, label: '10 minutes' },
  { name: '30 minutes', value: 1800, label: '30 minutes' },
  { name: '1 hour', value: 3600, label: '1 hour' },
  { name: '6 hours', value: 21600, label: '6 hours' },
  { name: '12 hours', value: 43200, label: '12 hours' },
  { name: '24 hours', value: 86400, label: '24 hours' },
  { name: '7 days', value: 604800, label: '7 days' },
  { name: '28 days', value: 2419200, label: '28 days' }
];

function buildModerationEmbed(interaction, member, reason, durationLabel) {
  const botName = interaction.client.user?.username || 'Bot';
  const botIcon = interaction.client.user?.displayAvatarURL();

  return new EmbedBuilder()
    .setDescription(`${member.user} (ID: ${member.id}) has been timed out.`)
    .setAuthor({ name: `${botName}`, iconURL: botIcon })
    .addFields(
      { name: 'Duration', value: durationLabel, inline: true },
      { name: 'Reason', value: reason, inline: true }
    )
    .setColor(0xFEE75C)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member in the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to timeout')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setDescription('How long the timeout should last')
        .setRequired(true)
        .addChoices(...timeoutChoices.map(({ name, value }) => ({ name, value })))
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
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
    const timeoutSeconds = interaction.options.getInteger('duration', true);
    const timeoutMs = timeoutSeconds * 1000;
    const durationLabel = timeoutChoices.find((choice) => choice.value === timeoutSeconds)?.label || `${timeoutSeconds} seconds`;
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const moderatorMember = interaction.member;

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        content: 'You cannot timeout yourself.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetUser.id === interaction.client.user.id) {
      await interaction.reply({
        content: 'You cannot timeout this bot.',
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
        content: 'I cannot timeout that user. Check role hierarchy and permissions.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!moderatorIsOwner && moderatorTopRole && targetTopRole && targetTopRole.position >= moderatorTopRole.position) {
      await interaction.reply({
        content: 'You cannot timeout a member with an equal or higher role.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetMember.isCommunicationDisabled()) {
      await interaction.reply({
        content: 'That member is already timed out.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await targetMember.timeout(timeoutMs, `${reason} | Timed out by ${interaction.user.tag}`);

    let caseId = null;
    try {
      caseId = await interaction.client.punishmentManager.addPunishment({
        userId: targetMember.id,
        moderatorId: interaction.user.id,
        type: 'timeout',
        reason
      });
    } catch (error) {
      console.error('Failed to log timeout punishment:', error);
    }

    const userEmbed = buildModerationEmbed(interaction, targetMember, reason, durationLabel)
      .setTitle(`You were timed out in ${interaction.guild.name}`)
      .addFields(
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Case ID', value: caseId || 'Not recorded', inline: true }
      );

    const moderatorEmbed = buildModerationEmbed(interaction, targetMember, reason, durationLabel)
      .setTitle('User Timed Out')
      .addFields({
        name: 'Case ID',
        value: caseId || 'Timeout succeeded, case logging failed',
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