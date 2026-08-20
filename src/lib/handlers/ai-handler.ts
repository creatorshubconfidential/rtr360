/**
 * RTR 360 — AI Job Handler
 *
 * Processes AI tasks in the background.
 * Uses the existing OpenAI integration pattern from the chat route.
 * All data access is tenant-scoped.
 *
 * Supported tasks (static allowlist):
 *   - fleet_summary: Generate a fleet summary analysis
 *   - driver_analysis: Batch driver performance analysis
 *
 * Reuses the existing OpenAI API pattern (direct fetch).
 * No cross-tenant context, no arbitrary tool execution.
 */

import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import type { ClaimedJob } from '@/lib/queue';
import { ValidationError } from '@/lib/errors';
import { metrics, METRIC_NAMES } from '@/lib/metrics';

// ── Allowed AI Tasks (static allowlist) ────────────────────────

const ALLOWED_AI_TASKS = new Set([
  'fleet_summary',
  'driver_analysis',
]) as ReadonlySet<string>;

// ── Configuration ──────────────────────────────────────────────

const AI_TIMEOUT_MS = 60_000;
const AI_MAX_TOKENS = 2048;
const AI_MODEL = 'gpt-4o-mini';

// ── Types ────────────────────────────────────────────────────────

interface AiResult {
  task: string;
  generatedAt: string;
  response: string;
  model: string;
  tokensUsed?: number;
}

// ── OpenAI Client ────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    throw new Error('[PERMANENT] OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: AI_MAX_TOKENS,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`[PERMANENT] OpenAI authentication failed (HTTP ${response.status})`);
    }

    if (response.status === 429) {
      throw new Error('[TRANSIENT] OpenAI rate limit exceeded');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => 'unreadable');
      throw new Error(`[TRANSIENT] OpenAI API error (HTTP ${response.status}): ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const tokensUsed: number = data.usage?.total_tokens ?? 0;

    return { content, tokensUsed };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`[TRANSIENT] AI request timed out after ${AI_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Fleet Data Builder (tenant-scoped) ────────────────────────

async function buildTenantFleetContext(organizationId: string) {
  const orgFilter = { organizationId };

  const [vehicleCount, activeVehicles, maintenanceVehicles, driverCount] =
    await Promise.all([
      db.vehicle.count({ where: orgFilter }),
      db.vehicle.count({ where: { ...orgFilter, status: 'active' } }),
      db.vehicle.count({ where: { ...orgFilter, status: 'maintenance' } }),
      db.driver.count({ where: orgFilter }),
    ]);

  const vehiclesByType = await db.vehicle.groupBy({
    by: ['vehicleType'], where: orgFilter, _count: { vehicleType: true },
  });

  return {
    vehicleCount,
    activeVehicles,
    maintenanceVehicles,
    driverCount,
    vehicleTypeBreakdown: vehiclesByType.map(v => ({
      type: v.vehicleType ?? 'Unknown',
      count: v._count.vehicleType,
    })),
  };
}

// ── Task Implementations ────────────────────────────────────────

async function fleetSummary(organizationId: string): Promise<string> {
  const ctx = await buildTenantFleetContext(organizationId);

  const systemPrompt = `You are RTR360 AI Assistant. Generate a concise fleet summary. Use AED for currency, km for distance. Be factual and data-driven.`;

  const userMessage = `Generate a fleet summary with these stats:
- Total vehicles: ${ctx.vehicleCount} (${ctx.activeVehicles} active, ${ctx.maintenanceVehicles} in maintenance)
- Total drivers: ${ctx.driverCount}
- Vehicle types: ${ctx.vehicleTypeBreakdown.map(v => `${v.type}: ${v.count}`).join(', ')}`;

  const { content } = await callOpenAI(systemPrompt, userMessage);
  return content;
}

async function driverAnalysis(organizationId: string): Promise<string> {
  const drivers = await db.driver.findMany({
    where: { organizationId },
    select: { name: true, score: true, totalTrips: true, totalDistance: true, totalViolations: true },
    orderBy: { score: 'desc' },
    take: 20,
  });

  const driverList = drivers.map((d, i) =>
    `${i + 1}. ${d.name} — Score: ${d.score ?? 0}, Trips: ${d.totalTrips ?? 0}, Distance: ${d.totalDistance ?? 0}km, Violations: ${d.totalViolations ?? 0}`
  ).join('\n');

  const systemPrompt = `You are RTR360 AI Assistant. Analyze driver performance data. Provide actionable insights. Use km for distance.`;
  const userMessage = `Analyze these drivers:\n${driverList}`;

  const { content } = await callOpenAI(systemPrompt, userMessage);
  return content;
}

const TASK_IMPLEMENTATIONS: Record<string, (orgId: string) => Promise<string>> = {
  fleet_summary: fleetSummary,
  driver_analysis: driverAnalysis,
};

// ── Handler ──────────────────────────────────────────────────────

export async function handleAiJob(job: ClaimedJob): Promise<AiResult> {
  // Tenant boundary: AI jobs MUST have an organizationId
  if (!job.organizationId) {
    throw new ValidationError('AI jobs require an organizationId', [
      { field: 'organizationId', message: 'Tenant-scoped job missing organizationId' },
    ]);
  }

  const payload = job.payload as Record<string, unknown>;
  const task = String(payload.task ?? '');
  const input = payload.input as Record<string, unknown> | undefined;

  // Validate task
  if (!task || !ALLOWED_AI_TASKS.has(task)) {
    throw new ValidationError(`Unknown or disallowed AI task: '${task}'`, [
      { field: 'task', message: `Must be one of: ${Array.from(ALLOWED_AI_TASKS).join(', ')}` },
    ]);
  }

  // Reject if input contains suspicious patterns (no arbitrary tool execution)
  if (input) {
    const inputStr = JSON.stringify(input).toLowerCase();
    const forbidden = ['eval', 'function(', 'new function', 'require(', 'import(', 'process.env', 'child_process'];
    for (const pattern of forbidden) {
      if (inputStr.includes(pattern)) {
        logger.security('ai.suspicious_input_blocked', {
          jobId: job.id,
          task,
          organizationId: job.organizationId,
          pattern,
          requestId: job.requestId,
        });
        throw new ValidationError(`Suspicious input pattern detected`, [
          { field: 'input', message: 'Input contains forbidden patterns' },
        ]);
      }
    }
  }

  const impl = TASK_IMPLEMENTATIONS[task];
  if (!impl) {
    throw new Error(`Implementation missing for AI task: '${task}'`);
  }

  const startTime = Date.now();

  logger.info('ai.task_started', {
    jobId: job.id,
    task,
    organizationId: job.organizationId,
    requestId: job.requestId,
  });

  try {
    const response = await impl(job.organizationId);
    const durationMs = Date.now() - startTime;

    logger.info('ai.task_completed', {
      jobId: job.id,
      task,
      organizationId: job.organizationId,
      durationMs,
      requestId: job.requestId,
    });

    try {
      metrics.increment(METRIC_NAMES.AI_SUCCESS, { task, organizationId: job.organizationId });
      metrics.timing(METRIC_NAMES.AI_DURATION_MS, durationMs, { task, organizationId: job.organizationId });
    } catch { /* metrics must never break business logic */ }

    return {
      task,
      generatedAt: new Date().toISOString(),
      response,
      model: AI_MODEL,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isPermanent = error instanceof Error && error.message.includes('[PERMANENT]');

    logger.error('ai.task_failed', {
      jobId: job.id,
      task,
      organizationId: job.organizationId,
      durationMs,
      permanent: isPermanent,
      requestId: job.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      metrics.increment(METRIC_NAMES.AI_FAILURE, { task, organizationId: job.organizationId });
    } catch { /* metrics must never break business logic */ }

    throw error;
  }
}
