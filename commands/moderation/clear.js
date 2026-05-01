const {
  createSuccessEmbed,
  hasPermission,
  replyWithError
} = require('./utils');

async function execute(message, args) {
  if (!(await hasPermission(message))) return;

  const amount = Number.parseInt(args[0], 10);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return replyWithError(message, 'Debes indicar una cantidad entre 1 y 100.');
  }

  try {
    const deleted = await message.channel.bulkDelete(amount + 1, true);
    const deletedCount = Math.max(deleted.size - 1, 0);
    const confirmation = await message.channel.send({
      embeds: [createSuccessEmbed(`Se eliminaron **${deletedCount}** mensajes.`)]
    });

    setTimeout(() => {
      confirmation.delete().catch(() => {});
    }, 5000);

    return confirmation;
  } catch (error) {
    console.error('Clear command failed:', error);
    return replyWithError(
      message,
      'No pude eliminar los mensajes. Recuerda que Discord no borra mensajes con más de 14 días usando este método.'
    );
  }
}

module.exports = { execute };
