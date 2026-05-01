const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');

const QUIZ_TIMEOUT_SECONDS = 15;
const PASTEL_BLUE = 0xaeefff;
const PASTEL_GREEN = 0xb4f8c8;
const PASTEL_PINK = 0xffb3c6;

const ANSWER_EMOJI_NAMES = ['1_', '2_', '3_', '4_'];
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const FIRST_QUESTION_EMOJI = 'first1';

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
let activeCollector = null;

// load saved data
if (fs.existsSync('data.json')) {
  const data = JSON.parse(fs.readFileSync('data.json'));
  cards = data.cards || [];
  history = data.history || [];
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify({ cards, history }, null, 2));
}

function getGuildEmoji(context, name) {
  return context.guild?.emojis.cache.find(emoji => emoji.name === name) || null;
}

function getEmojiMention(context, name) {
  const emoji = getGuildEmoji(context, name);
  return emoji ? emoji.toString() : `:${name}:`;
}

function getReactionEmoji(context, name) {
  const emoji = getGuildEmoji(context, name);
  return emoji ? emoji.id : name;
}

function pickRandomEmojiMention(context, names) {
  const name = names[Math.floor(Math.random() * names.length)];
  return getEmojiMention(context, name);
}

function createQuestionEmbed(message, correct, options) {
  const time = Math.floor(Date.now() / 1000) + QUIZ_TIMEOUT_SECONDS;
  const isFirstQuestion = total === 0;
  const title = isFirstQuestion
    ? `${getEmojiMention(message, FIRST_QUESTION_EMOJI)} ✧ ˚ ༘ ⋆｡° quiz time °｡⋆ ༘ ˚ ✧`
    : '☁️ ✦ next question ✦';

  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(title)
    .setDescription(
      [
        `score: ${score}/${total}`,
        '',
        `What is **${correct.korean}** in romanization?`,
        '',
        ...options.map((option, index) => `${index + 1}. ${option.roman}`),
        '',
        `⏱ answer within: <t:${time}:R>`
      ].join('\n')
    );
}

function createAnswerEmbed(message, isCorrect, correctAnswer) {
  const titleEmoji = pickRandomEmojiMention(message, isCorrect ? RIGHT_EMOJI_NAMES : WRONG_EMOJI_NAMES);

  return new EmbedBuilder()
    .setColor(isCorrect ? PASTEL_GREEN : PASTEL_PINK)
    .setTitle(`${titleEmoji} ${isCorrect ? 'Correct ✧' : 'Wrong ♡'}`)
    .setDescription([`Answer: **${correctAnswer}**`, `Score: ${score}/${total}`].join('\n'));
}

function createTimeoutEmbed(message, correctAnswer) {
  return new EmbedBuilder()
    .setColor(PASTEL_PINK)
    .setTitle(`${pickRandomEmojiMention(message, WRONG_EMOJI_NAMES)} Time's up ♡`)
    .setDescription([`Answer: **${correctAnswer}**`, `Score: ${score}/${total}`].join('\n'));
}

function createFinalScoreEmbed() {
  const percentage = total === 0 ? 0 : Math.round((score / total) * 100);

  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('⋆｡°✩ quiz finished ✩°｡⋆')
    .setDescription([`Final Score: ${score}/${total}`, `Percentage: ${percentage}%`].join('\n'));
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

    const list = cards.map((c, i) => `${i + 1}. ${c.korean} (${c.roman})`).join('\n');
    const hist = history.slice(-10).map((h, i) => `${i + 1}. ${h.score}/${h.total}`).join('\n');

    return message.reply(`Cards:\n${list}\n\nHistory:\n${hist || 'None'}`);
  }

  // ===== QUIZ =====
  if (command === 'quiz') {
    if (cards.length === 0) return message.reply('No cards.');

    quizActive = true;
    score = 0;
    total = 0;
    maxQuestions = args[1] ? parseInt(args[1]) : null;

    if (activeCollector) {
      activeCollector.stop('restart');
      activeCollector = null;
    }

    return sendQuestion(message);
  }

  // ===== STOP =====
  if (command === 'stop') {
    if (!quizActive) return message.reply('No quiz running.');

    quizActive = false;

    if (activeCollector) {
      activeCollector.stop('manual_stop');
      activeCollector = null;
    }

    history.push({ score, total });
    if (history.length > 10) history.shift();
    saveData();

    return message.reply({ embeds: [createFinalScoreEmbed()] });
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
async function sendQuestion(message) {
  if (!quizActive) return;

  const correct = cards[Math.floor(Math.random() * cards.length)];

  let options = [correct];
  while (options.length < 4 && cards.length > options.length) {
    const rand = cards[Math.floor(Math.random() * cards.length)];
    if (!options.includes(rand)) options.push(rand);
  }

  options = options.sort(() => Math.random() - 0.5);

  const correctIndex = options.findIndex(option => option === correct);
  const questionEmbed = createQuestionEmbed(message, correct, options);
  const quizMessage = await message.reply({ embeds: [questionEmbed] });
  const answerEmojis = ANSWER_EMOJI_NAMES.slice(0, options.length).map(name => ({
    name,
    reaction: getReactionEmoji(message, name)
  }));

  for (const emoji of answerEmojis) {
    await quizMessage.react(emoji.reaction);
  }

  const filter = (reaction, user) =>
    answerEmojis.some(emoji => reaction.emoji.name === emoji.name) && user.id === message.author.id;

  const collector = quizMessage.createReactionCollector({
    filter,
    time: QUIZ_TIMEOUT_SECONDS * 1000,
    max: 1
  });

  activeCollector = collector;

  collector.on('collect', async reaction => {
    const index = answerEmojis.findIndex(emoji => reaction.emoji.name === emoji.name);
    const isCorrect = index === correctIndex;

    if (isCorrect) {
      score++;
    }

    total++;
    await quizMessage.reply({ embeds: [createAnswerEmbed(message, isCorrect, correct.roman)] });

    if (maxQuestions && total >= maxQuestions) {
      quizActive = false;
      history.push({ score, total });
      if (history.length > 10) history.shift();
      saveData();

      return quizMessage.reply({ embeds: [createFinalScoreEmbed()] });
    }

    if (!quizActive) return;
    return sendQuestion(message);
  });

  collector.on('end', async collected => {
    if (activeCollector === collector) {
      activeCollector = null;
    }

    if (!quizActive || collected.size !== 0) return;

    total++;
    await quizMessage.reply({ embeds: [createTimeoutEmbed(message, correct.roman)] });

    if (maxQuestions && total >= maxQuestions) {
      quizActive = false;
      history.push({ score, total });
      if (history.length > 10) history.shift();
      saveData();

      return quizMessage.reply({ embeds: [createFinalScoreEmbed()] });
    }

    if (!quizActive) return;
    return sendQuestion(message);
  });
}

client.login(process.env.TOKEN);
