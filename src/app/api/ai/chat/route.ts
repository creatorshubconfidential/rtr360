import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, AI_USE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ────────────────────────────────────────────────
// Fleet data context builder
// ────────────────────────────────────────────────
async function buildFleetContext(organizationId: string | null) {
  const orgFilter: { organizationId?: string } = organizationId
    ? { organizationId }
    : {};

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    vehicleCount,
    activeVehicles,
    inactiveVehicles,
    maintenanceVehicles,
    driverCount,
    openAlertsCount,
    openMaintenanceCount,
    todayTrips,
    todayTripsWithDistance,
    topDrivers,
    recentAlerts,
    upcomingMaintenance,
    vehicleTypeBreakdown,
  ] = await Promise.all([
    db.vehicle.count({ where: orgFilter }),
    db.vehicle.count({ where: { ...orgFilter, status: 'active' } }),
    db.vehicle.count({ where: { ...orgFilter, status: 'inactive' } }),
    db.vehicle.count({ where: { ...orgFilter, status: 'maintenance' } }),
    db.driver.count({ where: orgFilter }),
    db.alert.count({ where: { ...orgFilter, status: 'open' } }),
    db.maintenanceRecord.count({
      where: { ...orgFilter, status: { in: ['upcoming', 'overdue', 'in_progress'] } },
    }),
    db.trip.count({
      where: {
        vehicle: orgFilter ? { organizationId: orgFilter.organizationId } : undefined,
        startTime: { gte: todayStart, lte: todayEnd },
      },
    }),
    db.trip.aggregate({
      _sum: { distance: true, duration: true },
      where: {
        vehicle: orgFilter ? { organizationId: orgFilter.organizationId } : undefined,
        startTime: { gte: todayStart, lte: todayEnd },
      },
    }),
    db.driver.findMany({
      where: orgFilter,
      orderBy: { score: 'desc' },
      take: 5,
      select: { name: true, score: true, totalTrips: true, totalDistance: true, totalViolations: true, status: true },
    }),
    db.alert.findMany({
      where: { ...orgFilter, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { type: true, severity: true, vehiclePlate: true, driverName: true, message: true, createdAt: true },
    }),
    db.maintenanceRecord.findMany({
      where: { ...orgFilter, status: { in: ['upcoming', 'overdue'] } },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
      include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
    }),
    db.vehicle.groupBy({
      by: ['vehicleType'],
      where: orgFilter,
      _count: { vehicleType: true },
    }),
  ]);

  const totalDistanceToday = todayTripsWithDistance._sum?.distance ?? 0;
  const totalDurationToday = todayTripsWithDistance._sum?.duration ?? 0;

  // Total mileage across all vehicles
  const totalMileageResult = await db.vehicle.aggregate({
    _sum: { mileage: true },
    where: orgFilter,
  });
  const totalMileage = totalMileageResult._sum.mileage ?? 0;

  return {
    vehicleCount,
    activeVehicles,
    inactiveVehicles,
    maintenanceVehicles,
    driverCount,
    openAlertsCount,
    openMaintenanceCount,
    todayTrips,
    totalDistanceToday: Math.round(totalDistanceToday),
    totalDurationToday,
    totalMileage: Math.round(totalMileage),
    topDrivers,
    recentAlerts,
    upcomingMaintenance,
    vehicleTypeBreakdown: vehicleTypeBreakdown.map((v) => ({
      type: v.vehicleType ?? 'Unspecified',
      count: v._count.vehicleType,
    })),
  };
}

// ────────────────────────────────────────────────
// Smart mock AI response generator
// ────────────────────────────────────────────────
function generateAIResponse(
  userMessage: string,
  ctx: Awaited<ReturnType<typeof buildFleetContext>>,
): string {
  const msg = userMessage.toLowerCase();

  // ── Vehicle queries ──
  if (/how many (vehicles?|cars?|trucks?|fleet)/i.test(msg) || /vehicle count|fleet size|total vehicles/i.test(msg)) {
    const typeLines = ctx.vehicleTypeBreakdown
      .sort((a, b) => b.count - a.count)
      .map((v) => `  - **${v.type}**: ${v.count}`)
      .join('\n');

    return `## 🚛 Fleet Overview

Your fleet currently has **${ctx.vehicleCount} vehicles** registered:

| Status | Count |
|--------|-------|
| ✅ Active | ${ctx.activeVehicles} |
| 🔧 In Maintenance | ${ctx.maintenanceVehicles} |
| ⏸️ Inactive | ${ctx.inactiveVehicles} |

### Breakdown by Type
${typeLines || '  - No type data available'}

**Total fleet mileage**: ${ctx.totalMileage.toLocaleString()} km

> 💡 **Tip**: You have ${ctx.inactiveVehicles} inactive vehicle${ctx.inactiveVehicles !== 1 ? 's' : ''}. Consider reviewing whether they should be reactivated or decommissioned to optimize costs.`;
  }

  // ── Alerts queries ──
  if (/alert|warning|notification/i.test(msg)) {
    if (ctx.recentAlerts.length === 0) {
      return `## ✅ No Open Alerts

Great news! Your fleet currently has **0 open alerts**. All systems are running smoothly.

> Keep monitoring through the Alerts dashboard for real-time notifications on geofence breaches, overspeeding, and device issues.`;
    }

    const severityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const a of ctx.recentAlerts) {
      severityCounts[a.severity] = (severityCounts[a.severity] || 0) + 1;
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    }

    const severityLines = Object.entries(severityCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([s, c]) => {
        const icon = s === 'critical' ? '🔴' : s === 'high' ? '🟠' : s === 'medium' ? '🟡' : '🟢';
        return `  - ${icon} **${s}**: ${c}`;
      })
      .join('\n');

    const typeLines = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([t, c]) => `  - **${t}**: ${c}`)
      .join('\n');

    const alertList = ctx.recentAlerts
      .slice(0, 5)
      .map(
        (a, i) =>
          `${i + 1}. **${a.type}** (${a.severity}) — ${a.vehiclePlate ?? 'Unknown vehicle'}${a.driverName ? ` / ${a.driverName}` : ''}: ${a.message}`,
      )
      .join('\n');

    return `## 🚨 Alert Summary

You have **${ctx.openAlertsCount} open alert${ctx.openAlertsCount !== 1 ? 's' : ''}** across your fleet.

### By Severity
${severityLines}

### By Type
${typeLines}

### Recent Alerts (Latest 5)
${alertList}

> ⚠️ **Recommendation**: Address **critical** and **high** severity alerts first to maintain safety compliance. Regularly review alert rules in Settings to fine-tune thresholds for your UAE operations.`;
  }

  // ── Driver performance queries ──
  if (/driver|performance|score|ranking|best driver|top driver/i.test(msg)) {
    if (ctx.topDrivers.length === 0) {
      return `## 👥 Driver Overview

You have **${ctx.driverCount} drivers** registered, but no performance data is available yet.

> Drivers will appear in rankings once they start completing trips. The scoring system considers speed compliance, trip efficiency, and violation history.`;
    }

    const driverLines = ctx.topDrivers
      .map(
        (d, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          return `${medal} **${d.name}** — Score: ${d.score}/100 | Trips: ${d.totalTrips} | Dist: ${Math.round(d.totalDistance ?? 0).toLocaleString()} km | Violations: ${d.totalViolations}`;
        },
      )
      .join('\n');

    const avgScore = Math.round(ctx.topDrivers.reduce((s, d) => s + d.score, 0) / ctx.topDrivers.length);

    return `## 👥 Driver Performance Rankings

**${ctx.driverCount} drivers** registered | Average top-5 score: **${avgScore}/100**

${driverLines}

---

### Scoring Criteria (UAE Standards)
| Factor | Weight |
|--------|--------|
| Speed compliance | 30% |
| Trip efficiency | 25% |
| Idle time ratio | 20% |
| Harsh braking/acceleration | 15% |
| License compliance | 10% |

> 💡 **Tip**: Drivers scoring below 70 may need retraining. Consider scheduling refresher sessions on UAE traffic regulations and eco-driving techniques to reduce fuel costs.`;
  }

  // ── Maintenance queries ──
  if (/maintenance|service|repair|oil change|tires?|brake|inspection/i.test(msg)) {
    if (ctx.upcomingMaintenance.length === 0 && ctx.openMaintenanceCount === 0) {
      return `## 🔧 Maintenance Status

All clear! No upcoming or pending maintenance records.

> Set up preventive maintenance schedules based on mileage or time intervals to avoid unexpected breakdowns. UAE's extreme temperatures make regular cooling system checks especially important.`;
    }

    const maintList = ctx.upcomingMaintenance
      .slice(0, 7)
      .map((m, i) => {
        const plate = m.vehicle.plateNumber;
        const vehicle = m.vehicle.make && m.vehicle.model ? `${m.vehicle.make} ${m.vehicle.model}` : 'Unknown';
        const date = m.scheduledDate ? new Date(m.scheduledDate).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai' }) : 'Not scheduled';
        const statusIcon = m.status === 'overdue' ? '🔴' : m.status === 'in_progress' ? '🟡' : '🟢';
        return `${i + 1}. ${statusIcon} **${plate}** (${vehicle}) — ${m.type}${m.description ? `: ${m.description}` : ''} — Due: ${date}`;
      })
      .join('\n');

    return `## 🔧 Maintenance Overview

**${ctx.openMaintenanceCount} pending maintenance task${ctx.openMaintenanceCount !== 1 ? 's' : ''}** | ${ctx.maintenanceVehicles} vehicle${ctx.maintenanceVehicles !== 1 ? 's' : ''} currently in maintenance

### Upcoming / Overdue
${maintList || 'No scheduled maintenance found.'}

---

### UAE Maintenance Best Practices
- **Cooling system**: Inspect every 20,000 km — critical in UAE's 50°C+ summers
- **Tire rotation**: Every 10,000 km; replace every 40,000–60,000 km
- **Oil change**: Every 7,500–10,000 km for standard, 15,000 km for synthetic
- **Brake inspection**: Every 20,000 km
- **AC service**: Every 6 months (essential for year-round comfort)

> ⚠️ **Action needed**: Ensure overdue maintenance is addressed immediately to maintain RTA compliance and avoid penalties.`;
  }

  // ── Trip queries ──
  if (/trip|journey|route|distance|travel|km|kilometer/i.test(msg)) {
    const avgDist = ctx.todayTrips > 0 ? Math.round(ctx.totalDistanceToday / ctx.todayTrips) : 0;
    const avgDuration = ctx.todayTrips > 0 ? Math.round((ctx.totalDurationToday ?? 0) / ctx.todayTrips / 60) : 0;

    return `## 📊 Today's Trip Summary

| Metric | Value |
|--------|-------|
| Total trips | ${ctx.todayTrips} |
| Total distance | ${ctx.totalDistanceToday.toLocaleString()} km |
| Avg. distance/trip | ${avgDist.toLocaleString()} km |
| Avg. duration/trip | ${avgDuration} min |
| Active vehicles | ${ctx.activeVehicles} of ${ctx.vehicleCount} |

### Fleet Utilization
${ctx.vehicleCount > 0
  ? `Your fleet utilization rate today is **${Math.round((ctx.todayTrips / ctx.vehicleCount) * 100)}%** (trips per vehicle).`
  : 'No vehicles registered yet.'
}

**Cumulative mileage**: ${ctx.totalMileage.toLocaleString()} km across all vehicles

> 💡 **Tip**: Aim for 85%+ daily utilization. If utilization is low, review route planning and dispatch schedules. UAE peak traffic hours (7–9 AM, 5–8 PM) can significantly impact trip times.`;
  }

  // ── Dashboard / summary / overview / status ──
  if (/dashboard|summary|overview|status|how.*(doing|going)|quick (look|summary)|fleet (status|health)/i.test(msg)) {
    const utilization = ctx.vehicleCount > 0 ? Math.round((ctx.activeVehicles / ctx.vehicleCount) * 100) : 0;
    const healthStatus = ctx.openAlertsCount === 0 && ctx.openMaintenanceCount === 0
      ? '🟢 Excellent'
      : ctx.openAlertsCount <= 3 && ctx.openMaintenanceCount <= 2
        ? '🟡 Good'
        : '🔴 Needs Attention';

    return `## 📋 Fleet Dashboard Summary

${healthStatus} — **${new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Dubai' })}**

| Metric | Value |
|--------|-------|
| 🚛 Total Vehicles | ${ctx.vehicleCount} |
| ✅ Active | ${ctx.activeVehicles} (${utilization}%) |
| 👥 Drivers | ${ctx.driverCount} |
| 🛣️ Today's Trips | ${ctx.todayTrips} |
| 📏 Distance Today | ${ctx.totalDistanceToday.toLocaleString()} km |
| 🚨 Open Alerts | ${ctx.openAlertsCount} |
| 🔧 Pending Maintenance | ${ctx.openMaintenanceCount} |

### Key Highlights
${ctx.openAlertsCount > 0 ? `- ⚠️ ${ctx.openAlertsCount} unresolved alert${ctx.openAlertsCount !== 1 ? 's' : ''} require${ctx.openAlertsCount === 1 ? 's' : ''} attention` : '- ✅ No unresolved alerts'}
${ctx.maintenanceVehicles > 0 ? `- 🔧 ${ctx.maintenanceVehicles} vehicle${ctx.maintenanceVehicles !== 1 ? 's' : ''} in maintenance` : '- ✅ All vehicles operational'}
${ctx.todayTrips > 0 ? `- 📊 ${ctx.todayTrips} trips completed today covering ${ctx.totalDistanceToday.toLocaleString()} km` : '- 📊 No trips recorded today yet'}

> Ask me about **vehicles**, **drivers**, **alerts**, **maintenance**, or **trips** for detailed breakdowns.`;
  }

  // ── Fuel / cost queries ──
  if (/fuel|cost|expense|budget|savings|money|aed|price/i.test(msg)) {
    return `## ⛽ Fuel & Cost Insights

While detailed fuel tracking requires integration with fuel card providers, here are actionable recommendations for UAE fleet operations:

### Estimated Fuel Costs
Based on your fleet of **${ctx.vehicleCount} vehicles** and today's **${ctx.totalDistanceToday.toLocaleString()} km** traveled:

| Vehicle Type | Est. Fuel Cost/100km (AED) | Est. Daily Cost (AED) |
|-------------|---------------------------|----------------------|
| Sedan | 25–35 | ${Math.round(ctx.totalDistanceToday * 0.3).toLocaleString()} |
| SUV | 35–50 | ${Math.round(ctx.totalDistanceToday * 0.425).toLocaleString()} |
| Light Truck | 45–65 | ${Math.round(ctx.totalDistanceToday * 0.55).toLocaleString()} |
| Heavy Truck | 80–120 | ${Math.round(ctx.totalDistanceToday * 1.0).toLocaleString()} |

### Cost Reduction Strategies
1. **Route optimization** — reduce dead mileage by 15–20%
2. **Driver training** — eco-driving can save 5–10% on fuel
3. **Idling policy** — enforce max 3 min idle; UAE fines for excessive idling
4. **Tire management** — proper pressure improves fuel efficiency by 3–5%
5. **Maintenance schedules** — well-maintained vehicles consume 10–15% less fuel

> 💡 **UAE Note**: Fuel prices in the UAE are reviewed monthly by the UAE Fuel Price Committee. Current prices are among the lowest globally, making fuel efficiency programs even more impactful for your bottom line.`;
  }

  // ── Geofence queries ──
  if (/geofence|geo.?fence|zone|boundary|area|perimeter/i.test(msg)) {
    const geofenceCount = 'Check the Geofences section in the sidebar for the full list.';
    return `## 📍 Geofence Management

Geofences help you monitor vehicle entry/exit in designated zones — essential for UAE operations.

### Common Use Cases in UAE
- **Jebel Ali Port / JAFZA** — arrival/departure tracking
- **Dubai Industrial City** — zone-based monitoring
- **Abu Dhabi oil fields** — restricted area alerts
- **Customer sites** — automated visit logging
- **Driver home zones** — after-hours usage detection

### Recommended Setup
1. Define **operational zones** (depots, yards, warehouses)
2. Set **customer sites** for automated delivery confirmation
3. Create **restricted areas** (no-go zones for compliance)
4. Configure **speed zones** near schools and residential areas

> ${geofenceCount} Use the Geofences module to create, edit, and manage zones with real-time alerts.`;
  }

  // ── Compliance / RTA / UAE regulations ──
  if (/compliance|rt[a0]|regulation|legal|law|rule|permit|license|salik|toll|fine|violation/i.test(msg)) {
    return `## 📜 UAE Fleet Compliance Guide

### Key Regulatory Bodies
- **RTA** (Road & Transport Authority) — Dubai
- **DOT** (Department of Transport) — Abu Dhabi
- **MoI** (Ministry of Interior) — Federal traffic laws

### Critical Compliance Areas

#### 1. Vehicle Registration
- Annual renewal required
- Insurance mandatory (third-party minimum)
- Istimara (vehicle fitness test) every year for vehicles > 3 years old

#### 2. Driver Requirements
- Valid UAE driving license (appropriate category)
- Medical fitness certificate every 3 years (ages 21–60)
- For commercial: Professional driving permit + training certificate

#### 3. Telematics & Tracking
- All commercial vehicles must have GPS tracking (Federal Traffic Law)
- Speed limiters mandatory for heavy vehicles (>2023 regulation)
- Tachograph requirements for long-haul operations

#### 4. Salik (Toll Gates)
- Dubai: AED 4 per pass (as of 2024)
- Ensure fleet Salik accounts are topped up
- Monitor for unauthorized personal use

#### 5. Fines & Black Points
- Traffic fines range from AED 200 to AED 3,000+
- Serious offenses carry black points (23+ = license suspension)
- Company-branded vehicles: fines are the operator's responsibility

> ⚠️ **Important**: Non-compliance can result in vehicle impoundment, fines up to AED 50,000, and business license suspension. Use RTR 360's alert system to stay ahead of compliance deadlines.`;
  }

  // ── Help / what can you do ──
  if (/help|what can you|capabilities|features|how to use|guide/i.test(msg)) {
    return `## 🤖 RTR 360 AI Fleet Assistant

I'm your intelligent fleet management assistant, powered by real-time data from your RTR 360 platform. Here's what I can help with:

### 📊 Fleet Data Queries
- **"How many vehicles?"** — Fleet size, status breakdown, type distribution
- **"Show me alerts"** — Open alerts with severity and details
- **"Driver performance"** — Top driver rankings and scores
- **"Maintenance status"** — Upcoming and overdue maintenance
- **"Trip summary"** — Today's trips, distance, and utilization
- **"Dashboard overview"** — Complete fleet health snapshot

### 💡 Advisory
- **Fuel & cost optimization** — UAE-specific fuel cost insights
- **Compliance guidance** — RTA, DOT, and federal regulations
- **Geofence strategy** — Zone management best practices
- **General fleet advice** — Industry best practices for UAE operations

### How to Use
Simply type your question in natural language. I'll analyze your fleet data and provide actionable insights.

> 📌 **Note**: I use your actual fleet data from the database to provide accurate, contextual responses. The more vehicles and drivers you have tracked, the richer the insights!`;
  }

  // ── Greeting ──
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|salaam|assalam|greetings)/i.test(msg)) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${greeting}! 👋 Welcome to the RTR 360 AI Fleet Assistant.

Here's a quick snapshot of your fleet:

| Metric | Value |
|--------|-------|
| 🚛 Vehicles | ${ctx.vehicleCount} (${ctx.activeVehicles} active) |
| 👥 Drivers | ${ctx.driverCount} |
| 🛣️ Today's Trips | ${ctx.todayTrips} |
| 🚨 Open Alerts | ${ctx.openAlertsCount} |
| 🔧 Pending Maintenance | ${ctx.openMaintenanceCount} |

How can I help you today? Ask me about your **vehicles**, **drivers**, **trips**, **alerts**, or **maintenance**.`;
  }

  // ── Thank you ──
  if (/thank|thanks|shukran|appreciate/i.test(msg)) {
    return `You're welcome! 😊 I'm here to help you manage your fleet more efficiently.

Quick reminder — you currently have:
- **${ctx.openAlertsCount} open alert${ctx.openAlertsCount !== 1 ? 's' : ''}**${ctx.openAlertsCount > 0 ? ' that may need attention' : ''}
- **${ctx.openMaintenanceCount} pending maintenance task${ctx.openMaintenanceCount !== 1 ? 's' : ''}**

Feel free to ask anything about your fleet operations! 🚛`;
  }

  // ── Default: contextual general response ──
  return `## 🤖 Fleet Intelligence

I analyzed your question in the context of your current fleet data. Here's what's relevant:

### Your Fleet at a Glance
| Metric | Value |
|--------|-------|
| Vehicles | ${ctx.vehicleCount} (${ctx.activeVehicles} active) |
| Drivers | ${ctx.driverCount} |
| Today's Trips | ${ctx.todayTrips} | ${ctx.totalDistanceToday.toLocaleString()} km |
| Open Alerts | ${ctx.openAlertsCount} |
| Pending Maintenance | ${ctx.openMaintenanceCount} |

### Recommendation
Based on your fleet profile, here are some areas to consider:

${ctx.openAlertsCount > 5 ? '- **Priority**: You have a high number of open alerts. Consider reviewing and resolving critical ones immediately to maintain safety standards.\n' : ''
}${ctx.maintenanceVehicles > ctx.vehicleCount * 0.1 ? '- **Maintenance**: More than 10% of your fleet is in maintenance. Review maintenance schedules and vendor performance.\n' : ''
}${ctx.driverCount < ctx.activeVehicles ? '- **Staffing**: You have fewer drivers than active vehicles. Ensure proper driver allocation and consider hiring to maintain coverage.\n' : ''
}${ctx.todayTrips === 0 ? '- **Operations**: No trips recorded today yet. Check if dispatch has started and all tracking devices are online.\n' : ''
}- **UAE Compliance**: Ensure all vehicle registrations, driver licenses, and insurance policies are up to date.
- **Safety**: Review driver scores regularly and schedule training for those below 70.

> Try asking me something specific like **"show me alerts"**, **"driver performance"**, or **"maintenance status"** for detailed insights!`;
}

// ────────────────────────────────────────────────
// POST /api/ai/chat — Send a message
// ────────────────────────────────────────────────
export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'analytics');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: AI_USE
    const permErr = requirePermission(user, AI_USE);
    if (permErr) return permErr;

    const body = await request.json();
    const { message, conversationId } = body as {
      message: string;
      conversationId?: string;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      );
    }

    // Load or create conversation
    let conversation;
    let messages: ChatMessage[] = [];

    if (conversationId) {
      conversation = await db.aIConversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 },
        );
      }

      // Verify ownership
      if (conversation.userId && conversation.userId !== user.id) {
        return NextResponse.json(
          { error: 'Unauthorized access to this conversation' },
          { status: 403 },
        );
      }

      try {
        messages = JSON.parse(conversation.messages) as ChatMessage[];
      } catch {
        messages = [];
      }
    } else {
      conversation = await db.aIConversation.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: 'fleet_assistant',
          messages: '[]',
        },
      });
    }

    // Build fleet context for AI response
    const fleetContext = await buildFleetContext(user.organizationId);

    // Append user message
    messages.push({ role: 'user', content: message.trim() });

    // Generate AI response
    const aiContent = generateAIResponse(message, fleetContext);
    messages.push({ role: 'assistant', content: aiContent });

    // Save updated conversation
    await db.aIConversation.update({
      where: { id: conversation.id },
      data: { messages: JSON.stringify(messages) },
    });

    return NextResponse.json({
      messages,
      conversationId: conversation.id,
    });
  } catch (err) {
    logger.error('AI Chat error', { err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────
// GET /api/ai/chat — List recent conversations
// ────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const conversations = await db.aIConversation.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(user.organizationId ? [{ organizationId: user.organizationId }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });

    // Parse first user message as title, and message count
    const enriched = conversations.map((c) => {
      let parsed: ChatMessage[] = [];
      try {
        parsed = JSON.parse(c.messages) as ChatMessage[];
      } catch {
        // ignore
      }

      const firstUserMsg = parsed.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 80) + (firstUserMsg.content.length > 80 ? '…' : '')
        : 'New conversation';

      return {
        id: c.id,
        type: c.type,
        title,
        messageCount: parsed.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return NextResponse.json({ conversations: enriched });
  } catch (err) {
    logger.error('AI Conversations list error', { err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
