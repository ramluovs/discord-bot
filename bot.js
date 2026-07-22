require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// Cargador dinámico de comandos desde la carpeta /commands
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (file === 'spotify.js') {
      // Registrar todos los subcomandos de Spotify
      ['help', 'stream', 'play', 'sp', 'pause', 'stop', 'skip'].forEach(cmd => {
        client.commands.set(cmd, command);
      });
    } else if (file === 'ya.js') {
      // Registrar el comando ;ya o chi ya
      client.commands.set('ya', command);
    } else if (command.name) {
      client.commands.set(command.name, command);
    }
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot encendido con éxito como: ${client.user.tag} ♡`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  let prefix = null;
  let args = [];
  let commandName = null;

  // Detección de prefijos: "chi " o ";"
  if (content.toLowerCase().startsWith('chi ')) {
    prefix = 'chi ';
    const rawArgs = content.slice(4).trim().split(/ +/);
    commandName = rawArgs.shift()?.toLowerCase();
    args = rawArgs;
  } else if (content.startsWith(';')) {
    prefix = ';';
    const rawArgs = content.slice(1).trim().split(/ +/);
    commandName = rawArgs.shift()?.toLowerCase();
    args = rawArgs;
  }

  if (!commandName) return;

  const command = client.commands.get(commandName);

  if (command) {
    try {
      await command.execute(message, { commandName, args, prefix });
    } catch (error) {
      console.error(`Error ejecutando el comando ${commandName}:`, error);
    }
  }
});

client.login(process.env.TOKEN);
