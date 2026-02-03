const status = document.getElementById('status') as HTMLDivElement;
const tbody = document.getElementById('tbody') as HTMLTableSectionElement;
const table = document.getElementById('table') as HTMLTableElement;

document.getElementById('scan')!.addEventListener('click', async () => {
  status.textContent = 'Scanning...';
  tbody.innerHTML = '';
  table.hidden = true;

  const cfg = {
    host: (document.getElementById('host') as HTMLInputElement).value,
    port: parseInt((document.getElementById('port') as HTMLInputElement).value, 10),
    secure: (document.getElementById('secure') as HTMLInputElement).checked,
    user: (document.getElementById('user') as HTMLInputElement).value,
    password: (document.getElementById('pass') as HTMLInputElement).value,
    mailbox: (document.getElementById('mailbox') as HTMLInputElement).value,
    limit: parseInt((document.getElementById('limit') as HTMLInputElement).value, 10)
  };

  try {
    const res = await window.electronAPI.scanDmarc(cfg);
    if (!res.ok) {
      status.textContent = 'Error: ' + res.error;
      return;
    }
    status.textContent = `Found ${res.failures.length} failure records`;
    if (res.failures.length === 0) return;

    for (const f of res.failures) {
      const r = f.record;
      const tr = document.createElement('tr');

      const reporter = document.createElement('td');
      reporter.textContent = f.reporter_org || '';
      tr.appendChild(reporter);

      const range = document.createElement('td');
      range.textContent = `${f.date_begin || ''} → ${f.date_end || ''}`;
      tr.appendChild(range);

      const ip = document.createElement('td');
      ip.textContent = `${r.source_ip || ''} (${r.count || ''})`;
      tr.appendChild(ip);

      const froms = document.createElement('td');
      froms.textContent = `${r.header_from || ''} / ${r.envelope_from || ''}`;
      tr.appendChild(froms);

      const dkim = document.createElement('td');
      dkim.textContent = `${r.dkim_domain || ''} / ${r.dkim || ''}`;
      tr.appendChild(dkim);

      const spf = document.createElement('td');
      spf.textContent = `${r.spf_domain || ''} / ${r.spf || ''}`;
      tr.appendChild(spf);

      const disp = document.createElement('td');
      disp.textContent = r.disposition || '';
      tr.appendChild(disp);

      const ctx = document.createElement('td');
      ctx.textContent = `${f.message_subject || ''} — ${f.attachment_filename || ''}/${f.xml_filename || ''}`;
      tr.appendChild(ctx);

      tbody.appendChild(tr);
    }
    table.hidden = false;
  } catch (err: any) {
    status.textContent = 'IPC error: ' + err.message;
  }
});
