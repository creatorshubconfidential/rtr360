# Realtime Production Review — P2-15

## Problem

The /api/realtime/events and /api/realtime/vehicles endpoints use Server-Sent Events (SSE) with `ReadableStream`. On Vercel serverless, the maximum function duration is 300 seconds (Pro plan) or 10 seconds (Hobby). The SSE connections stayed open indefinitely, causing 222 timeout errors.

## Architecture

Both endpoints:
1. Authenticate via `requireAuth()` (session cookie)
2. Query the database for initial data
3. Open a `ReadableStream` with SSE format
4. Poll database or generate simulated events on intervals (3-15 seconds)
5. Send events to the client
6. Keep connection open until client disconnects

This is a polling-based simulation architecture, NOT a true realtime system.

## Root Cause

Vercel serverless functions have a hard timeout. An SSE connection that stays open for >300s is killed by the platform, resulting in a 500 error. The client receives no `close` event, making error recovery difficult.

## Fix Applied

Added a 55-second maximum connection duration to both endpoints. After 55 seconds, the server sends a `close` event and terminates the stream. SSE clients should reconnect automatically upon receiving this event.

This is well within Vercel's 300s limit and provides consistent behavior.

## Production Recommendation

For a true realtime experience, consider:
1. **Supabase Realtime** — WebSocket-based, separate from serverless functions
2. **Short polling** — Client polls REST endpoints every 10-30 seconds
3. **Edge Runtime** — Vercel Edge Functions have different timeout characteristics

The current simulated data approach is suitable for demo/development but should be replaced with actual device data feeds in production.
