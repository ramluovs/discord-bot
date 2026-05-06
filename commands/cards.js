const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const CARD_DATA_CHANNEL_ID = '1499642971614613574';
const QUIZ_TIMEOUT_SECONDS = 30;
const PASTEL_BLUE = 0xaeefff;
const ALLOWED_ROLES = ['1340864854243803248', '1500217745889824898'];

const ANSWER_EMOJI_NAMES = ['1_', '2_', '3_', '4_'];
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const FIRST_QUESTION_EMOJI = 'first1';

let cards = [];
let history = [];
let quizActive = false;
let score = 0;
let total = 0;
let maxQuestions = null;
let activeCollector = null;

async function fetchCardsFromDiscord(client) {
  try {
    const channel = await client.channels.fetch(CARD_DATA_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return [];
    let all = [], before = null;
    while (true) {
      const msgs = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!msgs.size) break;
      for (const msg of msgs.values()) {
        if (msg.author.bot && msg.content.startsWith('CARD:')) {
          try {
            const data = JSON.parse(msg.content.slice(5));
            const audioUrl = msg.attachments.first()?.url || null;
            all.push({ ...data, audioUrl, messageId: msg.id });
          } catch {}
        }
        before = msg.id;
      }
      if (msgs.size < 100) break;
    }
    return all.reverse();
  } catch { return []; }
}

async function saveCardToDiscord(client, korean, roman, english, audioUrl) {
  const channel = await client.channels.fetch(CARD_DATA_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) throw new Error('Card channel unavailable');
  const content = `CARD:${JSON.stringify({ korean, roman, english: english || null })}`;
  const payload = { content };
  if (audioUrl) payload.files = [{ attachment: audioUrl, name: 'audio.mp3' }];
  const msg = await channel.send(payload);
  return msg;
}

async function deleteCardFromDiscord(client, messageId) {
  try {
    const channel = await client.channels.fetch(CARD_DATA_CHANNEL_ID);
    const msg = await channel.messages.fetch(messageId);
    await msg.delete();
  } catch {}
}

function hasCardRole(message) {
  return message.member?.roles.cache.some(role => ALLOWED_ROLES.includes(role.id)) ?? false;
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
        ...(correct.english ? [`-# ${correct.english}`] : []),
        '',
        ...options.map((option, index) => `${index + 1}. ${option.roman}`),
        '',
        `⏱ answer within: <t:${time}:R>`,
        ...(correct.audioUrl ? [] : ['', '-# no audio attached'])
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

function createEmptyCardsEmbed(reason) {
  return createBlueEmbed(
    '☁️ ✦ no cards yet ✦',
    [
      reason,
      '',
      'Add one with `;addcard korean / romanization / english` or `chi addcard korean / romanization`.'
    ].join('\n')
  );
}

function createActionEmbed(title, lines) {
  return createBlueEmbed(title, lines.join('\n'));
}

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
  const messagePayload = { embeds: [questionEmbed] };
  if (correct.audioUrl) {
    messagePayload.files = [{ attachment: correct.audioUrl, name: 'audio.mp3' }];
  }
  const quizMessage = await message.reply(messagePayload);
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

      return quizMessage.reply({ embeds: [createFinalScoreEmbed()] });
    }

    if (!quizActive) return;
    return sendQuestion(message);
  });
}

async function execute(message, parsedCommand) {
  if (!hasCardRole(message)) return false;

  const { commandName: command, args } = parsedCommand;

  if (command === 'addcard') {
    const text = args.join(' ').trim();
    if (!text) {
      return message.reply({
        embeds: [createActionEmbed('✦ addcard format ✦', [
          'Use:',
          '',
          '`;addcard korean / romanization / english`',
          '`chi addcard korean / romanization / english`',
          '',
          'English is optional:',
          '`;addcard korean / romanization`',
          '',
          'You can also attach an .mp3 audio file.'
        ])]
      });
    }

    const parts = text.split('/').map(p => p.trim());
    if (parts.length < 2) {
      return message.reply({
        embeds: [createActionEmbed('✦ addcard format ✦', [
          'Use: `;addcard korean / romanization / english`',
          'English is optional.'
        ])]
      });
    }

    const korean = parts[0];
    const roman = parts[1];
    const english = parts[2] || null;
    const attachment = message.attachments.first();
    const audioUrl = attachment?.contentType?.startsWith('audio/') ? attachment.url : null;

    try {
      await saveCardToDiscord(message.client, korean, roman, english, audioUrl);
      return message.reply({
        embeds: [createActionEmbed('✧ card saved ✧', [
          `Korean: **${korean}**`,
          `Romanization: **${roman}**`,
          `English: **${english || 'not provided'}**`,
          `Audio: ${audioUrl ? 'attached' : 'none'}`
        ])]
      });
    } catch (e) {
      return message.reply({ embeds: [createActionEmbed('error', ['Failed to save card.'])] });
    }
  }

  if (command === 'cards') {
    const allCards = await fetchCardsFromDiscord(message.client);
    if (!allCards.length) {
      return message.reply({ embeds: [createEmptyCardsEmbed('Your study deck is empty right now.')] });
    }
    const list = allCards.map((card, i) => `${i + 1}. ${card.korean} / ${card.roman}${card.english ? ` / ${card.english}` : ''}`).join('\n');
    return message.reply({ embeds: [createBlueEmbed('✧ ˚ ༘ ⋆｡° card collection °｡⋆ ༘ ˚ ✧', list)] });
  }

  if (command === 'quiz') {
    cards = await fetchCardsFromDiscord(message.client);
    if (!cards.length) {
      return message.reply({
        embeds: [createEmptyCardsEmbed('You need at least one card before starting a quiz.')]
      });
    }
    quizActive = true;
    score = 0;
    total = 0;
    maxQuestions = args[0] ? parseInt(args[0]) : null;
    if (activeCollector) { activeCollector.stop('restart'); activeCollector = null; }
    return sendQuestion(message);
  }

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

    return message.reply({ embeds: [createFinalScoreEmbed()] });
  }

  if (command === 'deletecard') {
    const allCards = await fetchCardsFromDiscord(message.client);
    const index = parseInt(args[0]) - 1;
    if (isNaN(index) || !allCards[index]) {
      return message.reply({
        embeds: [createActionEmbed('✦ invalid card number ✦', ['Pick a valid card number from your saved list.'])]
      });
    }
    const card = allCards[index];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`del_yes_${card.messageId}`).setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('del_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );
    return message.reply({
      embeds: [createActionEmbed('♡ delete this card? ♡', [
        `Card ${index + 1}: **${card.korean}** / ${card.roman}${card.english ? ` / ${card.english}` : ''}`,
        '',
        'This action cannot be undone.'
      ])],
      components: [row]
    });
  }

  if (command === 'resetcards') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_yes').setLabel('Yes').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_no').setLabel('No').setStyle(ButtonStyle.Secondary)
    );
    return message.reply({
      embeds: [createActionEmbed('✧ reset all cards? ✧', ['This will remove your entire saved deck.', '', 'Press a button below to choose.'])],
      components: [row]
    });
  }

  return false;
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const id = interaction.customId;

  if (id.startsWith('del_yes_')) {
    const messageId = id.replace('del_yes_', '');
    await deleteCardFromDiscord(interaction.client, messageId);
    await interaction.update({
      embeds: [createActionEmbed('✦ card deleted ✦', ['The selected card has been removed.'])],
      components: []
    });
    return true;
  }

  if (id === 'del_no') {
    await interaction.update({
      embeds: [createActionEmbed('☁️ action cancelled ✦', ['Nothing was changed.'])],
      components: []
    });
    return true;
  }

  if (id === 'reset_yes') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_reset').setLabel('Confirm').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({
      embeds: [
        createActionEmbed('⋆｡°✩ are you sure? ✩°｡⋆', [
          'This will delete every saved card.',
          '',
          'Press `Confirm` if you want to continue.'
        ])
      ],
      components: [row]
    });
    return true;
  }

  if (id === 'confirm_reset') {
    const allCards = await fetchCardsFromDiscord(interaction.client);
    for (const card of allCards) {
      await deleteCardFromDiscord(interaction.client, card.messageId);
    }
    await interaction.update({
      embeds: [createActionEmbed('♡ all cards deleted ♡', ['Your saved deck has been cleared.'])],
      components: []
    });
    return true;
  }

  if (id === 'reset_no') {
    await interaction.update({
      embeds: [createActionEmbed('☁️ action cancelled ✦', ['Nothing was changed.'])],
      components: []
    });
    return true;
  }

  return false;
}

module.exports = {
  execute,
  handleInteraction
};
