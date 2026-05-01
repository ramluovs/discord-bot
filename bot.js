const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ===== DATA =====
let cards = [];
let history = [];
let quizActive = false;
let score = 0;
let total = 0;
let maxQuestions = null;

// load saved data
if (fs.existsSync('data.json')) {
  const data = JSON.parse(fs.readFileSync('data.json'));
  cards = data.cards || [];
  history = data.history || [];
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify({ cards, history }, null, 2));
}

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args[0];

  // ===== ADD =====
  if (command === 'add') {
    const text = args.slice(1).join(' ');
    const parts = text.split('|');

    if (parts.length < 2) {
      return message.reply('Use: ?add korean | romanization');
    }

    const korean = parts[0].trim();
    const roman = parts[1].trim();

    cards.push({ korean, roman });
    saveData();

    return message.reply(`Saved: ${korean} (${roman})`);
  }

  // ===== CARDS =====
  if (command === 'cards') {
    if (cards.length === 0) return message.reply('No cards.');

    let list = cards.map((c, i) => `${i + 1}. ${c.korean} (${c.roman})`).join('\n');
    let hist = history.slice(-10).map((h, i) => `${i + 1}. ${h.score}/${h.total}`).join('\n');

    return message.reply(`Cards:\n${list}\n\nHistory:\n${hist || 'None'}`);
  }

  // ===== QUIZ =====
  if (command === 'quiz') {
    if (cards.length === 0) return message.reply('No cards.');

    quizActive = true;
    score = 0;
    total = 0;
    maxQuestions = args[1] ? parseInt(args[1]) : null;

    sendQuestion(message);
  }

  // ===== STOP =====
  if (command === 'stop') {
    if (!quizActive) return message.reply('No quiz running.');

    quizActive = false;
    history.push({ score, total });
    if (history.length > 10) history.shift();
    saveData();

    return message.reply(`Finished: ${score}/${total}`);
  }

  // ===== DELETE CARD =====
  if (command === 'deletecard') {
    const index = parseInt(args[1]) - 1;
    if (isNaN(index) || !cards[index]) return message.reply('Invalid number.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`del_yes_${index}`).setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('del_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );

    return message.reply({ content: `Delete card ${index + 1}?`, components: [row] });
  }

  // ===== RESET =====
  if (command === 'resetcards') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_yes').setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );

    return message.reply({ content: 'Reset ALL cards?', components: [row] });
  }
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const id = interaction.customId;

  if (id.startsWith('del_yes_')) {
    const index = parseInt(id.split('_')[2]);
    cards.splice(index, 1);
    saveData();
    return interaction.update({ content: 'Deleted.', components: [] });
  }

  if (id === 'del_no') {
    return interaction.update({ content: 'Cancelled.', components: [] });
  }

  if (id === 'reset_yes') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_reset').setLabel('Confirm').setStyle(ButtonStyle.Danger)
    );
    return interaction.update({ content: 'Are you sure?', components: [row] });
  }

  if (id === 'confirm_reset') {
    cards = [];
    saveData();
    return interaction.update({ content: 'All cards deleted.', components: [] });
  }

  if (id === 'reset_no') {
    return interaction.update({ content: 'Cancelled.', components: [] });
  }
});

// ===== QUIZ FUNCTION (REACTIONS) =====
function sendQuestion(message) {
  const correct = cards[Math.floor(Math.random() * cards.length)];

  let options = [correct];
  while (options.length < 4 && cards.length > options.length) {
    const rand = cards[Math.floor(Math.random() * cards.length)];
    if (!options.includes(rand)) options.push(rand);
  }

  options = options.sort(() => Math.random() - 0.5);

  const correctIndex = options.findIndex(o => o === correct);

  let text = options.map((o, i) => `${i + 1}. ${o.roman}`).join('\n');

  message.reply(`What is this: ${correct.korean}\n\n${text}`).then(msg => {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

    emojis.slice(0, options.length).forEach(e => msg.react(e));

    const filter = (reaction, user) =>
      emojis.includes(reaction.emoji.name) && user.id === message.author.id;

    const collector = msg.createReactionCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', (reaction) => {
      const index = emojis.indexOf(reaction.emoji.name);

      if (index === correctIndex) {
        score++;
        msg.reply('Correct');
      } else {
        msg.reply(`Wrong. Answer: ${correct.roman}`);
      }

      total++;

      if (maxQuestions && total >= maxQuestions) {
        quizActive = false;
        history.push({ score, total });
        if (history.length > 10) history.shift();
        saveData();

        return msg.reply(`Finished: ${score}/${total}`);
      }

      sendQuestion(message);
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.reply(`Time's up. Answer: ${correct.roman}`);
        total++;
        sendQuestion(message);
      }
    });
  });
}

client.login(process.env.TOKEN);