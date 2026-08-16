import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const START_TIME = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime,
    version: process.env.npm_package_version || '0.1.0',
    database: dbStatus,
  });
}
