const { EmbedBuilder } = require('discord.js');

const MOD_ROLE_ID = '1340864854243803248';
const EMBED_COLOR = 0xaeefff;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setDescription(description);
}

function createSuccessEmbed(description) {
  return createEmbed('✧ acción completada ✧', description);
}

function createErrorEmbed(description) {
  return createEmbed('error', description);
}

async function replyWithEmbed(message, embed) {
  return message.reply({ embeds: [embed] });
}

async function replyWithError(message, description) {
  return replyWithEmbed(message, createErrorEmbed(description));
}

async function replyWithSuccess(message, description) {
  return replyWithEmbed(message, createSuccessEmbed(description));
}

async function getAuthorMember(message) {
  if (message.member) return message.member;
  return message.guild.members.fetch(message.author.id).catch(() => null);
}

async function getBotMember(message) {
  if (message.guild.members.me) return message.guild.members.me;
  return message.guild.members.fetchMe().catch(() => null);
}

async function hasPermission(message) {
  if (!message.guild) {
    await replyWithError(message, 'Este comando solo se puede usar dentro de un servidor.');
    return false;
  }

  const member = await getAuthorMember(message);

  if (!member || !member.roles.cache.has(MOD_ROLE_ID)) {
    await replyWithError(message, 'No tienes permiso para usar este comando.');
    return false;
  }

  return true;
}

async function fetchTargetMember(message, rawTarget) {
  if (!message.guild || !rawTarget) return null;

  if (message.mentions.members.size > 0) {
    return message.mentions.members.first();
  }

  const sanitizedId = rawTarget.replace(/[<@!>]/g, '');

  if (!/^\d+$/.test(sanitizedId)) {
    return null;
  }

  return message.guild.members.fetch(sanitizedId).catch(() => null);
}

async function isValidTarget(message, target) {
  if (!target) {
    await replyWithError(message, 'No encontré a ese usuario en el servidor.');
    return false;
  }

  if (!message.guild) {
    await replyWithError(message, 'Este comando solo se puede usar dentro de un servidor.');
    return false;
  }

  if (target.id === message.author.id) {
    await replyWithError(message, 'No puedes usar este comando contigo mismo.');
    return false;
  }

  if (target.user.bot) {
    await replyWithError(message, 'No puedes usar este comando en bots.');
    return false;
  }

  if (target.id === message.guild.ownerId) {
    await replyWithError(message, 'No puedes usar este comando en el dueño del servidor.');
    return false;
  }

  const authorMember = await getAuthorMember(message);
  const botMember = await getBotMember(message);

  if (!authorMember || !botMember) {
    await replyWithError(message, 'No pude verificar la jerarquía de roles.');
    return false;
  }

  if (
    message.author.id !== message.guild.ownerId &&
    target.roles.highest.position >= authorMember.roles.highest.position
  ) {
    await replyWithError(message, 'No puedes actuar sobre un usuario con igual o mayor jerarquía.');
    return false;
  }

  if (target.roles.highest.position >= botMember.roles.highest.position) {
    await replyWithError(message, 'No puedo actuar sobre ese usuario por jerarquía de roles.');
    return false;
  }

  return true;
}

function parseDuration(rawDuration) {
  if (!rawDuration) return null;

  const match = rawDuration.match(/^(\d+)([smhd])$/i);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMap = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const durationMs = amount * unitMap[unit];

  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_TIMEOUT_MS) {
    return null;
  }

  return durationMs;
}

module.exports = {
  createErrorEmbed,
  createSuccessEmbed,
  fetchTargetMember,
  hasPermission,
  isValidTarget,
  parseDuration,
  replyWithError,
  replyWithSuccess
};
