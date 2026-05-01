const {
  fetchTargetMember,
  hasPermission,
  isValidTarget,
  parseDuration,
  replyWithError,
  replyWithSuccess
} = require('./utils');

async function execute(message, args) {
  if (!(await hasPermission(message))) return;

  const targetInput = args[0];
  const durationInput = args[1];

  if (!targetInput) {
    return replyWithError(message, 'Debes mencionar a un usuario para aplicarle timeout.');
  }

  if (!durationInput) {
    return replyWithError(message, 'Debes indicar una duración válida. Ejemplo: `10m`.');
  }

  const target = await fetchTargetMember(message, targetInput);

  if (!(await isValidTarget(message, target))) return;

  if (!target.moderatable) {
    return replyWithError(message, 'No puedo aplicar timeout a ese usuario por permisos o jerarquía.');
  }

  const durationMs = parseDuration(durationInput);

  if (!durationMs) {
    return replyWithError(message, 'La duración no es válida. Usa formatos como `10m`, `2h` o `1d`.');
  }

  const reason = args.slice(2).join(' ').trim() || 'Sin razón especificada.';

  try {
    await target.timeout(durationMs, reason);
    return replyWithSuccess(
      message,
      [
        `Se aplicó timeout a **${target.user.tag}** por **${durationInput}**.`,
        `Razón: ${reason}`
      ].join('\n')
    );
  } catch (error) {
    console.error('Timeout command failed:', error);
    return replyWithError(message, 'No pude aplicar timeout a ese usuario.');
  }
}

module.exports = { execute };
