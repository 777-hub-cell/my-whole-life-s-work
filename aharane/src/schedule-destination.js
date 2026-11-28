import { GROUP_JID } from './policy.js'

const DIRECT_JID = /^\d{7,15}@s\.whatsapp\.net$/
const LID_JID = /^\d{5,25}@lid$/

/**
 * Why a command workflow cannot be scheduled to a destination, or '' when it can.
 * Pure: the current owner configuration is passed in, so the rule is unit-tested and the same
 * check runs at create/edit/enable time and again immediately before every scheduled run.
 */
export function scheduledDestinationError(workflow, destinationJid, ownerConfig = {}) {
  const jid = String(destinationJid || '').trim()
  const trigger = workflow?.nodes?.find(node => node.type === 'trigger.command')
  if (!workflow?.enabled || !trigger) return 'Schedules require an enabled saved command workflow.'
  if (trigger.config?.requireQuoted === true || trigger.config?.requireQuoted === 'true' ||
      trigger.config?.requireReply === true || trigger.config?.requireReply === 'true') {
    return 'A scheduled command cannot require a quoted or replied-to incoming message.'
  }
  const scope = String(trigger.config?.chatScope || 'direct')
  const direct = DIRECT_JID.test(jid) || LID_JID.test(jid)
  const group = GROUP_JID.test(jid)
  if (workflow.account === 'private') {
    const owner = String(ownerConfig.privateOwnerNumber || '').replace(/\D/g, '')
    if (!owner) return 'Configure the Private Owner before scheduling Private commands.'
    if (jid !== owner + '@s.whatsapp.net') return 'Private scheduled commands can only send to the configured Private Owner self-chat.'
    return ''
  }
  if (workflow.account !== 'public') return 'The selected workflow account is invalid.'
  if (direct && (scope === 'direct' || scope === 'both')) return ''
  if (group && (scope === 'groups' || scope === 'both')) return ''
  return group
    ? 'This command is not configured to run in groups.'
    : 'Choose a valid WhatsApp direct-chat or permitted group destination.'
}
