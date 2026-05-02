const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const PASTEL_BLUE = 0xaeefff;
const ERROR_RED = 0xff6b6b;
const RIGHT_EMOJI_NAMES = ['right1', 'right2', 'right3'];
const WRONG_EMOJI_NAMES = ['wrong1', 'wrong2', 'wrong3'];
const ITEM_DETAILS_CACHE_MS = 60 * 1000;
const USERNAME_VALIDATE_BIRTHDAY = '2000-01-01T00:00:00.000Z';
const ROLIMONS_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const ROLIMONS_HEADERS = {
  Referer: 'https://www.rolimons.com/',
  'User-Agent': ROLIMONS_BROWSER_USER_AGENT
};
const NAMES_PREV_BUTTON_ID = 'names_prev';
const NAMES_NEXT_BUTTON_ID = 'names_next';
const NAMES_BUTTON_TIMEOUT_MS = 2 * 60 * 1000;
const EMBED_DESCRIPTION_LIMIT = 4096;

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
      data?.userFacingMessage ||
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
  try {
    const data = await fetchJson(`https://api.rolimons.com/players/v1/playerassets/${userId}`, {
      headers: ROLIMONS_HEADERS
    });

    if (!data?.success) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('No se pudieron obtener los datos de Rolimons:', error);
    return null;
  }
}

async function fetchRolimonsPlayerInfo(userId) {
  try {
    const data = await fetchJson(`https://api.rolimons.com/players/v1/playerinfo/${userId}`, {
      headers: ROLIMONS_HEADERS
    });
    if (!data?.success) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchRolimonsItemDetails() {
  if (cachedRolimonsItems && Date.now() - cachedRolimonsItemsAt < ITEM_DETAILS_CACHE_MS) {
    return cachedRolimonsItems;
  }

  const data = await fetchJson('https://api.rolimons.com/items/v2/itemdetails', {
    headers: ROLIMONS_HEADERS
  });

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

function buildNamesPages(entries) {
  const pages = [];
  
  for (let index = 0; index < entries.length; index += 15) {
    pages.push(entries.slice(index, index + 15).join('\n'));
  }

  return pages.length ? pages : [''];
}

function createNamesButtons(pageIndex, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(NAMES_PREV_BUTTON_ID)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(NAMES_NEXT_BUTTON_ID)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === totalPages - 1)
  );
}

function createNamesPageEmbed(user, profileUrl, pages, pageIndex, totalNames) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(`${user.displayName} (@${user.name}) (${totalNames})`)
    .setURL(profileUrl)
    .setDescription(pages[pageIndex])
    .setFooter({ text: `Página ${pageIndex + 1}/${pages.length}` });
}

function slugifyGroupName(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return slug || 'group-name';
}

async function handleUserCommand(message, query) {
  const user = await resolveRobloxUser(query);
  const userId = user.id;
  const profileUrl = getRobloxProfileUrl(userId);

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
  console.log('ROLIMONS DATA:', JSON.stringify(rolimonsData, null, 2));
  const rolimonsPlayerInfo = await fetchRolimonsPlayerInfo(userId);

  let rap = null;
  let value = null;

  if (rolimonsData && !rolimonsData.playerPrivacyEnabled) {
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
  } else if (rolimonsPlayerInfo) {
    rap = typeof rolimonsPlayerInfo.rap === 'number' ? rolimonsPlayerInfo.rap : null;
    value = typeof rolimonsPlayerInfo.value === 'number' ? rolimonsPlayerInfo.value : null;
  }

  const inventoryUrl = `https://www.roblox.com/users/${userId}/inventory/#!/hats`;
  const rolimonsProfileUrl = `https://www.rolimons.com/player/${userId}`;
  const friendsUrl = `https://www.roblox.com/users/${userId}/friends`;
  const followersUrl = `https://www.roblox.com/users/${userId}/followers`;
  const followingUrl = `https://www.roblox.com/users/${userId}/following`;

  const inventoryValue = rolimonsData
    ? rolimonsData.playerPrivacyEnabled
      ? 'Privado'
      : 'Público'
    : 'No disponible';

  const rapValue = `[${typeof rap === 'number' ? formatNumber(rap) : 'Sin datos'}](${rolimonsProfileUrl})${
    rolimonsData?.chartNominalScanTime ? `\n<t:${rolimonsData.chartNominalScanTime}:d>` : ''
  }`;

  const valueFieldValue =
    `[${typeof value === 'number' ? formatNumber(value) : 'Sin datos'}](${rolimonsProfileUrl})${
      rolimonsData?.chartNominalScanTime ? `\n<t:${rolimonsData.chartNominalScanTime}:d>` : ''
    }`;

  const embed = new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(`${user.displayName} (@${user.name})`)
    .setURL(profileUrl)
    .setDescription(truncateDescription(user.description));

  if (headshotUrl) {
    embed.setThumbnail(headshotUrl);
  }

  embed.addFields(
    {
      name: 'ID',
      value: `\`${user.id}\``,
      inline: true
    },
    {
      name: 'Inventario',
      value: `[${inventoryValue}](${inventoryUrl})`,
      inline: true
    },
    {
      name: '\u200B',
      value: '\u200B',
      inline: true
    }
  );

  embed.addFields(
    {
      name: 'RAP',
      value: rapValue,
      inline: true
    },
    {
      name: 'Valor',
      value: valueFieldValue,
      inline: true
    },
    {
      name: '\u200B',
      value: '\u200B',
      inline: true
    }
  );

  embed.addFields(
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
        rolimonsData?.chartNominalScanTime
          ? `<t:${rolimonsData.chartNominalScanTime}:f>`
          : 'No disponible',
      inline: true
    }
  );

  embed.addFields(
    {
      name: 'Amigos',
      value: `[${counts.friends !== null ? formatNumber(counts.friends) : '0'}](${friendsUrl})`,
      inline: true
    },
    {
      name: 'Seguidores',
      value: `[${counts.followers !== null ? formatNumber(counts.followers) : '0'}](${followersUrl})`,
      inline: true
    },
    {
      name: 'Siguiendo',
      value: `[${counts.followings !== null ? formatNumber(counts.followings) : '0'}](${followingUrl})`,
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

async function handleNamesCommand(message, query) {
  const user = await resolveRobloxUser(query);
  const userId = user.id;
  const profileUrl = getRobloxProfileUrl(userId);

  let historyData = null;
  try {
    historyData = await fetchJson(
      `https://users.roblox.com/v1/users/${userId}/username-history?limit=50&sortOrder=Asc`
    );
  } catch {
    historyData = null;
  }
  const names = historyData?.data?.map(entry => entry.name) || [];

  if (names.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setDescription(`El [\`${user.name}\`](${profileUrl}) **no tiene** nombres pasados.`);

    return message.reply({ embeds: [embed] });
  }

  const entries = names.map((name, index) => `${index + 1}. ${name}`);
  const pages = buildNamesPages(entries);
  let currentPage = 0;

  const reply = await message.reply({
    embeds: [createNamesPageEmbed(user, profileUrl, pages, currentPage, names.length)],
    components: pages.length > 1 ? [createNamesButtons(currentPage, pages.length)] : []
  });

  if (pages.length <= 1) {
    return reply;
  }

  const collector = reply.createMessageComponentCollector({
    time: NAMES_BUTTON_TIMEOUT_MS
  });

  collector.on('collect', async interaction => {
    if (
      interaction.customId !== NAMES_PREV_BUTTON_ID &&
      interaction.customId !== NAMES_NEXT_BUTTON_ID
    ) {
      return;
    }

    if (interaction.user.id !== message.author.id) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    if (interaction.customId === NAMES_PREV_BUTTON_ID && currentPage > 0) {
      currentPage--;
    }

    if (interaction.customId === NAMES_NEXT_BUTTON_ID && currentPage < pages.length - 1) {
      currentPage++;
    }

    await interaction.update({
      embeds: [createNamesPageEmbed(user, profileUrl, pages, currentPage, names.length)],
      components: [createNamesButtons(currentPage, pages.length)]
    });
  });

  collector.on('end', async () => {
    await reply.edit({
      components: [createNamesButtons(currentPage, pages.length, true)]
    }).catch(() => {});
  });

  return reply;
}

async function handleGroupCommand(message, query) {
  await ensureGuildEmojis(message);

  const trimmedQuery = query.trim();
  let group = null;
  let isInappropriate = false;

  if (/^\d+$/.test(trimmedQuery)) {
    try {
      group = await fetchJson(`https://groups.roblox.com/v1/groups/${trimmedQuery}`);
    } catch (error) {
      console.error('No se pudo obtener el grupo por ID:', error);
    }
  } else {
    let searchData = null;
    let lookupData = null;

    try {
      lookupData = await fetchJson(
        `https://groups.roblox.com/v1/groups/search/lookup?groupName=${encodeURIComponent(trimmedQuery)}`
      );
    } catch (error) {
      if (/not appropriate/i.test(error.message)) {
        isInappropriate = true;
      } else {
        console.error('No se pudo validar el nombre del grupo:', error);
      }
    }

    try {
      searchData = await fetchJson(
        `https://groups.roblox.com/v1/groups/search?keyword=${encodeURIComponent(
          trimmedQuery
        )}&prioritizeExactMatch=true&limit=10`
      );
    } catch (error) {
      if (/not appropriate/i.test(error.message)) {
        isInappropriate = true;
      } else {
        console.error('No se pudo buscar el grupo:', error);
      }
    }

    if (isInappropriate) {
      const emoji = pickRandomEmojiMention(message, WRONG_EMOJI_NAMES);
      const embed = createEmbed('✧ grupo', `${emoji} El grupo \`${trimmedQuery}\` **es inapropiado**.`);
      return message.reply({ embeds: [embed] });
    }

    const groups = Array.isArray(searchData?.data) ? searchData.data : [];
    const exactMatch = groups.find(
      entry => typeof entry?.name === 'string' && entry.name.toLowerCase() === trimmedQuery.toLowerCase()
    );
    const searchMatch = exactMatch || groups[0] || null;
    const lookupHasData = Array.isArray(lookupData?.data) && lookupData.data.length > 0;

    if (!searchMatch && !lookupHasData) {
      const emoji = pickRandomEmojiMention(message, WRONG_EMOJI_NAMES);
      const embed = createEmbed('✧ grupo', `${emoji} El grupo \`${trimmedQuery}\` **no existe**.`);
      return message.reply({ embeds: [embed] });
    }

    if (searchMatch?.id) {
      try {
        group = await fetchJson(`https://groups.roblox.com/v1/groups/${searchMatch.id}`);
      } catch (error) {
        console.error('No se pudo obtener el grupo completo:', error);
        group = searchMatch;
      }
    }
  }

  if (!group?.id || !group?.name) {
    const emoji = pickRandomEmojiMention(message, WRONG_EMOJI_NAMES);
    const embed = createEmbed('✧ grupo', `${emoji} El grupo \`${trimmedQuery}\` **no existe**.`);
    return message.reply({ embeds: [embed] });
  }

  const emoji = pickRandomEmojiMention(message, RIGHT_EMOJI_NAMES);
  const groupSlug = slugifyGroupName(group.name);
  const groupUrl = `https://www.roblox.com/groups/${group.id}/${groupSlug}`;
  const ownerName = group.owner?.username || 'Sin propietario';

  const embed = createEmbed(
    '✧ grupo',
    `${emoji} El grupo \`${group.name}\` está **usado**.\n\nRoblox Group → [${group.name}](${groupUrl})`
  ).addFields(
    {
      name: 'Miembros',
      value: formatNumber(group.memberCount ?? 0),
      inline: true
    },
    {
      name: 'Propietario',
      value: ownerName,
      inline: true
    },
    {
      name: 'Descripción',
      value: truncateDescription(group.description),
      inline: false
    }
  );

  return message.reply({ embeds: [embed] });
}

async function handleRsCommand(message, query) {
  const trimmedQuery = query.trim();

  let assetId = null;
  if (/^\d+$/.test(trimmedQuery)) {
    assetId = trimmedQuery;
  } else {
    const match = trimmedQuery.match(/\/(\d+)/);
    if (match) assetId = match[1];
  }

  if (!assetId) {
    return message.reply({ embeds: [createErrorEmbed('No pude encontrar el ID del asset.')] });
  }

  try {
    const assetData = await fetchJson(`https://economy.roblox.com/v2/assets/${assetId}/details`).catch(() => null);
    const assetName = assetData?.Name || `Asset ${assetId}`;
    const downloadUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;

    const embed = new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle(assetName)
      .setURL(`https://www.roblox.com/catalog/${assetId}`)
      .setDescription(`[Descargar plantilla](${downloadUrl})\n\nResponde a mi mensaje con lo que descargaste.`);

    const botReply = await message.reply({ embeds: [embed] });

    const filter = response =>
      response.reference?.messageId === botReply.id &&
      response.author.id === message.author.id &&
      response.attachments.size > 0;

    const collected = await message.channel.awaitMessages({
      filter,
      max: 1,
      time: 5 * 60 * 1000
    });

    if (!collected.size) return;

    const uploadedAttachment = collected.first().attachments.first();
    const fileRes = await fetch(uploadedAttachment.url);
    if (!fileRes.ok) throw new Error('No pude leer el archivo.');

    const xmlText = await fileRes.text();
    const innerIdMatch = xmlText.match(/asset\/\?id=(\d+)/);

    if (!innerIdMatch) {
      return collected.first().reply({ embeds: [createErrorEmbed('No encontré la imagen dentro del archivo.')] });
    }

    const innerImageId = innerIdMatch[1];
    const imageUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${innerImageId}`;

    const imageEmbed = new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle(assetName)
      .setURL(`https://www.roblox.com/catalog/${assetId}`)
      .setDescription([
        `[Descargar imagen](${imageUrl})`,
        ``,
        `**PC** → arrastra el archivo a tu navegador para ver la imagen.`,
        `**iPhone** → compartir → Guardar en Archivos → renombra añadiendo \`.png\` al final.`,
        `**Android** → abre con cualquier app de galería.`
      ].join('\n'));

    return collected.first().reply({ embeds: [imageEmbed] });
  } catch (error) {
    return message.reply({ embeds: [createErrorEmbed(error.message || 'No se pudo obtener el asset.')] });
  }
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

    if (commandName === 'names') {
      if (!query) {
        return message.reply({ embeds: [createErrorEmbed('Debes indicar un usuario de Roblox.')] });
      }
      return handleNamesCommand(message, query);
    }

    if (commandName === 'group') {
      if (!query) {
        return message.reply({ embeds: [createErrorEmbed('Debes indicar un nombre o ID de grupo.')] });
      }
      return handleGroupCommand(message, query);
    }

    if (commandName === 'rs') {
      if (!query) {
        return message.reply({ embeds: [createErrorEmbed('Debes indicar un ID o link de asset.')] });
      }
      return handleRsCommand(message, query);
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
