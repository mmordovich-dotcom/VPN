import type { PrismaClient } from '@shared-vps/database';
import { locked, fail, SubscriptionEngine } from './engine.js';
import { actor, operation, recordAudit, redactProviderText, draftHash, messageText } from './support.js';
import { databaseNow, enqueue } from './job-queue.js';
import { scheduleReminders } from './notification-events.js';
const components = ['WEB', 'API', 'POSTGRES', 'TELEGRAM', 'PROVIDER', 'UNKNOWN'];
export class IncidentService {
  constructor(private db: PrismaClient, private engine = new SubscriptionEngine(db)) {}
  async create(adminId: string, component: string, operationKey: string, serverId?: string) {
    if (!components.includes(component)) fail(400, 'INVALID_COMPONENT'); const key = 'incident:' + operation(operationKey);
    return locked(this.db, async tx => {
      await actor(tx, adminId, true); if (serverId && !await tx.server.count({ where: { id: serverId } })) fail(404, 'SERVER_NOT_FOUND');
      const prior = await tx.serviceIncident.findUnique({ where: { operationKey: key } }); if (prior) { if (prior.component !== component || prior.serverId !== (serverId ?? null)) fail(409, 'KEY_REUSED'); return prior; }
      const now = await databaseNow(tx); const incident = await tx.serviceIncident.create({ data: { operationKey: key, component, serverId, source: 'DEMO', startedAt: now } });
      await recordAudit(tx, adminId, 'incident.created', 'service_incident', incident.id, { component, source: 'DEMO' }); return incident;
    });
  }
  async observe(adminId: string, id: string, result: string, operationKey: string) {
    if (!['SUCCESS', 'FAILURE', 'UNKNOWN'].includes(result)) fail(400, 'INVALID_OBSERVATION'); const key = 'observation:' + operation(operationKey);
    return locked(this.db, async tx => {
      await actor(tx, adminId, true); const incident = await tx.serviceIncident.findUnique({ where: { id } }); if (!incident) fail(404, 'INCIDENT_NOT_FOUND');
      const prior = await tx.incidentObservation.findUnique({ where: { operationKey: key } }); if (prior) { if (prior.incidentId !== id || prior.result !== result) fail(409, 'KEY_REUSED'); return incident; }
      if (incident.status === 'RESOLVED') fail(409, 'INCIDENT_RESOLVED'); const now = await databaseNow(tx);
      await tx.incidentObservation.create({ data: { incidentId: id, actorId: adminId, result, operationKey: key, checkedAt: now } });
      const updated = await tx.serviceIncident.update({ where: { id }, data: { lastResult: result, lastCheckedAt: now, ...(result === 'SUCCESS' ? { lastSuccessAt: now } : {}) } });
      await recordAudit(tx, adminId, 'incident.observed', 'service_incident', id, { result, source: 'DEMO' }); return updated;
    });
  }
  async transition(adminId: string, id: string, next: 'CONFIRMED' | 'RESOLVED') {
    return locked(this.db, async tx => {
      await actor(tx, adminId, true); const incident = await tx.serviceIncident.findUnique({ where: { id } }); if (!incident) fail(404, 'INCIDENT_NOT_FOUND'); if (incident.status === next) return incident;
      const now = await databaseNow(tx);
      if (next === 'CONFIRMED') {
        if (incident.status !== 'SUSPECTED' || incident.component === 'UNKNOWN') fail(409, 'INCIDENT_UNCONFIRMED');
        const checks = await tx.incidentObservation.findMany({ where: { incidentId: id }, orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }], take: 2 });
        if (checks.length !== 2 || checks.some(c => c.result !== 'FAILURE') || checks[0]!.checkedAt.getTime() - checks[1]!.checkedAt.getTime() < 60000 || now.getTime() - checks[0]!.checkedAt.getTime() > 300000) fail(409, 'MORE_EVIDENCE_REQUIRED');
      } else if (incident.status !== 'CONFIRMED' || incident.lastResult !== 'SUCCESS' || !incident.lastCheckedAt || now.getTime() - incident.lastCheckedAt.getTime() > 300000) fail(409, 'RECOVERY_CHECK_REQUIRED');
      const updated = await tx.serviceIncident.update({ where: { id }, data: { status: next, diagnosis: next === 'CONFIRMED' ? 'SERVICE_FAILURE' : 'RECOVERED', ...(next === 'CONFIRMED' ? { confirmedAt: now } : { resolvedAt: now }) } });
      await recordAudit(tx, adminId, 'incident.' + next.toLowerCase(), 'service_incident', id, { source: 'DEMO' }); return updated;
    });
  }
  async escalate(adminId: string, incidentId: string, ticketId: string) {
    return locked(this.db, async tx => {
      await actor(tx, adminId, true); const incident = await tx.serviceIncident.findUnique({ where: { id: incidentId } });
      if (!incident || incident.component !== 'PROVIDER' || !incident.serverId || !incident.confirmedAt) fail(409, 'PROVIDER_INCIDENT_REQUIRED');
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } }); if (!ticket) fail(404, 'TICKET_NOT_FOUND');
      const related = await tx.subscription.count({ where: { userId: ticket.userId, serverSlot: { serverId: incident.serverId }, startedAt: { lte: incident.resolvedAt ?? new Date() }, OR: [{ expiresAt: { gt: incident.startedAt } }, { expiresAt: null }] } });
      if (!related || ticket.incidentId && ticket.incidentId !== incidentId) fail(409, 'INCIDENT_UNRELATED');
      const prior = await tx.providerEscalation.findUnique({ where: { ticketId_incidentId: { ticketId, incidentId } } }); if (prior) return prior;
      const draft = 'DEMO — черновик для ручной проверки. Реального запроса провайдеру нет.\nКомпонент: инфраструктура.\nНачало: ' + incident.startedAt.toISOString() + '\nПоследняя проверка: ' + (incident.lastCheckedAt?.toISOString() ?? 'нет') + '\nРезультат: ' + incident.lastResult + '\nПросьба уточнить причину недоступности и порядок восстановления. Данные клиентов и секреты исключены.';
      const escalation = await tx.providerEscalation.create({ data: { incidentId, ticketId, draft } });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { incidentId, status: 'IN_PROGRESS' } });
      await recordAudit(tx, adminId, 'provider.draft_created', 'provider_escalation', escalation.id); return escalation;
    });
  }
  async updateEscalation(adminId: string, id: string, data: { draft?: string; review?: boolean; expectedHash?: string; waiting?: boolean; providerReply?: string }) {
    return locked(this.db, async tx => {
      await actor(tx, adminId, true); const current = await tx.providerEscalation.findUnique({ where: { id } }); if (!current) fail(404, 'ESCALATION_NOT_FOUND');
      if (data.draft !== undefined) {
        const draft = redactProviderText(messageText(data.draft, 5));
        if (draft === current.draft) return current;
        const updated = await tx.providerEscalation.update({ where: { id }, data: { draft, status: 'DRAFT', reviewedHash: null, providerReply: null } });
        await recordAudit(tx, adminId, 'provider.draft_edited', 'provider_escalation', id); return updated;
      }
      const hash = draftHash(current.draft);
      if (!data.expectedHash || data.expectedHash !== hash) fail(409, 'STALE_DRAFT');
      if (data.review) {
        const updated = await tx.providerEscalation.update({ where: { id }, data: { reviewedHash: hash, status: 'REVIEWED' } });
        await recordAudit(tx, adminId, 'provider.draft_reviewed', 'provider_escalation', id); return updated;
      }
      if (current.reviewedHash !== hash || current.status === 'DRAFT') fail(409, 'DRAFT_REVIEW_REQUIRED');
      if (data.waiting) {
        if (!['REVIEWED', 'WAITING_PROVIDER'].includes(current.status)) fail(409, 'INVALID_ESCALATION_STATE');
        await tx.supportTicket.update({ where: { id: current.ticketId }, data: { status: 'WAITING_PROVIDER' } });
        const updated = await tx.providerEscalation.update({ where: { id }, data: { status: 'WAITING_PROVIDER' } });
        await recordAudit(tx, adminId, 'provider.manual_wait_recorded', 'provider_escalation', id, { demo: true }); return updated;
      }
      if (data.providerReply !== undefined && current.status === 'WAITING_PROVIDER') {
        const providerReply = redactProviderText(messageText(data.providerReply));
        const updated = await tx.providerEscalation.update({ where: { id }, data: { status: 'REPLY_RECORDED', providerReply } });
        await tx.supportTicket.update({ where: { id: current.ticketId }, data: { status: 'IN_PROGRESS' } });
        await recordAudit(tx, adminId, 'provider.reply_recorded', 'provider_escalation', id); return updated;
      }
      fail(400, 'INVALID_ESCALATION_STATE');
    });
  }
  async compensate(adminId: string, incidentId: string, subscriptionId: string, hours: number, reasonInput: string, operationKey: string) {
    const reason = reasonInput.trim(); if (!Number.isInteger(hours) || hours < 1 || hours > 168 || reason.length < 5 || reason.length > 500) fail(400, 'INVALID_COMPENSATION'); const key = 'compensation:' + operation(operationKey);
    return locked(this.db, async tx => {
      await actor(tx, adminId, true);
      const prior = await tx.subscriptionCompensation.findFirst({ where: { OR: [{ operationKey: key }, { incidentId, subscriptionId }] } });
      if (prior) { if (prior.incidentId !== incidentId || prior.subscriptionId !== subscriptionId || prior.hours !== hours || prior.reason !== reason) fail(409, 'COMPENSATION_ALREADY_GRANTED'); return prior; }
      const incident = await tx.serviceIncident.findUnique({ where: { id: incidentId } });
      if (!incident || incident.source !== 'DEMO' || incident.component !== 'PROVIDER' || incident.status !== 'RESOLVED' || !incident.confirmedAt || !incident.resolvedAt || !incident.serverId) fail(409, 'RESOLVED_PROVIDER_INCIDENT_REQUIRED');
      const now = await databaseNow(tx); const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { serverSlot: true } });
      if (!sub || sub.status !== 'ACTIVE' || !sub.expiresAt || sub.expiresAt <= now || !sub.startedAt || sub.startedAt >= incident.resolvedAt || sub.serverSlot?.serverId !== incident.serverId) fail(409, 'SUBSCRIPTION_NOT_AFFECTED');
      const start = new Date(Math.max(sub.startedAt.getTime(), incident.startedAt.getTime())); const end = incident.resolvedAt;
      const maxHours = Math.ceil((end.getTime() - start.getTime()) / 3600000); if (maxHours < 1 || hours > maxHours) fail(409, 'COMPENSATION_EXCEEDS_OUTAGE');
      const overlapping = await tx.subscriptionCompensation.count({ where: { subscriptionId, windowStart: { lt: end }, windowEnd: { gt: start } } }); if (overlapping) fail(409, 'COMPENSATION_OVERLAP');
      const recent = await tx.subscriptionCompensation.aggregate({ where: { subscriptionId, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, _sum: { hours: true } }); if ((recent._sum.hours ?? 0) + hours > 168) fail(409, 'COMPENSATION_LIMIT');
      const expiry = new Date(sub.expiresAt.getTime() + hours * 3600000);
      const ledger = await tx.subscriptionCompensation.create({ data: { incidentId, subscriptionId, actorId: adminId, operationKey: key, hours, reason, previousExpiry: sub.expiresAt, newExpiry: expiry, windowStart: start, windowEnd: end } });
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { expiresAt: expiry } });
      await this.engine.extendServer(tx, sub.serverSlotId!, expiry); await scheduleReminders(tx, updated);
      await enqueue(tx, 'NOTIFY', 'compensation:' + ledger.id, { event: 'COMPENSATION', userId: sub.userId, compensationId: ledger.id });
      await recordAudit(tx, adminId, 'subscription.compensated', 'subscription', sub.id, { compensationId: ledger.id, hours, incidentId }); return ledger;
    });
  }
  async alertLongIncidents() {
    return locked(this.db, async tx => {
      const now = await databaseNow(tx); const incidents = await tx.serviceIncident.findMany({ where: { status: 'CONFIRMED', confirmedAt: { lte: new Date(now.getTime() - 900000) } }, orderBy: { startedAt: 'asc' }, take: 100 });
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, orderBy: { id: 'asc' }, take: 100 });
      for (const incident of incidents) for (const admin of admins) await enqueue(tx, 'NOTIFY', 'incident-alert:' + incident.id + ':' + admin.id, { event: 'INCIDENT_ALERT', userId: admin.id, incidentId: incident.id });
    });
  }
}
