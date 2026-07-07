const { Events, ActivityType } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}`);

        setInterval(() => {
            client.user.setPresence({
                status: 'online',
                activities: [{
                    name: `${client.punishmentManager.getPunishmentCounter()} punishments issued.`,
                    type: ActivityType.Listening
                }]
            })
        }, 2*60*1000);
    }
}