import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

// ────────────────────────────────────────────────
// GET /api/ai/conversations/:id — Load a single conversation
// ────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const conversation = await db.aIConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    }

    // Verify ownership
    if (user.role !== 'super_admin' && conversation.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 },
      );
    }

    // messages is now Json type — handle both string (legacy) and array/object formats
    const rawMessages = conversation.messages;
    let messages;
    if (Array.isArray(rawMessages)) {
      messages = rawMessages;
    } else if (typeof rawMessages === 'string') {
      try {
        messages = JSON.parse(rawMessages);
      } catch {
        messages = [];
      }
    } else if (rawMessages && typeof rawMessages === 'object') {
      messages = rawMessages;
    } else {
      messages = [];
    }

    return NextResponse.json({
      id: conversation.id,
      type: conversation.type,
      messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  } catch (err) {
    logger.error('AI Conversation get error', { err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────
// DELETE /api/ai/conversations/:id — Delete a conversation
// ────────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
    const rl = await checkRateLimit(request, 'analytics');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;

    const conversation = await db.aIConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    }

    // Verify ownership
    if (user.role !== 'super_admin' && conversation.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 },
      );
    }

    await db.aIConversation.delete({
      where: { id },
    });
        await logAudit({ user, action: 'delete', entity: 'AIConversation', entityId: id, ipAddress: getClientIp(request) });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('AI Conversation delete error', { err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
