const {
  fetchTargetMember,
  hasPermission,
  isValidTarget,
  replyWithError,
  replyWithSuccess
} = require('./utils');

async function execute(message, args) {
  if (!(await hasPermission(message))) return;

  const targetInput = args[0];

  if (!targetInput) {
    return replyWithError(message, 'Debes mencionar a un usuario para expulsar.');
  }

  const target = await fetchTargetMember(message, targetInput);

  if (!(await isValidTarget(message, target))) return;

  if (!target.kickable) {
    return replyWithError(message, 'No puedo expulsar a ese usuario por permisos o jerarquía.');
  }

  const reason = args.slice(1).join(' ').trim() || 'Sin razón especificada.';

  try {
    await target.kick(reason);
    return replyWithSuccess(
      message,
      [`Se expulsó a **${target.user.tag}**.`, `Razón: ${reason}`].join('\n')
    );
  } catch (error) {
    console.error('Kick command failed:', error);
    return replyWithError(message, 'No pude expulsar a ese usuario.');
  }
}

module.exports = { execute };
