const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

// Stream Mode State
let streamConfig = {
  enabled: false,
  percent: 50,
  extraSeconds: 10,
  lastSkippedTrackId: null
};

let pollInterval = null;

// Automatically refresh Spotify token
async function ensureToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);
  } catch (err) {
    console.error('[Spotify] Access token refresh error:', err.message);
  }
}

// Background poller for Stream Mode
async function checkAndSkip(channel) {
  try {
    await ensureToken();
    const data = await spotifyApi.getMyCurrentPlaybackState();

    if (!data.body || !data.body.is_playing || !data.body.item) return;

    const track = data.body.item;
    const progressMs = data.body.progress_ms;
    const durationMs = track.duration_ms;

    // Target Time = (Duration * Percent) + Extra Seconds
    const targetMs = (durationMs * (streamConfig.percent / 100)) + (streamConfig.extraSeconds * 1000);

    if (progressMs >= targetMs && streamConfig.lastSkippedTrackId !== track.id) {
      streamConfig.lastSkippedTrackId = track.id;
      await spotifyApi.skipToNext();
      if (channel) {
        channel.send(`⚡ **[Stream Mode]** Auto-skipped **${track.name}**!`);
      }
    }
  } catch (err) {
    console.error('[Spotify Stream Error]:', err.message);
  }
}

module.exports = {
  async execute(message, parsedCommand) {
    const { commandName, args } = parsedCommand;
    await ensureToken();

    try {
      // --- STREAM COMMAND (;stream 50 10 OR ;stream off) ---
      if (commandName === 'stream') {
        const option = args[0]?.toLowerCase();

        if (option === 'off' || option === 'stop') {
          streamConfig.enabled = false;
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
          streamConfig.lastSkippedTrackId = null;
          return message.reply('🔴 **Stream Mode Disabled.** Playing normally.');
        }

        const percent = Number(args[0]) || 50;
        const seconds = Number(args[1]) || 10;

        streamConfig.enabled = true;
        streamConfig.percent = percent;
        streamConfig.extraSeconds = seconds;

        if (!pollInterval) {
          pollInterval = setInterval(() => checkAndSkip(message.channel), 2500);
        }

        return message.reply(
          `🟢 **Stream Mode Enabled!**\nAuto-skipping tracks at **${percent}% + ${seconds}s**.`
        );
      }

      // --- PLAY COMMAND (;play song name OR ;sp song name) ---
      if (commandName === 'play' || commandName === 'sp') {
        const query = args.join(' ');
        if (!query) {
          await spotifyApi.play();
          return message.reply('▶️ Resumed Spotify playback.');
        }

        const searchRes = await spotifyApi.searchTracks(query);
        const track = searchRes.body.tracks?.items[0];

        if (!track) return message.reply('❌ No track found on Spotify.');

        await spotifyApi.play({ uris: [track.uri] });
        return message.reply(`🎵 Playing **${track.name}** by **${track.artists[0].name}**`);
      }

      // --- PAUSE COMMAND (;pause) ---
      if (commandName === 'pause') {
        await spotifyApi.pause();
        return message.reply('⏸️ Paused playback.');
      }

      // --- STOP COMMAND (;stop) ---
      if (commandName === 'stop') {
        await spotifyApi.pause();
        streamConfig.enabled = false;
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = null;
        return message.reply('⏹️ Stopped playback and disabled Stream Mode.');
      }

      // --- SKIP COMMAND (;skip) ---
      if (commandName === 'skip') {
        await spotifyApi.skipToNext();
        return message.reply('⏭️ Skipped track!');
      }

    } catch (err) {
      console.error('Spotify execution error:', err);
      return message.reply(`⚠️ **Spotify error**: ${err.message || 'Make sure Spotify is currently active on your phone or PC!'}`);
    }
  }
};
