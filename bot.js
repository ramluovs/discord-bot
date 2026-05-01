const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const OpenAI = require('openai');

const QUIZ_TIMEOUT_SECONDS = 15;
const AI_FOLLOW_UP_WINDOW_MS = 60 * 1000;
const AI_COOLDOWN_MS = 10 * 1000;
const PASTEL_BLUE = 0xaeefff;
const AI_LOG_COLOR = 0xcba6f7;

const ANSWER_EMOJI_NAMES = ['1_', '2_', '3_', '4_'];
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const FIRST_QUESTION_EMOJI = 'first1';

const AI_LOG_CHANNEL_ID = '1499622919620264106';
const NSFW_AI_CHANNEL_ID = '1371340983752724561';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===== DATA =====
let cards = [];
let history = [];
let quizActive = false;
let score = 0;
let total = 0;
let maxQuestions = null;
let activeCollector = null;

const aiMessageOwners = new Map();
const aiFollowUpSessions = new Map();
const aiCooldowns = new Map();

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
      'Add one with `?add korean | romanization`.'
    ].join('\n')
  );
}

function createActionEmbed(title, lines) {
  return createBlueEmbed(title, lines.join('\n'));
}

function createAIThinkingEmbed() {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('☁️ thinking...');
}

function createAIResponseEmbed(responseText) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ response')
    .setDescription(responseText);
}

function createAIErrorEmbed() {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('error')
    .setDescription('algo salió mal... pregunta otra vez.');
}

function createDeleteAIRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delete_ai')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );
}

function createAICooldownEmbed(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);

  return createActionEmbed('✦ cooldown ✦', [
    `Please wait ${seconds}s before asking again.`
  ]);
}

function truncateField(value, maxLength = 1024) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function createAILogEmbed(message, prompt) {
  const sentAt = Math.floor(message.createdTimestamp / 1000);

  return new EmbedBuilder()
    .setColor(AI_LOG_COLOR)
    .setTitle('AI Log')
    .addFields(
      {
        name: 'User',
        value: `${message.author.username} (${message.author.id})`
      },
      {
        name: 'Question',
        value: truncateField(prompt)
      },
      {
        name: 'Time',
        value: `<t:${sentAt}:F>`
      }
    );
}

function getRemainingAICooldown(userId) {
  const endsAt = aiCooldowns.get(userId);

  if (!endsAt) return 0;

  const remainingMs = endsAt - Date.now();

  if (remainingMs <= 0) {
    aiCooldowns.delete(userId);
    return 0;
  }

  return remainingMs;
}

function setAICooldown(userId) {
  aiCooldowns.set(userId, Date.now() + AI_COOLDOWN_MS);
}

function storeAIResponseContext(botMessageId, userId) {
  const timestamp = Date.now();

  aiMessageOwners.set(botMessageId, userId);
  aiFollowUpSessions.set(botMessageId, {
    userId,
    botMessageId,
    timestamp,
    expiresAt: timestamp + AI_FOLLOW_UP_WINDOW_MS
  });
}

function clearAIResponseContext(botMessageId) {
  aiMessageOwners.delete(botMessageId);
  aiFollowUpSessions.delete(botMessageId);
}

function getValidFollowUpSession(message) {
  const replyToMessageId = message.reference?.messageId;

  if (!replyToMessageId) return null;

  const session = aiFollowUpSessions.get(replyToMessageId);

  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    aiFollowUpSessions.delete(replyToMessageId);
    return null;
  }

  if (session.userId !== message.author.id) {
    return null;
  }

  return session;
}

async function sendAILog(message, prompt) {
  const logChannel = await client.channels.fetch(AI_LOG_CHANNEL_ID);

  if (!logChannel || !logChannel.isTextBased()) {
    throw new Error('AI log channel is unavailable.');
  }

  await logChannel.send({
    embeds: [createAILogEmbed(message, prompt)]
  });
}

async function getSafeAIResponse(message, prompt) {
  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: prompt
  });

  const aiText = response.output_text;

  if (typeof aiText !== 'string' || aiText.length === 0) {
    throw new Error('OpenAI returned an empty response.');
  }

  if (message.channel.id === NSFW_AI_CHANNEL_ID) {
    return aiText;
  }

  const moderation = await openai.moderations.create({
    input: aiText
  });

  if (moderation.results?.[0]?.flagged) {
    return 'Mi sistema encontró contenido explícito en tu solicitud';
  }

  return aiText;
}

async function handleAIPrompt(message, prompt) {
  const remainingCooldown = getRemainingAICooldown(message.author.id);

  if (remainingCooldown > 0) {
    return message.reply({
      embeds: [createAICooldownEmbed(remainingCooldown)]
    });
  }

  setAICooldown(message.author.id);

  const reply = await message.reply({
    embeds: [createAIThinkingEmbed()]
  });

  try {
    const aiText = await getSafeAIResponse(message, prompt);

    await reply.edit({
      content: null,
      embeds: [createAIResponseEmbed(aiText)],
      components: [createDeleteAIRow()]
    });

    storeAIResponseContext(reply.id, message.author.id);
    await sendAILog(message, prompt);
  } catch (error) {
    console.error('AI prompt failed:', error);
    clearAIResponseContext(reply.id);

    try {
      await reply.edit({
        content: null,
        embeds: [createAIErrorEmbed()],
        components: []
      });
    } catch (editError) {
      console.error('Failed to edit AI error state:', editError);
    }
  }
}

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const trimmedContent = message.content.trim();
  const chiAskMatch = trimmedContent.match(/^chi\s+ask\s+([\s\S]+)$/i);

  if (chiAskMatch) {
    return handleAIPrompt(message, chiAskMatch[1]);
  }

  const followUpSession = getValidFollowUpSession(message);

  if (!message.content.startsWith('?')) {
    if (followUpSession && trimmedContent.length > 0) {
      return handleAIPrompt(message, message.content);
    }

    return;
  }

  const args = message.content.slice(1).trim().split(' ');
  const command = args[0];

  // ===== ADD =====
  if (command === 'add') {
    const text = args.slice(1).join(' ');
    const parts = text.split('|');

    if (parts.length < 2) {
      return message.reply({
        embeds: [
          createActionEmbed('✦ add format ✦', ['Use:', '', '`?add korean | romanization`'])
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
    maxQuestions = args[1] ? parseInt(args[1]) : null;

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
    const index = parseInt(args[1]) - 1;
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

  if (followUpSession && trimmedContent.length > 0) {
    return handleAIPrompt(message, message.content);
  }
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const id = interaction.customId;

  if (id === 'delete_ai') {
    const ownerId = aiMessageOwners.get(interaction.message.id);

    if (!ownerId || interaction.user.id !== ownerId) {
      return interaction.reply({
        embeds: [
          createActionEmbed('✦ not allowed ✦', [
            'Only the original user can delete this AI message.'
          ])
        ],
        ephemeral: true
      });
    }

    clearAIResponseContext(interaction.message.id);
    return interaction.update({
      content: '...',
      embeds: [],
      components: []
    });
  }

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
