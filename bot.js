const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

let cards = [];
let pendingDelete = {};
let sessions = {};

// load cards
if (fs.existsSync('cards.json')) {
  cards = JSON.parse(fs.readFileSync('cards.json'));
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // ADD
  if (message.content.startsWith('?add')) {
    let input = message.content.replace('?add ', '').split('|');
    if (input.length < 2) return message.reply('Use: ?add Korean | romanization');

    let korean = input[0].trim();
    let romanization = input[1].trim();

    cards.push({ korean, romanization });
    fs.writeFileSync('cards.json', JSON.stringify(cards, null, 2));

    return message.reply(`Saved: ${korean} (${romanization})`);
  }

  // VIEW
  if (message.content === '?cards') {
    if (cards.length === 0) return message.reply('No cards saved.');

    let list = cards.map((c, i) => `${i + 1}. ${c.korean} (${c.romanization})`).join('\n');
    return message.reply(`Your cards:\n${list}`);
  }

  // DELETE
  if (message.content.startsWith('?deletecard')) {
    let num = parseInt(message.content.split(' ')[1]);
    if (!num || num < 1 || num > cards.length) return message.reply('Invalid number.');

    pendingDelete[message.author.id] = num - 1;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_delete').setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_delete').setLabel('No').setStyle(ButtonStyle.Secondary)
    );

    return message.reply({ content: `Delete card ${num}?`, components: [row] });
  }

  // START QUIZ
  if (message.content.startsWith('?quiz')) {
    if (cards.length < 4) return message.reply('Need at least 4 cards.');

    let parts = message.content.split(' ');
    let max = parts[1] ? parseInt(parts[1]) : null;

    sessions[message.author.id] = {
      correct: 0,
      total: 0,
      max: max
    };

    return sendQuestion(message);
  }

  // STOP
  if (message.content === '?stop') {
    let s = sessions[message.author.id];
    if (!s) return message.reply('No quiz running.');

    delete sessions[message.author.id];

    return message.reply(`Final Score: ${s.correct}/${s.total}`);
  }
});

// QUESTION FUNCTION
async function sendQuestion(message) {
  let s = sessions[message.author.id];
  if (!s) return;

  if (s.max && s.total >= s.max) {
    delete sessions[message.author.id];
    return message.channel.send(`Final Score: ${s.correct}/${s.total}`);
  }

  let correctCard = cards[Math.floor(Math.random() * cards.length)];

  let options = [correctCard];
  while (options.length < 4) {
    let rand = cards[Math.floor(Math.random() * cards.length)];
    if (!options.includes(rand)) options.push(rand);
  }

  options = options.sort(() => Math.random() - 0.5);

  let correctIndex = options.findIndex(o => o === correctCard);

  s.answer = correctIndex;

  let text = `What is: ${correctCard.romanization}?\n\n`;
  text += options.map((o, i) => `${i + 1}. ${o.korean}`).join('\n');

  let msg = await message.channel.send(text);

  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣'];
  for (let i = 0; i < 4; i++) {
    await msg.react(emojis[i]);
  }

  const filter = (reaction, user) => emojis.includes(reaction.emoji.name) && user.id === message.author.id;

  const collector = msg.createReactionCollector({ filter, max: 1, time: 30000 });

  collector.on('collect', (reaction) => {
    let choice = emojis.indexOf(reaction.emoji.name);

    s.total++;

    if (choice === s.answer) {
      s.correct++;
      message.channel.send(`Correct! ${s.correct}/${s.total}`);
    } else {
      message.channel.send(`Wrong! Answer was ${options[s.answer].korean} (${options[s.answer].romanization}) | ${s.correct}/${s.total}`);
    }

    sendQuestion(message);
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      message.channel.send('Timed out.');
    }
  });
}

// BUTTONS
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  let index = pendingDelete[interaction.user.id];

  if (interaction.customId === 'confirm_delete') {
    if (index !== undefined) {
      let removed = cards.splice(index, 1)[0];
      fs.writeFileSync('cards.json', JSON.stringify(cards, null, 2));

      delete pendingDelete[interaction.user.id];

      return interaction.update({
        content: `Deleted: ${removed.korean} (${removed.romanization})`,
        components: []
      });
    }
  }

  if (interaction.customId === 'cancel_delete') {
    delete pendingDelete[interaction.user.id];

    return interaction.update({
      content: 'Cancelled.',
      components: []
    });
  }
});

client.login('PUT_YOUR_TOKEN_HERE');