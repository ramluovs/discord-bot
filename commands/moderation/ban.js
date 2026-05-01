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
    return replyWithError(message, 'Debes mencionar a un usuario para banear.');
  }

  const target = await fetchTargetMember(message, targetInput);

  if (!(await isValidTarget(message, target))) return;

  if (!target.bannable) {
    return replyWithError(message, 'No puedo banear a ese usuario por permisos o jerarquía.');
  }

  const reason = args.slice(1).join(' ').trim() || 'Sin razón especificada.';

  try {
    await target.ban({ reason });
    return replyWithSuccess(
      message,
      [`Se baneó a **${target.user.tag}**.`, `Razón: ${reason}`].join('\n')
    );
  } catch (error) {
    console.error('Ban command failed:', error);
    return replyWithError(message, 'No pude banear a ese usuario.');
  }
}

module.exports = { execute };
