const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const ask = require('./commands/ask');
const moderationCommands = {
  ban: require('./commands/moderation/ban'),
  unban: require('./commands/moderation/unban'),
  kick: require('./commands/moderation/kick'),
  timeout: require('./commands/moderation/timeout'),
  clear: require('./commands/moderation/clear'),
  setnick: require('./commands/moderation/setnick')
};

const QUIZ_TIMEOUT_SECONDS = 15;
const PASTEL_BLUE = 0xaeefff;

const ANSWER_EMOJI_NAMES = ['1_', '2_', '3_', '4_'];
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const FIRST_QUESTION_EMOJI = 'first1';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
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

async function ensureGuildEmojis(context) {
  if (!context.guild) return;

  try {
    await context.guild.emojis.fetch();
  } catch (error) {
    console.error('Failed to fetch guild emojis:', error);
  }
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
  return emoji ? emoji.identifier : null;
}

function pickRandomEmojiMention(context, names) {
  const name = names[Math.floor(Math.random() * names.length)];
  return getEmojiMention(context, name);
}

function createBlueEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(title)
    .setDescription(description);
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
    .setColor(PASTEL_BLUE)
    .setTitle(`${titleEmoji} ${isCorrect ? 'Correct ✧' : 'Wrong ♡'}`)
    .setDescription([`Answer: **${correctAnswer}**`, `Score: ${score}/${total}`].join('\n'));
}

function createTimeoutEmbed(message, correctAnswer) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
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

function createCardsEmbed() {
  const list = cards.map((card, index) => `${index + 1}. ${card.korean} (${card.roman})`).join('\n');
  const hist = history.slice(-10).map((entry, index) => `${index + 1}. ${entry.score}/${entry.total}`).join('\n');

  return createBlueEmbed(
    '✧ ˚ ༘ ⋆｡° card collection °｡⋆ ༘ ˚ ✧',
    [
      '✦ cards ✦',
      '',
      list,
      '',
      '✦ recent history ✦',
      '',
      hist || 'None'
    ].join('\n')
  );
}

function createEmptyCardsEmbed(reason) {
  return createBlueEmbed(
    '☁️ ✦ no cards yet ✦',
    [
      reason,
      '',
      'Add one with `;add korean | romanization` or `chi add korean | romanization`.'
    ].join('\n')
  );
}

function createActionEmbed(title, lines) {
  return createBlueEmbed(title, lines.join('\n'));
}

function parsePrefixedCommand(content) {
  const trimmedContent = content.trim();

  if (!trimmedContent) return null;

  const matchedPrefix = trimmedContent.startsWith(';')
    ? ';'
    : trimmedContent.match(/^chi\s+/i)?.[0];

  if (!matchedPrefix) return null;

  const body = trimmedContent.slice(matchedPrefix.length).trim();

  if (!body) return null;

  const parts = body.split(/\s+/);
  return {
    prefix: matchedPrefix === ';' ? ';' : 'chi ',
    commandName: parts[0].toLowerCase(),
    args: parts.slice(1)
  };
}

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const isReply = Boolean(message.reference?.messageId);
  const parsedCommand = parsePrefixedCommand(message.content);

  if (!parsedCommand) {
    if (isReply) {
      const handledFollowUp = await ask.handleFollowUp(message);
      if (handledFollowUp) return;
    }

    return;
  }

  if (parsedCommand.prefix === 'chi ' && parsedCommand.commandName === 'ask') {
    return ask.execute(message);
  }

  if (moderationCommands[parsedCommand.commandName]) {
    return moderationCommands[parsedCommand.commandName].execute(message, parsedCommand.args);
  }

  const { commandName: command, args } = parsedCommand;

  // ===== ADD =====
  if (command === 'add') {
    const text = args.join(' ');
    const parts = text.split('|');

    if (parts.length < 2) {
      return message.reply({
        embeds: [
          createActionEmbed('✦ add format ✦', [
            'Use:',
            '',
            '`;add korean | romanization`',
            '`chi add korean | romanization`'
          ])
        ]
      });
    }

    const korean = parts[0].trim();
    const roman = parts[1].trim();

    cards.push({ korean, roman });
    saveData();

    return message.reply({
      embeds: [
        createActionEmbed('✧ card saved ✧', [
          `Korean: **${korean}**`,
          `Romanization: **${roman}**`
        ])
      ]
    });
  }

  // ===== CARDS =====
  if (command === 'cards') {
    if (cards.length === 0) {
      return message.reply({
        embeds: [createEmptyCardsEmbed('Your study deck is empty right now.')]
      });
    }

    return message.reply({ embeds: [createCardsEmbed()] });
  }

  // ===== QUIZ =====
  if (command === 'quiz') {
    if (cards.length === 0) {
      return message.reply({
        embeds: [createEmptyCardsEmbed('You need at least one card before starting a quiz.')]
      });
    }

    quizActive = true;
    score = 0;
    total = 0;
    maxQuestions = args[0] ? parseInt(args[0]) : null;

    if (activeCollector) {
      activeCollector.stop('restart');
      activeCollector = null;
    }

    return sendQuestion(message);
  }

  // ===== STOP =====
  if (command === 'stop') {
    if (!quizActive) {
      return message.reply({
        embeds: [
          createActionEmbed('✦ no active quiz ✦', ['There is not a quiz running right now.'])
        ]
      });
    }

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
    const index = parseInt(args[0]) - 1;
    if (isNaN(index) || !cards[index]) {
      return message.reply({
        embeds: [
          createActionEmbed('✦ invalid card number ✦', [
            'Pick a valid card number from your saved list.'
          ])
        ]
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`del_yes_${index}`).setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('del_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );

    return message.reply({
      embeds: [
        createActionEmbed('♡ delete this card? ♡', [
          `Card ${index + 1}: **${cards[index].korean}** (${cards[index].roman})`,
          '',
          'This action cannot be undone.'
        ])
      ],
      components: [row]
    });
  }

  // ===== RESET =====
  if (command === 'resetcards') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_yes').setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );

    return message.reply({
      embeds: [
        createActionEmbed('✧ reset all cards? ✧', [
          'This will remove your entire saved deck.',
          '',
          'Press a button below to choose.'
        ])
      ],
      components: [row]
    });
  }
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async interaction => {
  const handledAIInteraction = await ask.handleInteraction(interaction);
  if (handledAIInteraction) return;

  if (!interaction.isButton()) return;

  const id = interaction.customId;

  if (id.startsWith('del_yes_')) {
    const index = parseInt(id.split('_')[2]);
    cards.splice(index, 1);
    saveData();
    return interaction.update({
      embeds: [createActionEmbed('✦ card deleted ✦', ['The selected card has been removed.'])],
      components: []
    });
  }

  if (id === 'del_no') {
    return interaction.update({
      embeds: [createActionEmbed('☁️ action cancelled ✦', ['Nothing was changed.'])],
      components: []
    });
  }

  if (id === 'reset_yes') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_reset').setLabel('Confirm').setStyle(ButtonStyle.Danger)
    );
    return interaction.update({
      embeds: [
        createActionEmbed('⋆｡°✩ are you sure? ✩°｡⋆', [
          'This will delete every saved card.',
          '',
          'Press `Confirm` if you want to continue.'
        ])
      ],
      components: [row]
    });
  }

  if (id === 'confirm_reset') {
    cards = [];
    saveData();
    return interaction.update({
      embeds: [createActionEmbed('♡ all cards deleted ♡', ['Your saved deck has been cleared.'])],
      components: []
    });
  }

  if (id === 'reset_no') {
    return interaction.update({
      embeds: [createActionEmbed('☁️ action cancelled ✦', ['Nothing was changed.'])],
      components: []
    });
  }
});

// ===== QUIZ FUNCTION (REACTIONS) =====
async function sendQuestion(message) {
  if (!quizActive) return;

  await ensureGuildEmojis(message);

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
  })).filter(emoji => emoji.reaction);

  const filter = (reaction, user) =>
    answerEmojis.some(emoji => reaction.emoji.name === emoji.name) && user.id === message.author.id;

  const collector = quizMessage.createReactionCollector({
    filter,
    time: QUIZ_TIMEOUT_SECONDS * 1000,
    max: 1
  });

  activeCollector = collector;

  try {
    for (const emoji of answerEmojis) {
      await quizMessage.react(emoji.reaction);
    }
  } catch (error) {
    console.error('Failed to add quiz reactions:', error);
    quizActive = false;
    activeCollector.stop('reaction_error');
    activeCollector = null;
    return quizMessage.reply({
      embeds: [
        createActionEmbed('✦ reactions unavailable ✦', [
          'I could not add the quiz reactions.',
          '',
          'Check that the emoji names exist in this server and that the bot has `Add Reactions` and `Read Message History` permissions.'
        ])
      ]
    });
  }

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
