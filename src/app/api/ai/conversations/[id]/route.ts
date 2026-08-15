import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

// ────────────────────────────────────────────────
// GET /api/ai/conversations/:id — Load a single conversation
// ────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error } = await getAuthUser(request);
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
    if (
      conversation.userId &&
      conversation.userId !== user.id &&
      conversation.organizationId !== user.organizationId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized access to this conversation' },
        { status: 403 },
      );
    }

    let messages;
    try {
      messages = JSON.parse(conversation.messages);
    } catch {
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
    console.error('AI Conversation get error:', err);
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
  try {
    const { user, error } = await getAuthUser(request);
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
    if (
      conversation.userId &&
      conversation.userId !== user.id &&
      conversation.organizationId !== user.organizationId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized access to this conversation' },
        { status: 403 },
      );
    }

    await db.aIConversation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('AI Conversation delete error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
