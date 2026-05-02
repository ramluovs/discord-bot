const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const BIRTHDAY_FILE = path.join(__dirname, '../data/birthdays.json');
const BACKUP_CHANNEL_ID = '1499961569914654871';
const ANNOUNCEMENT_CHANNEL_ID = '1340867371971383376';
const TEST_ROLE_ID = '1340864854243803248';

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

module.exports = {
  scheduleBirthdayCheck,
  execute(message, parsedCommand) {
    const { commandName, args } = parsedCommand;
    if (commandName === 'birthday') return handleBirthdayCommand(message, args);
    if (commandName === 'testbirthday') return handleTestBirthdayCommand(message);
    return false;
  }
};
