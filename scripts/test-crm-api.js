const BASE = 'http://localhost:3000';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('=== CRM Phase 2 API Tests ===\n');

  // 1. Login
  console.log('1. Login...');
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@rtr.ae', password: 'REDACTED_DEMO_PASSWORD' }),
  });
  if (!login.data.token) { console.error('LOGIN FAILED'); return; }
  const token = login.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  console.log(`   ✅ Logged in as ${login.data.user.name}`);

  // 2. Pipeline
  console.log('\n2. Pipeline...');
  const pipeline = await api('/api/pipeline', { headers });
  console.log(`   Stages: ${Object.keys(pipeline.data.pipeline).join(', ')}`);
  console.log(`   Summary: ${pipeline.data.summary.total} leads, AED ${pipeline.data.summary.totalValue} value, ${pipeline.data.summary.wonThisMonth} won this month`);

  // 3. Quotations
  console.log('\n3. Quotations...');
  const quotes = await api('/api/quotations', { headers });
  console.log(`   Total: ${quotes.data.pagination?.total}`);
  (quotes.data.quotations || []).forEach(q =>
    console.log(`   ${q.quotationNumber} | ${q.status} | AED ${q.total} | ${q.lead?.company || q.lead?.name || 'N/A'}`)
  );

  // 4. Quotation Detail
  if (quotes.data.quotations?.[0]) {
    console.log('\n4. Quotation Detail...');
    const qd = await api(`/api/quotations/${quotes.data.quotations[0].id}`, { headers });
    const q = qd.data.quotation;
    console.log(`   ${q.quotationNumber} | ${q.status} | Subtotal: AED ${q.subtotal} | VAT: AED ${q.tax} | Total: AED ${q.total}`);
    const items = JSON.parse(q.items);
    items.forEach((it, i) => console.log(`   Item ${i + 1}: ${it.description} x${it.quantity} @ AED ${it.unitPrice} = AED ${it.quantity * it.unitPrice}`));
  }

  // 5. Contacts
  console.log('\n5. Contacts...');
  const contacts = await api('/api/contacts', { headers });
  console.log(`   Total: ${contacts.data.pagination?.total}`);
  (contacts.data.contacts || []).forEach(c =>
    console.log(`   ${c.name} | ${c.position || '-'} | ${c.phone || '-'} | ${c.email || '-'}`)
  );

  // 6. Lead Detail (with activities + quotations)
  console.log('\n6. Lead Detail...');
  const leads = await api('/api/leads?limit=3', { headers });
  const firstLead = leads.data.leads?.[0];
  if (firstLead) {
    const ld = await api(`/api/leads/${firstLead.id}`, { headers });
    const l = ld.data.lead;
    console.log(`   ${l.name} | ${l.company || '-'} | Activities: ${l.activities?.length || 0} | Quotations: ${l.quotations?.length || 0}`);
    (l.activities || []).forEach(a =>
      console.log(`   Activity: [${a.type}] ${a.title} - ${a.user?.name || 'system'}`)
    );
  }

  // 7. Create Activity
  console.log('\n7. Create Activity...');
  if (firstLead) {
    const act = await api('/api/activities', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'note',
        title: 'API test activity',
        description: 'Created via automated test',
        leadId: firstLead.id,
      }),
    });
    console.log(`   ${act.status === 201 ? '✅' : '❌'} Activity created: ${act.data.activity?.title}`);
  }

  console.log('\n=== All Tests Complete ===');
}

main().catch(e => console.error('Test error:', e));
