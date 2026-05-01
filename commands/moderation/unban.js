const {
  hasPermission,
  replyWithError,
  replyWithSuccess
} = require('./utils');

async function execute(message, args) {
  if (!(await hasPermission(message))) return;

  const userId = args[0];

  if (!userId || !/^\d+$/.test(userId)) {
    return replyWithError(message, 'Debes indicar un ID de usuario válido para desbanear.');
  }

  try {
    const banEntry = await message.guild.bans.fetch(userId).catch(() => null);

    if (!banEntry) {
      return replyWithError(message, 'No encontré a un usuario baneado con ese ID.');
    }

    await message.guild.members.unban(userId);
    return replyWithSuccess(
      message,
      `Se desbaneó a **${banEntry.user.tag}**.`
    );
  } catch (error) {
    console.error('Unban command failed:', error);
    return replyWithError(message, 'No pude desbanear a ese usuario.');
  }
}

module.exports = { execute };
