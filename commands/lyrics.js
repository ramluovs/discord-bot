const { EmbedBuilder } = require('discord.js');

const SONG_DATA_CHANNEL_ID = '1504904371731828906';
const PASTEL_BLUE = 0xaeefff;
const ALLOWED_ROLES = ['1340864854243803248', '1500217745889824898'];

function hasLyricsRole(message) {
  return message.member?.roles.cache.some(role => ALLOWED_ROLES.includes(role.id)) ?? false;
}

function createBlueEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(title)
    .setDescription(description);
}

function extractAudioUrl(args) {
  return args.find(arg => /^https?:\/\//i.test(arg)) || null;
}

function withAudioLine(content, url) {
  const clean = content.replace(/\nAUDIO:\S+/g, '');
  return clean + '\nAUDIO:' + url;
}

async function execute(message, parsedCommand) {
  if (!hasLyricsRole(message)) return false;

  const args = parsedCommand.args;
  if (parsedCommand.commandName !== 'lyricaudio') return false;

  const songId = args[0];
  if (!songId) {
    return message.reply({
      embeds: [createBlueEmbed('\u2726 lyricaudio usage \u2726', 'Use ;lyricaudio <song_id> with an .mp3/.mp4 attachment, or ;lyricaudio <song_id> <audio_url>.')]
    });
  }

  try {
    const channel = await message.client.channels.fetch(SONG_DATA_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) throw new Error('Song channel unavailable');

    let songMessage;
    try {
      songMessage = await channel.messages.fetch(songId);
    } catch {
      return message.reply({ embeds: [createBlueEmbed('error', 'I could not find that song message.')] });
    }

    if (!songMessage.content?.startsWith('SONG:')) {
      return message.reply({ embeds: [createBlueEmbed('error', 'That message is not a saved song.')] });
    }

    const jsonText = songMessage.content.slice(5).split('\nAUDIO:')[0];
    let songName = 'this song';
    try { songName = JSON.parse(jsonText).name || songName; } catch {}

    const attachment = message.attachments.first();
    const urlArg = extractAudioUrl(args.slice(1));
    let audioUrl = urlArg;

    if (!audioUrl && attachment) {
      const uploaded = await channel.send({
        files: [{ attachment: attachment.url, name: attachment.name || 'lyrics-audio.mp4' }]
      });
      audioUrl = uploaded.attachments.first()?.url;
    }

    if (!audioUrl) {
      return message.reply({ embeds: [createBlueEmbed('error', 'Attach an .mp3/.mp4 file or include an audio URL.')] });
    }

    await songMessage.edit({ content: withAudioLine(songMessage.content, audioUrl) });

    return message.reply({
      embeds: [createBlueEmbed('\u2727 audio attached', 'Added audio to **' + songName + '**.')]
    });
  } catch (error) {
    console.error('lyricaudio failed:', error);
    return message.reply({ embeds: [createBlueEmbed('error', 'Failed to attach audio.')] });
  }
}

module.exports = { execute };
