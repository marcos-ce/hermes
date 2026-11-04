/**
 * Registro e Despacho Modular das 25 Ferramentas de IA (Tool Calling)
 */

const toolHandlers = new Map([
  ['ban_member', require('./ban_member')],
  ['set_group_mute', require('./set_group_mute')],
  ['set_group_schedule', require('./set_group_schedule')],
  ['toggle_group_protection', require('./toggle_group_protection')],
  ['set_group_settings', require('./set_group_settings')],
  ['set_automsg_media', require('./set_automsg_media')],
  ['warn_member', require('./warn_member')],
  ['unwarn_member', require('./unwarn_member')],
  ['mute_member', require('./mute_member')],
  ['unmute_member', require('./unmute_member')],
  ['manage_blacklist', require('./manage_blacklist')],
  ['delete_message', require('./delete_message')],
  ['promote_member', require('./promote_member')],
  ['demote_member', require('./demote_member')],
  ['manage_calendar', require('./manage_calendar')],
  ['raffle_members', require('./raffle_members')],
  ['set_group_description', require('./set_group_description')],
  ['set_group_picture', require('./set_group_picture')],
  ['pin_group_message', require('./pin_group_message')],
  ['get_group_invite_link', require('./get_group_invite_link')],
  ['create_group_poll', require('./create_group_poll')],
  ['get_poll_results', require('./get_poll_results')],
  ['learn_group_fact', require('./learn_group_fact')],
  ['forget_group_fact', require('./forget_group_fact')],
  ['manage_join_requests', require('./manage_join_requests')],
  ['set_group_milestone', require('./set_group_milestone')],
  ['get_group_info', require('./get_group_info')]
]);

module.exports = toolHandlers;
