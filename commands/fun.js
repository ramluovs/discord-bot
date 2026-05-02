const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const BIRTHDAY_FILE = path.join(__dirname, '../data/birthdays.json');
const LINKS_FILE = path.join(__dirname, '../data/links.json');
const BACKUP_CHANNEL_ID = '1499961569914654871';
const ANNOUNCEMENT_CHANNEL_ID = '1340867371971383376';
const TEST_ROLE_ID = '1340864854243803248';

const DEFAULT_LINKS = {
  pages: [
    {
      image: 'https://cdn.discordapp.com/attachments/1376142899883806791/1388872154006950028/IMG_2015-1-1.gif?ex=69f6a33d&is=69f551bd&hm=e1f1f47dc49bb88585629e0d231345d7726317c729e4ae82fec1b49ff8cea7a6&',
      entries: [
        { name: 'Da Hood', link: 'https://www.roblox.com/share?code=748fd832bddcfe4b91a205cb35e154a9&type=Server', id: null, shortcuts: ['dahood', 'dh'] },
        { name: 'Catalogo', link: 'https://www.roblox.com/share?code=f123c0c11dafde4d8ac69baa7b9279fd&type=Server', id: null, shortcuts: ['catalogo'] },
        { name: 'Outfit Loader', link: 'https://www.roblox.com/share?code=7557cc3fd4134d4a879a7d55bc579195&type=Server', id: null, shortcuts: ['outfitloader', 'outfit loader'] },
        { name: 'Adopt Me!', link: 'https://www.roblox.com/share?code=101348493668e94e8d758fe4619cadec&type=Server', id: null, shortcuts: ['adoptme', 'adopt me', 'adopt me!'] },
        { name: 'Chidoris FG Grupo', link: 'https://www.roblox.com/es/communities/35678194/CHIDORis-FG#!/about', id: '35678194', shortcuts: ['chidoris', 'chidorisfg'] },
        { name: 'Monsur', link: 'https://www.roblox.com/communities/112401601/monsur#!/about', id: '112401601', shortcuts: ['monsur'] }
      ]
    },
    {
      image: 'https://media.discordapp.net/attachments/932235016795193404/1201185301641560174/Tumblr_l_764383497369405.gif?width=1440&height=178&ex=69f6bf3c&is=69f56dbc&hm=cef9297ad2ca6934ba78f53af0f51031701d081ff6ef059f594391e630d1dea6&',
      entries: [
        { name: 'Rami Item Buyer', link: 'https://www.roblox.com/share?code=764a0f5f8be0384a8e05f3e028ad1c8b&type=Server', id: null, shortcuts: ['rami'] },
        { name: 'Luk Item Buyer', link: 'https://www.roblox.com/es/games/116815083533755/confetties', id: null, shortcuts: ['luk'] },
        { name: 'Miel Item Buyer', link: 'https://www.roblox.com/es/games/refer?PlaceId=18939513307&PageType=GroupDetail&LocalTimestamp=%7BlocalTimestamp%7D', id: null, shortcuts: ['miel'] }
      ]
    }
  ]
};

const CUTE_EMOJIS = [
  '<a:conejito:1456045352963674173>',
  '<a:brillos:1365029394090954832>',
  '<a:brillos:1366478256676671618>',
  '<a:camara:1363776138056564858>',
  '<a:first:1499651324600651877>',
  '<:mariposa:1456045355509747782>',
  '<:osito:1456045350690488382>',
  '<a:right2:1499651329570897982>',
  '<:right3:1499652025129111572>',
  '<a:wrong2:1499651340664705084>',
  '<a:typing:1456045079629402224>'
];

const BIRTHDAY_MESSAGES = [
  'esperemos que la pases increíble rodeada de personas que te quieren mucho!',
  'que este día esté lleno de cosas bonitas y momentos que recuerdes siempre!',
  'mereces todo lo mejor hoy y siempre, que lo disfrutes muchísimo!',
  'ojalá este cumpleaños sea tan especial como tú lo eres!',
  'que todos tus deseos se hagan realidad hoy, lo mereces!'
];

function loadBirthdays() {
  try {
    if (!fs.existsSync(BIRTHDAY_FILE)) return {};
    return JSON.parse(fs.readFileSync(BIRTHDAY_FILE, 'utf8'));
  } catch { return {}; }
}

function saveBirthdays(data) {
  try {
    const dir = path.dirname(BIRTHDAY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BIRTHDAY_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save birthdays:', e); }
}

function loadLinks() {
  try {
    if (!fs.existsSync(LINKS_FILE)) {
      saveLinks(DEFAULT_LINKS);
      return DEFAULT_LINKS;
    }
    return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  } catch { return DEFAULT_LINKS; }
}

function saveLinks(data) {
  try {
    const dir = path.dirname(LINKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save links:', e); }
}

function parseDate(input) {
  const match = input.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}))?$/);
  if (!match) return null;
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const year = match[3] ? parseInt(match[3]) : null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day, year };
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function saveToBackupChannel(client, userId, month, day, year) {
  try {
    const channel = await client.channels.fetch(BACKUP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    const yearStr = year ? `/${year}` : '';
    await channel.send(`BIRTHDAY_DATA userId:${userId} date:${month}/${day}${yearStr}`);
  } catch (e) { console.error('Failed to save to backup channel:', e); }
}

async function deleteFromBackupChannel(client, userId) {
  try {
    const channel = await client.channels.fetch(BACKUP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    let lastId = null;
    let found = true;
    while (found) {
      found = false;
      const messages = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (!messages.size) break;
      for (const msg of messages.values()) {
        if (msg.author.id === client.user.id && msg.content.includes(`userId:${userId}`)) {
          await msg.delete().catch(() => {});
          found = true;
        }
        lastId = msg.id;
      }
    }
  } catch (e) { console.error('Failed to delete from backup channel:', e); }
}

async function loadFromBackupChannel(client) {
  try {
    const channel = await client.channels.fetch(BACKUP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return {};
    const data = {};
    let lastId = null;
    let fetching = true;
    while (fetching) {
      const messages = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (!messages.size) { fetching = false; break; }
      for (const msg of messages.values()) {
        if (msg.author.id !== client.user.id) continue;
        const match = msg.content.match(/userId:(\d+)\s+date:(\d+)\/(\d+)(?:\/(\d+))?/);
        if (match) {
          const userId = match[1];
          if (!data[userId]) {
            data[userId] = {
              month: parseInt(match[2]),
              day: parseInt(match[3]),
              year: match[4] ? parseInt(match[4]) : null
            };
          }
        }
        lastId = msg.id;
      }
      if (messages.size < 100) fetching = false;
    }
    return data;
  } catch (e) {
    console.error('Failed to load from backup channel:', e);
    return {};
  }
}

async function sendBirthdayAnnouncement(client, userId, month, day, year, isTest = false) {
  try {
    const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const cutEmoji = getRandomItem(CUTE_EMOJIS);
    const birthdayMsg = getRandomItem(BIRTHDAY_MESSAGES);
    const userMention = isTest ? '<@329989388354256897>' : `<@${userId}>`;

    let ageText = '';
    if (year) {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const age = now.getFullYear() - year;
      ageText = isTest ? `\nfeliz ${age} años, ${birthdayMsg}` : `\nfeliz ${age} años, ${birthdayMsg}`;
    }

    const everyoneText = isTest
      ? `|| palabras aleatorias que no etiquetan a nadie ||`
      : `|| @everyone ||`;

    const messageContent = [
      `Feliz **cum**pleaños a ${userMention} ${cutEmoji}`,
      ``,
      ageText ? ageText : '',
      ``,
      everyoneText
    ].filter(line => line !== '').join('\n');

    const sent = await channel.send({ content: messageContent });

    await sent.react('<a:wing2:1499968356898308198>').catch(() => {});
    await sent.react('<a:wing1:1499968359293259856>').catch(() => {});
  } catch (e) {
    console.error('Failed to send birthday announcement:', e);
  }
}

function scheduleBirthdayCheck(client) {
  function getNextMidnightET() {
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const nextMidnight = new Date(etNow);
    nextMidnight.setHours(24, 0, 0, 0);
    const diff = nextMidnight - etNow;
    return diff;
  }

  async function checkBirthdays() {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayMonth = etNow.getMonth() + 1;
    const todayDay = etNow.getDate();

    const backupData = await loadFromBackupChannel(client);
    saveBirthdays(backupData);
    const birthdays = loadBirthdays();

    for (const [userId, data] of Object.entries(birthdays)) {
      if (data.month === todayMonth && data.day === todayDay) {
        await sendBirthdayAnnouncement(client, userId, data.month, data.day, data.year, false);
      }
    }

    setTimeout(async () => {
      await checkBirthdays();
    }, 24 * 60 * 60 * 1000);
  }

  const msUntilMidnight = getNextMidnightET();
  setTimeout(async () => {
    await checkBirthdays();
  }, msUntilMidnight);
}

function buildLinksEmbed(page, expiresAt) {
  const description = [
    page.entries.map(entry => {
      const entryLine = `[♡- ${entry.name}](${entry.link})`;
      return entry.id ? `${entryLine}\n-# ID: ${entry.id}` : entryLine;
    }).join('\n\n'),
    '',
    `-# Si quieres el link directo de alguno, responde a mi mensaje con el nombre. Este mensaje vence a las <t:${expiresAt}:T>`
  ].join('\n');

  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ links')
    .setDescription(description)
    .setImage(page.image);
}

function buildLinksButtons(currentPage, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('links_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === 0),
    new ButtonBuilder()
      .setCustomId('links_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === totalPages - 1)
  );
}

function createEditLinksUsageEmbed() {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ editlinks — cómo usar')
    .setDescription([
      '**Editar un link existente:**',
      '`;editlinks (nombre/atajo) link (nuevo link)`',
      'Ejemplos: `;editlinks dh link https://...` o `;editlinks catalogo link https://...`',
      '',
      '**Editar el nombre de una entrada:**',
      '`;editlinks (nombre/atajo) name (nuevo nombre)`',
      '',
      '**Agregar una nueva entrada:**',
      '`;editlinks add (nombre) (link) pg(número)`',
      'Ejemplo: `;editlinks add "Mi Juego" https://... pg1`',
      '',
      'Atajos disponibles: dahood/dh, catalogo, outfitloader/outfit loader, adoptme/adopt me, chidoris/chidorisfg, monsur, rami, luk, miel'
    ].join('\n'));
}

function findLinkEntryByShortcut(data, search) {
  const normalizedSearch = search.trim().toLowerCase();

  for (const page of data.pages || []) {
    for (const entry of page.entries || []) {
      const matchesShortcut = (entry.shortcuts || []).some(shortcut => shortcut.toLowerCase() === normalizedSearch);
      const matchesName = entry.name.toLowerCase() === normalizedSearch;

      if (matchesShortcut || matchesName) {
        return entry;
      }
    }
  }

  return null;
}

async function handleBirthdayCommand(message, args) {
  const userId = message.author.id;
  const input = args.join(' ').trim();

  if (!input) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Escribe tu cumpleaños así: `MM / DD / YYYY` (el año es opcional).')]
    });
  }

  const parsed = parseDate(input);
  if (!parsed) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Formato inválido. Usa: `MM / DD / YYYY` (el año es opcional).')]
    });
  }

  const birthdays = loadBirthdays();

  if (birthdays[userId]) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('birthday_yes').setLabel('Sí').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('birthday_no').setLabel('No').setStyle(ButtonStyle.Danger)
    );

    const reply = await message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('cumpleaños').setDescription('Ya tienes un cumpleaños guardado, ¿quisieras borrarlo?')],
      components: [row]
    });

    const filter = i => (i.customId === 'birthday_yes' || i.customId === 'birthday_no') && i.user.id === userId;
    const collector = reply.createMessageComponentCollector({ filter, max: 1, time: 60 * 1000 });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'birthday_no') {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('cumpleaños').setDescription('Está bien, tu cumpleaños se quedó guardado.')],
          components: []
        });
        return;
      }

      delete birthdays[userId];
      saveBirthdays(birthdays);
      await deleteFromBackupChannel(interaction.client, userId);

      const confirmReply = await interaction.update({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('cumpleaños').setDescription('Cumpleaños borrado. Responde a este mensaje y escribe tu nuevo cumpleaños en este formato:\n`MM / DD / AAAA` (el año es opcional).')],
        components: [],
        fetchReply: true
      });

      const msgFilter = m => m.reference?.messageId === confirmReply.id && m.author.id === userId;
      const collected = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 2 * 60 * 1000 });

      if (!collected.size) return;

      const newParsed = parseDate(collected.first().content);
      if (!newParsed) {
        return collected.first().reply({
          embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Formato inválido. Usa: `MM / DD / AAAA`')]
        });
      }

      birthdays[userId] = { month: newParsed.month, day: newParsed.day, year: newParsed.year };
      saveBirthdays(birthdays);
      await saveToBackupChannel(interaction.client, userId, newParsed.month, newParsed.day, newParsed.year);

      return collected.first().reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('cumpleaños').setDescription(`Tu nuevo cumpleaños fue guardado: **${newParsed.month}/${newParsed.day}${newParsed.year ? `/${newParsed.year}` : ''}** 🎂`)]
      });
    });

    collector.on('end', collected => {
      if (!collected.size) {
        reply.edit({ components: [] }).catch(() => {});
      }
    });

    return;
  }

  birthdays[userId] = { month: parsed.month, day: parsed.day, year: parsed.year };
  saveBirthdays(birthdays);
  await saveToBackupChannel(message.client, userId, parsed.month, parsed.day, parsed.year);

  return message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('cumpleaños').setDescription(`Tu cumpleaños fue guardado: **${parsed.month}/${parsed.day}${parsed.year ? `/${parsed.year}` : ''}** 🎂`)]
  });
}

async function handleTestBirthdayCommand(message) {
  const member = message.member;
  if (!member || !member.roles.cache.has(TEST_ROLE_ID)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No tienes permiso para usar este comando.')]
    });
  }

  await sendBirthdayAnnouncement(message.client, message.author.id, null, null, 2000, true);

  return message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('test').setDescription('Mensaje de cumpleaños de prueba enviado.')]
  });
}

async function handleLinksCommand(message) {
  const linksData = loadLinks();
  const expiresAt = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);

  if (!linksData.pages?.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No hay links guardados.')]
    });
  }

  let currentPage = 0;
  const totalPages = linksData.pages.length;

  const buildState = (disabled = false) => ({
    embeds: [buildLinksEmbed(linksData.pages[currentPage], expiresAt)],
    components: [buildLinksButtons(currentPage, totalPages, disabled)]
  });

  const botReply = await message.reply(buildState());

  const buttonFilter = interaction => interaction.user.id === message.author.id;
  const buttonCollector = botReply.createMessageComponentCollector({
    filter: buttonFilter,
    time: 3 * 60 * 1000
  });

  buttonCollector.on('collect', async interaction => {
    if (interaction.customId === 'links_prev' && currentPage > 0) {
      currentPage--;
    }

    if (interaction.customId === 'links_next' && currentPage < totalPages - 1) {
      currentPage++;
    }

    await interaction.update(buildState());
  });

  buttonCollector.on('end', async () => {
    await botReply.edit(buildState(true)).catch(() => {});
  });

  const replyFilter = response =>
    response.reference?.messageId === botReply.id &&
    response.author.id === message.author.id;

  const replyCollector = message.channel.createMessageCollector({
    filter: replyFilter,
    time: 3 * 60 * 1000
  });

  replyCollector.on('collect', async response => {
    const normalizedName = response.content.trim().toLowerCase();
    const matchedEntry = (linksData.pages || [])
      .flatMap(page => page.entries || [])
      .find(entry => entry.name.toLowerCase() === normalizedName);

    if (!matchedEntry) {
      await response.reply('No encontré ese link.');
      return;
    }

    await response.reply(matchedEntry.link);
  });
}

async function handleEditLinksCommand(message, args) {
  const member = message.member;

  if (!member || !member.roles.cache.has(TEST_ROLE_ID)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No tienes permiso para usar este comando.')]
    });
  }

  if (!args.length) {
    return message.reply({ embeds: [createEditLinksUsageEmbed()] });
  }

  const linksData = loadLinks();

  if (args[0].toLowerCase() === 'add') {
    const pageArg = args[args.length - 1];
    const pageMatch = pageArg?.match(/^pg(\d+)$/i);
    const link = args[args.length - 2];
    const name = args.slice(1, -2).join(' ').trim().replace(/^"(.*)"$/, '$1');

    if (!pageMatch || !link || !name) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Formato inválido para agregar una entrada.')]
      });
    }

    const pageIndex = parseInt(pageMatch[1], 10) - 1;

    if (!linksData.pages?.[pageIndex]) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Esa página no existe.')]
      });
    }

    linksData.pages[pageIndex].entries.push({
      name,
      link,
      id: null,
      shortcuts: [name.toLowerCase()]
    });

    saveLinks(linksData);

    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ editlinks').setDescription(`Entrada agregada correctamente a la página ${pageIndex + 1}.`)]
    });
  }

  const search = args[0];
  const action = args[1]?.toLowerCase();
  const newValue = args.slice(2).join(' ').trim().replace(/^"(.*)"$/, '$1');

  if (!search || !action || !newValue || !['link', 'name'].includes(action)) {
    return message.reply({ embeds: [createEditLinksUsageEmbed()] });
  }

  const matchedEntry = findLinkEntryByShortcut(linksData, search);

  if (!matchedEntry) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No encontré esa entrada.')]
    });
  }

  if (action === 'link') {
    matchedEntry.link = newValue;
  }

  if (action === 'name') {
    matchedEntry.name = newValue;
  }

  saveLinks(linksData);

  return message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ editlinks').setDescription('Actualizado correctamente.')]
  });
}

module.exports = {
  scheduleBirthdayCheck,
  execute(message, parsedCommand) {
    const { commandName, args } = parsedCommand;
    if (commandName === 'birthday') return handleBirthdayCommand(message, args);
    if (commandName === 'testbirthday') return handleTestBirthdayCommand(message);
    if (commandName === 'links') return handleLinksCommand(message);
    if (commandName === 'editlinks') return handleEditLinksCommand(message, args);
    return false;
  }
};
