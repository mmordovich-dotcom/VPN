import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@shared-vps/database';
import { supportCategories, supportStatuses, type SupportCategory, type SupportStatus } from '@shared-vps/shared';
import { fail, locked } from './engine.js';
import { enqueue } from './job-queue.js';
type Tx = Prisma.TransactionClient;
export function operation(value: string) { if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(value)) fail(400, 'INVALID_OPERATION_KEY'); return value; }
export function messageText(value: string, minimum = 1) { const text = value.trim(); if (text.length < minimum || text.length > 4000) fail(400, 'INVALID_MESSAGE'); return text; }
export async function actor(tx: Tx, userId: string, admin = false) { const user = await tx.user.findUnique({ where: { id: userId } }); if (!user || user.status !== 'ACTIVE') fail(401, 'LOGIN_REQUIRED'); if (admin && user.role !== 'ADMIN') fail(403, 'ADMIN_REQUIRED'); return user; }
export async function recordAudit(tx: Tx, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}) { await tx.auditLog.create({ data: { actorUserId, action, entityType, entityId, metadata } }); }
export const ticketView = (t: { id: string; number: number; text: string; category: string; status: string; createdAt: Date; updatedAt: Date }) => ({ id: t.id, number: t.number, text: t.text, category: t.category, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt });
export class SupportService {
  constructor(private db: PrismaClient) {}
  async create(userId: string, textInput: string, category: SupportCategory, operationKey: string) {
    const text = messageText(textInput, 5); if (!(category in supportCategories)) fail(400, 'INVALID_CATEGORY');
    const key = 'support:' + userId + ':' + operation(operationKey);
    return locked(this.db, async tx => {
      await actor(tx, userId); const prior = await tx.supportTicket.findUnique({ where: { operationKey: key } });
      if (prior) { if (prior.userId !== userId || prior.text !== text || prior.category !== category) fail(409, 'KEY_REUSED'); return ticketView(prior); }
      const ticket = await tx.supportTicket.create({ data: { userId, text, category, operationKey: key } });
      await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: userId, authorRole: 'USER', text, operationKey: key } });
      await recordAudit(tx, userId, 'support.created', 'support_ticket', ticket.id, { category }); return ticketView(ticket);
    });
  }
  async thread(userId: string, ticketId: string, cursor?: string, admin = false, limit = 30) {
    if(![5,30].includes(limit))fail(400,'INVALID_PAGE');
    return this.db.$transaction(async tx => {
      await actor(tx, userId, admin); const ticket = await tx.supportTicket.findFirst({ where: { id: ticketId, ...(admin ? {} : { userId }) } }); if (!ticket) fail(404, 'TICKET_NOT_FOUND');
      let anchor: { id: string; createdAt: Date } | null = null;
      if (cursor) { if (!/^[0-9a-f-]{36}$/i.test(cursor)) fail(400, 'INVALID_CURSOR'); anchor = await tx.supportMessage.findFirst({ where: { id: cursor, ticketId } }); if (!anchor) fail(400, 'INVALID_CURSOR'); }
      const rows = await tx.supportMessage.findMany({ where: { ticketId, ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, select: { id: true, authorRole: true, text: true, createdAt: true } });
      return { ticket: ticketView(ticket), ...(admin ? { userId: ticket.userId, incidentId: ticket.incidentId } : {}), messages: rows.slice(0, limit).reverse(), nextCursor: rows.length > limit ? rows[limit-1]!.id : null };
    });
  }
  async reply(userId: string, ticketId: string, textInput: string, operationKey: string, admin = false) {
    const text = messageText(textInput); const key = 'reply:' + userId + ':' + operation(operationKey);
    return locked(this.db, async tx => {
      await actor(tx, userId, admin); const ticket = await tx.supportTicket.findFirst({ where: { id: ticketId, ...(admin ? {} : { userId }) } }); if (!ticket) fail(404, 'TICKET_NOT_FOUND');
      const prior = await tx.supportMessage.findUnique({ where: { operationKey: key } }); if (prior) { if (prior.ticketId !== ticketId || prior.text !== text || prior.authorRole !== (admin ? 'ADMIN' : 'USER')) fail(409, 'KEY_REUSED'); return { id: prior.id }; }
      if (ticket.status === 'CLOSED') fail(409, 'TICKET_CLOSED');
      const message = await tx.supportMessage.create({ data: { ticketId, authorId: userId, authorRole: admin ? 'ADMIN' : 'USER', text, operationKey: key } });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: admin ? 'WAITING_USER' : 'WAITING_ADMIN', updatedAt: new Date() } });
      await recordAudit(tx, userId, admin ? 'support.admin_replied' : 'support.user_replied', 'support_ticket', ticketId, { messageId: message.id });
      if (admin) await enqueue(tx, 'NOTIFY', 'support:' + message.id, { event: 'SUPPORT_REPLY', userId: ticket.userId, messageId: message.id });
      return { id: message.id };
    });
  }
  async status(userId: string, ticketId: string, status: SupportStatus, expectedStatus?: string, admin = false) {
    if (!(status in supportStatuses)) fail(400, 'INVALID_STATUS'); if (!admin && status !== 'CLOSED') fail(403, 'ADMIN_REQUIRED');
    return locked(this.db, async tx => {
      await actor(tx, userId, admin); const ticket = await tx.supportTicket.findFirst({ where: { id: ticketId, ...(admin ? {} : { userId }) } }); if (!ticket) fail(404, 'TICKET_NOT_FOUND');
      if (ticket.status === status) return ticketView(ticket); if (expectedStatus && ticket.status !== expectedStatus) fail(409, 'STALE_TICKET');
      const updated = await tx.supportTicket.update({ where: { id: ticketId }, data: { status } });
      await recordAudit(tx, userId, 'support.status_changed', 'support_ticket', ticketId, { from: ticket.status, to: status }); return ticketView(updated);
    });
  }
}
// Provider drafts never include user messages. Redaction is a second line of defence;
// a human must still review the complete draft and use an official channel manually.
export function redactProviderText(value: string) {
  return value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DB URL удалён]').replace(/\b\d{5,}:[A-Za-z0-9_-]{15,}\b/g, '[токен удалён]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[токен удалён]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email удалён]').replace(/(?:\+?\d[\d ()-]{9,}\d)/g, '[телефон удалён]')
    .replace(/(?:password|passwd|secret|token|пароль|токен)\s*[:=]\s*[^\s,;]+/gi, '[секрет удалён]');
}
export const draftHash = (text: string) => createHash('sha256').update(text).digest('hex');
