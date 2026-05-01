const { EmbedBuilder } = require('discord.js');

const PASTEL_BLUE = 0xaeefff;
const ERROR_RED = 0xff6b6b;
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const ITEM_DETAILS_CACHE_MS = 60 * 1000;
const USERNAME_VALIDATE_BIRTHDAY = '2000-01-01T00:00:00.000Z';

let cachedRolimonsItems = null;
let cachedRolimonsItemsAt = 0;

function createEmbed(title, description = null) {
  const embed = new EmbedBuilder().setColor(PASTEL_BLUE).setTitle(title);

  if (description !== null) {
    embed.setDescription(description);
  }

  return embed;
}

function createErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor(ERROR_RED)
    .setTitle('error')
    .setDescription(description);
}

async function ensureGuildEmojis(message) {
  if (!message.guild) return;

  try {
    await message.guild.emojis.fetch();
  } catch (error) {
    console.error('No se pudieron cargar los emojis del servidor:', error);
  }
}

function getGuildEmoji(message, name) {
  return message.guild?.emojis.cache.find(emoji => emoji.name === name) || null;
}

function getEmojiMention(message, name) {
  const emoji = getGuildEmoji(message, name);
  return emoji ? emoji.toString() : `:${name}:`;
}

function pickRandomEmojiMention(message, names) {
  const name = names[Math.floor(Math.random() * names.length)];
  return getEmojiMention(message, name);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'chi-discord-bot/1.0',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.errors?.[0]?.message ||
      data?.message ||
      `La solicitud falló con estado ${response.status}.`;

    throw new Error(message);
  }

  return data;
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No disponible';
  }

  return new Intl.NumberFormat('es-ES').format(value);
}

function formatSpanishDate(value) {
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No disponible';
  }

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long'
  }).format(date);
}

function formatSpanishDateTime(value) {
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No disponible';
  }

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function truncateDescription(text, maxLength = 200) {
  const normalized = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';

  if (!normalized) {
    return 'Sin descripción.';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function translateLocation(location) {
  if (!location) return null;

  const normalized = String(location).trim();

  if (!normalized) return null;

  if (normalized === 'Website') return 'Sitio web';
  if (normalized === 'Offline') return 'Desconectado';
  if (normalized === 'Studio') return 'Studio';

  return normalized;
}

function formatLastSeen(presenceData, rolimonsData) {
  const presenceType = presenceData?.userPresenceType;
  const presenceLocation = translateLocation(presenceData?.lastLocation);
  const rolimonsLocation = translateLocation(rolimonsData?.lastLocation);

  if (presenceType === 2) {
    return presenceLocation && presenceLocation !== 'Sitio web'
      ? `En juego: ${presenceLocation}`
      : 'En juego ahora';
  }

  if (presenceType === 3) {
    return 'En Studio';
  }

  if (presenceType === 1) {
    return 'En el sitio web';
  }

  if (typeof rolimonsData?.lastOnline === 'number' && rolimonsData.lastOnline > 0) {
    const lastSeen = formatSpanishDateTime(rolimonsData.lastOnline);
    const location = rolimonsLocation || presenceLocation;

    return location && location !== 'Desconectado'
      ? `${lastSeen}\n${location}`
      : lastSeen;
  }

  return rolimonsLocation || presenceLocation || 'No disponible';
}

function getRobloxProfileUrl(userId) {
  return `https://www.roblox.com/users/${userId}/profile`;
}

function getRolimonsProfileUrl(userId) {
  return `https://www.rolimons.com/player/${userId}`;
}

async function resolveRobloxUser(query) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error('Debes indicar un usuario de Roblox.');
  }

  if (/^\d+$/.test(trimmedQuery)) {
    return fetchJson(`https://users.roblox.com/v1/users/${trimmedQuery}`);
  }

  const lookup = await fetchJson('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({
      usernames: [trimmedQuery],
      excludeBannedUsers: false
    })
  });

  const match = lookup?.data?.[0];

  if (!match?.id) {
    throw new Error('No encontré a ese usuario de Roblox.');
  }

  return fetchJson(`https://users.roblox.com/v1/users/${match.id}`);
}

async function fetchPresence(userId) {
  const data = await fetchJson('https://presence.roblox.com/v1/presence/users', {
    method: 'POST',
    body: JSON.stringify({
      userIds: [userId]
    })
  });

  return data?.userPresences?.[0] || null;
}

async function fetchCounts(userId) {
  const endpoints = {
    friends: `https://friends.roblox.com/v1/users/${userId}/friends/count`,
    followers: `https://friends.roblox.com/v1/users/${userId}/followers/count`,
    followings: `https://friends.roblox.com/v1/users/${userId}/followings/count`
  };

  const entries = await Promise.all(
    Object.entries(endpoints).map(async ([key, endpoint]) => {
      try {
        const data = await fetchJson(endpoint);
        return [key, typeof data?.count === 'number' ? data.count : null];
      } catch (error) {
        console.error(`No se pudo obtener el contador ${key}:`, error);
        return [key, null];
      }
    })
  );

  return Object.fromEntries(entries);
}

async function fetchHeadshotUrl(userId) {
  const data = await fetchJson(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
  );

  return data?.data?.[0]?.imageUrl || null;
}

async function fetchAvatarUrl(userId) {
  const data = await fetchJson(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`
  );

  return data?.data?.[0]?.imageUrl || null;
}

async function fetchRolimonsPlayerData(userId) {
  const data = await fetchJson(`https://api.rolimons.com/players/v1/playerassets/${userId}`);

  if (!data?.success) {
    throw new Error(data?.message || 'No pude obtener los datos de Rolimons.');
  }

  return data;
}

async function fetchRolimonsItemDetails() {
  if (cachedRolimonsItems && Date.now() - cachedRolimonsItemsAt < ITEM_DETAILS_CACHE_MS) {
    return cachedRolimonsItems;
  }

  const data = await fetchJson('https://api.rolimons.com/items/v2/itemdetails');

  if (!data?.success || !data?.items) {
    throw new Error('No pude obtener los detalles de items de Rolimons.');
  }

  cachedRolimonsItems = data.items;
  cachedRolimonsItemsAt = Date.now();

  return cachedRolimonsItems;
}

function calculateRolimonsTotals(playerAssets, itemDetails, inventoryPrivate) {
  if (inventoryPrivate) {
    return {
      rap: null,
      value: null
    };
  }

  let rap = 0;
  let value = 0;

  for (const [assetId, uaids] of Object.entries(playerAssets || {})) {
    const item = itemDetails[assetId];

    if (!item || !Array.isArray(uaids)) {
      continue;
    }

    const copies = uaids.length;
    const itemRap = Number(item[2]) || 0;
    const itemValue = Number(item[3]);
    const effectiveValue = itemValue >= 0 ? itemValue : itemRap;

    rap += itemRap * copies;
    value += effectiveValue * copies;
  }

  return { rap, value };
}

function formatRolimonsFieldValue(stat, profileUrl, cacheUnix) {
  const dateText =
    typeof cacheUnix === 'number' && cacheUnix > 0
      ? formatSpanishDate(cacheUnix)
      : 'No disponible';

  const statText = typeof stat === 'number' ? formatNumber(stat) : 'Sin datos';

  return `${statText}\n[Rolimons](${profileUrl}) • ${dateText}`;
}

async function handleUserCommand(message, query) {
  const user = await resolveRobloxUser(query);
  const userId = user.id;
  const profileUrl = getRobloxProfileUrl(userId);
  const rolimonsProfileUrl = getRolimonsProfileUrl(userId);

  const [presenceResult, countsResult, headshotResult, rolimonsResult] = await Promise.allSettled([
    fetchPresence(userId),
    fetchCounts(userId),
    fetchHeadshotUrl(userId),
    fetchRolimonsPlayerData(userId)
  ]);

  const presenceData = presenceResult.status === 'fulfilled' ? presenceResult.value : null;
  const counts = countsResult.status === 'fulfilled'
    ? countsResult.value
    : { friends: null, followers: null, followings: null };
  const headshotUrl = headshotResult.status === 'fulfilled' ? headshotResult.value : null;
  const rolimonsData = rolimonsResult.status === 'fulfilled' ? rolimonsResult.value : null;

  let rap = null;
  let value = null;

  if (rolimonsData) {
    try {
      const itemDetails = await fetchRolimonsItemDetails();
      const totals = calculateRolimonsTotals(
        rolimonsData.playerAssets,
        itemDetails,
        rolimonsData.playerPrivacyEnabled
      );

      rap = totals.rap;
      value = totals.value;
    } catch (error) {
      console.error('No se pudieron calcular las estadísticas de Rolimons:', error);
    }
  }

  const embed = createEmbed(
    `${user.displayName} (@${user.name})`,
    truncateDescription(user.description)
  )
    .setURL(profileUrl);

  if (headshotUrl) {
    embed.setThumbnail(headshotUrl);
  }

  embed.addFields(
    {
      name: 'ID',
      value: String(user.id),
      inline: true
    },
    {
      name: 'Inventario',
      value: rolimonsData
        ? rolimonsData.playerPrivacyEnabled
          ? 'Privado'
          : 'Público'
        : 'No disponible',
      inline: true
    },
    {
      name: 'RAP',
      value: formatRolimonsFieldValue(rap, rolimonsProfileUrl, rolimonsData?.chartNominalScanTime),
      inline: true
    },
    {
      name: 'Valor',
      value: formatRolimonsFieldValue(value, rolimonsProfileUrl, rolimonsData?.chartNominalScanTime),
      inline: true
    },
    {
      name: 'Creado',
      value: formatSpanishDate(user.created),
      inline: true
    },
    {
      name: 'Última vez en línea',
      value: formatLastSeen(presenceData, rolimonsData),
      inline: true
    },
    {
      name: 'Última vez cacheado',
      value:
        typeof rolimonsData?.chartNominalScanTime === 'number'
          ? `<t:${rolimonsData.chartNominalScanTime}:f>`
          : 'No disponible',
      inline: true
    },
    {
      name: 'Amigos',
      value: counts.friends === null ? 'No disponible' : formatNumber(counts.friends),
      inline: true
    },
    {
      name: 'Seguidores',
      value: counts.followers === null ? 'No disponible' : formatNumber(counts.followers),
      inline: true
    },
    {
      name: 'Siguiendo',
      value: counts.followings === null ? 'No disponible' : formatNumber(counts.followings),
      inline: true
    }
  );

  return message.reply({ embeds: [embed] });
}

async function handleAvatarCommand(message, query) {
  const user = await resolveRobloxUser(query);
  const avatarUrl = await fetchAvatarUrl(user.id);

  if (!avatarUrl) {
    throw new Error('No pude obtener el avatar de ese usuario.');
  }

  const embed = createEmbed(`Avatar de ${user.name}`)
    .setURL(getRobloxProfileUrl(user.id))
    .setImage(avatarUrl);

  return message.reply({ embeds: [embed] });
}

async function handleNameCommand(message, query) {
  await ensureGuildEmojis(message);

  const username = query.trim();

  if (!username) {
    throw new Error('Debes indicar un nombre de usuario.');
  }

  const [lookupResult, validateResult] = await Promise.all([
    fetchJson('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false
      })
    }),
    fetchJson(
      `https://auth.roblox.com/v1/usernames/validate?request.username=${encodeURIComponent(
        username
      )}&request.context=Signup&request.birthday=${encodeURIComponent(USERNAME_VALIDATE_BIRTHDAY)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  ]);

  const matchedUser = lookupResult?.data?.[0] || null;
  const validationCode = validateResult?.code;

  let emoji = pickRandomEmojiMention(message, WRONG_EMOJI_NAMES);
  let description = `El nombre \`${username}\` no es válido.`;

  if (validationCode === 0 && !matchedUser) {
    emoji = pickRandomEmojiMention(message, RIGHT_EMOJI_NAMES);
    description = `El nombre \`${username}\` está **disponible**.`;
  } else if (validationCode === 1 || matchedUser) {
    description = `El nombre \`${matchedUser?.name || username}\` está **usado**.`;
  } else if (validationCode === 2) {
    description = `El nombre \`${username}\` es **inapropiado**.`;
  }

  const embed = createEmbed('✧ nombre de usuario', `${emoji} ${description}`);

  return message.reply({ embeds: [embed] });
}

async function execute(message, parsedCommand) {
  const { commandName, args } = parsedCommand;
  const query = args.join(' ').trim();

  try {
    if (commandName === 'user') {
      if (!query) {
        return message.reply({
          embeds: [createErrorEmbed('Debes indicar un usuario de Roblox.')]
        });
      }

      return handleUserCommand(message, query);
    }

    if (commandName === 'av' || commandName === 'avatar') {
      if (!query) {
        return message.reply({
          embeds: [createErrorEmbed('Debes indicar un usuario de Roblox.')]
        });
      }

      return handleAvatarCommand(message, query);
    }

    if (commandName === 'name') {
      if (!query) {
        return message.reply({
          embeds: [createErrorEmbed('Debes indicar un nombre de usuario.')]
        });
      }

      return handleNameCommand(message, query);
    }

    return false;
  } catch (error) {
    console.error('Roblox command failed:', error);
    return message.reply({
      embeds: [createErrorEmbed(error.message || 'Algo salió mal al consultar Roblox.')]
    });
  }
}

module.exports = {
  execute
};
