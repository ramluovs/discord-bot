const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const MEMORY_FILE = path.join(__dirname, '../data/ai_memory.json');
const MAX_MEMORY_MESSAGES = 20;
const AI_FOLLOW_UP_WINDOW_MS = 10 * 60 * 1000;
const AI_COOLDOWN_MS = 10 * 1000;
const PASTEL_BLUE = 0xaeefff;
const AI_LOG_COLOR = 0xcba6f7;
const AI_LOG_CHANNEL_ID = '1499622919620264106';
const NSFW_AI_CHANNEL_ID = '1371340983752724561';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const aiMessageOwners = new Map();
const aiFollowUpSessions = new Map();
const aiCooldowns = new Map();

function loadAllMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return {};
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAllMemory(data) {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save AI memory:', e);
  }
}

function getUserHistory(userId) {
  const all = loadAllMemory();
  return all[userId] || [];
}

function saveUserMessage(userId, role, content) {
  const all = loadAllMemory();
  if (!all[userId]) all[userId] = [];
  all[userId].push({ role, content });
  if (all[userId].length > MAX_MEMORY_MESSAGES) {
    all[userId] = all[userId].slice(-MAX_MEMORY_MESSAGES);
  }
  saveAllMemory(all);
}

function createBlueEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(title)
    .setDescription(description);
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
  const logChannel = await message.client.channels.fetch(AI_LOG_CHANNEL_ID);

  if (!logChannel || !logChannel.isTextBased()) {
    throw new Error('AI log channel is unavailable.');
  }

  await logChannel.send({
    embeds: [createAILogEmbed(message, prompt)]
  });
}

async function getSafeAIResponse(message, prompt, userId) {
  const conversationHistory = getUserHistory(userId);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are Chi, a sweet, cute and kawaii AI assistant. You speak in a friendly, warm and playful way. You occasionally use cute expressions like "nya~", "uwu", "~", "hehe", "yay!", and similar kawaii phrases naturally in your responses, but don't overdo it. You are helpful, kind and enthusiastic. You speak mostly in Spanish since your users are Spanish speakers, but you can understand and respond in English if asked. Keep responses concise and friendly.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 1000
  });

  const aiText = response.choices[0]?.message?.content;

  if (typeof aiText !== 'string' || aiText.length === 0) {
    throw new Error('OpenAI returned an empty response.');
  }

  saveUserMessage(userId, 'user', prompt);
  saveUserMessage(userId, 'assistant', aiText);

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
    await message.reply({
      embeds: [createAICooldownEmbed(remainingCooldown)]
    });
    return true;
  }

  setAICooldown(message.author.id);

  const reply = await message.reply({
    embeds: [createAIThinkingEmbed()]
  });

  try {
    const aiText = await getSafeAIResponse(message, prompt, message.author.id);

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

  return true;
}

function extractChiAskPrompt(message) {
  const trimmedContent = message.content.trim();
  const match = trimmedContent.match(/^chi\s+ask\s+([\s\S]+)$/i);
  return match ? match[1] : null;
}

async function execute(message) {
  const prompt = extractChiAskPrompt(message);

  if (!prompt) return false;

  return handleAIPrompt(message, prompt);
}

async function handleFollowUp(message) {
  const trimmedContent = message.content.trim();

  if (!message.reference?.messageId || trimmedContent.length === 0) {
    return false;
  }

  const session = getValidFollowUpSession(message);

  if (!session) return false;

  return handleAIPrompt(message, message.content);
}

async function handleInteraction(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'delete_ai') {
    return false;
  }

  const ownerId = aiMessageOwners.get(interaction.message.id);

  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      embeds: [
        createActionEmbed('✦ not allowed ✦', [
          'Only the original user can delete this AI message.'
        ])
      ],
      ephemeral: true
    });
    return true;
  }

  clearAIResponseContext(interaction.message.id);
  await interaction.update({
    content: '...',
    embeds: [],
    components: []
  });

  return true;
}

module.exports = {
  execute,
  handleFollowUp,
  handleInteraction
};
