const { REST, Routes, Client, GatewayIntentBits, Collection } = require('discord.js');
const client = new Client({intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
]});

const fs = require("node:fs");
const config = require('./config.json');
const punishmentManager = require('./managers/punishmentManager');
/*
--------------------------
 Register Command List
--------------------------
*/

const commands = [];
client.commands = new Collection();

const commandFolders = fs.readdirSync('./commands');

for (const folder of commandFolders) {

    // Grab a list of the files in each command "type" folder
    const commandFiles = fs
        .readdirSync(`./commands/${folder}`)
        .filter((file) => file.endsWith('.js'));
    
    // Loop through each command file
    for (const file of commandFiles) {

        const command = require(`./commands/${folder}/${file}`);
        commands.push(command.data.toJSON());
        // Ensure the command has the correct properties
        if('data' in command && 'execute' in command) {

            // Register the command in the array for later registration
            client.commands.set(command.data.name, command);

        } else {

            // If there is an error, log it.
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            
        }

    }

}

/*
--------------------------
 Event Registration
--------------------------
*/

const eventFiles = fs
    .readdirSync('./events')
    .filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {

        client.once(event.name, (...args) => event.execute(...args, client));

    } else {

        client.on(event.name, (...args) => event.execute(...args, client));

    }
}

/*
--------------------------
 Register Commands to Discord
--------------------------
*/
const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {

        console.log(`Started refreshing ${commands.length} applicaiton (/) commands.`);

        // Send the command to the Discord API
        const data = await rest.put(
            Routes.applicationCommands(config.clientid),
            { body: commands }
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);

    } catch (error) {

        console.error(error);

    }
})();

// Initialize PunishmentManager and login to Discord
(async () => {
    try {
        await punishmentManager.init();
        client.punishmentManager = punishmentManager;
        console.log('PunishmentManager initialized');
    } catch (err) {
        console.error('Failed to initialize PunishmentManager:', err);
    }

    // Login to Discord
    client.login(config.token);
})();

