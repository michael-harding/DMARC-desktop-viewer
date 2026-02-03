import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

type AnyObject = { [k: string]: any };

// helpers
function findRecords(obj: AnyObject | AnyObject[]): AnyObject[] {
  const results: AnyObject[] = [];
  if (!obj || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...findRecords(item));
    return results;
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'record')) {
    const r = (obj as AnyObject).record;
    if (Array.isArray(r)) results.push(...r);
    else results.push(r);
  }
  for (const k of Object.keys(obj)) {
    if (k === 'record') continue;
    results.push(...findRecords((obj as AnyObject)[k]));
  }
  return results;
}

function isDmarcFailure(record: AnyObject): boolean {
  const row = record.row || {};
  const policy = row.policy_evaluated || {};
  const disposition = (policy.disposition || '').toString().toLowerCase();
  const dkim = (policy.dkim || '').toString().toLowerCase();
  const spf = (policy.spf || '').toString().toLowerCase();
  return (disposition && disposition !== 'none') || dkim === 'fail' || spf === 'fail';
}

function summarizeRecord(record: AnyObject) {
  const row = record.row || {};
  const identifiers = record.identifiers || {};
  const auth = record.auth_results || record['auth_results'] || {};
  let dkimDomain = '';
  let spfDomain = '';
  if (auth.dkim) {
    if (Array.isArray(auth.dkim)) {
      dkimDomain = auth.dkim[0].domain || auth.dkim[0]['@_domain'] || '';
    } else {
      dkimDomain = auth.dkim.domain || auth.dkim['@_domain'] || '';
    }
  }
  if (auth.spf) {
    if (Array.isArray(auth.spf)) {
      spfDomain = auth.spf[0].domain || auth.spf[0]['@_domain'] || '';
    } else {
      spfDomain = auth.spf.domain || auth.spf['@_domain'] || '';
    }
  }
  return {
    source_ip: row.source_ip || '',
    count: Number(row.count || 1),
    header_from: identifiers.header_from || '',
    envelope_from: identifiers.envelope_from || '',
    disposition: (row.policy_evaluated && row.policy_evaluated.disposition) || '',
    dkim: (row.policy_evaluated && row.policy_evaluated.dkim) || '',
    spf: (row.policy_evaluated && row.policy_evaluated.spf) || '',
    dkim_domain: dkimDomain,
    spf_domain: spfDomain,
    raw: record
  };
}

function parseReportMetadata(parsed: AnyObject) {
  const meta =
    (parsed.feedback && parsed.feedback.report_metadata) ||
    (parsed.report && parsed.report.report_metadata) ||
    parsed.report_metadata ||
    {};
  const org = meta.org_name || meta['org_name'] || '';
  const date_begin =
    (meta.date_range && meta.date_range.begin) || meta.date_range?.begin || meta.begin || '';
  const date_end =
    (meta.date_range && meta.date_range.end) || meta.date_range?.end || meta.end || '';
  return { org_name: org, date_begin, date_end };
}

ipcMain.handle('imap-scan-dmarc', async (event, config: any) => {
  const client = new ImapFlow({
    host: config.host,
    port: config.port || (config.secure ? 993 : 143),
    secure: !!config.secure,
    auth: {
      user: config.user,
      pass: config.password
    }
  } as any);

  try {
    await client.connect();
    const mailbox = config.mailbox || 'INBOX';
    const limit = Number(config.limit) || 50;

    const mailboxInfo = await client.mailboxOpen(mailbox);
    if (!mailboxInfo.exists) {
      return { ok: true, failures: [], note: `Mailbox ${mailbox} empty` };
    }

    const start = Math.max(1, mailboxInfo.exists - limit + 1);
    const seqRange = `${start}:*`;

    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    const failures: any[] = [];

    for await (const msg of client.fetch(seqRange, { uid: true, envelope: true, source: true })) {
      let mail;
      try {
        mail = await simpleParser(msg.source as Buffer);
      } catch (err) {
        continue;
      }
      if (!mail.attachments || mail.attachments.length === 0) continue;

      for (const att of mail.attachments) {
        const filename = (att.filename || '').toLowerCase();
        const contentType = (att.contentType || '').toLowerCase();
        const isZip =
          filename.endsWith('.zip') ||
          contentType === 'application/zip' ||
          contentType === 'application/x-zip-compressed';
        if (!isZip) continue;

        let directory;
        try {
          directory = await unzipper.Open.buffer(att.content as Buffer);
        } catch (err) {
          continue;
        }

        for (const entry of directory.files) {
          const entryName = entry.path || '';
          if (!entryName.toLowerCase().endsWith('.xml')) continue;

          let xmlBuffer: Buffer;
          try {
            xmlBuffer = await entry.buffer();
          } catch (err) {
            continue;
          }
          let parsed;
          try {
            parsed = xmlParser.parse(xmlBuffer.toString('utf8'));
          } catch (err) {
            continue;
          }

          const metadata = parseReportMetadata(parsed);
          const records = findRecords(parsed);
          for (const r of records) {
            if (isDmarcFailure(r)) {
              failures.push({
                mailbox,
                message_uid: msg.uid,
                message_subject: (msg.envelope && msg.envelope.subject) ? String(msg.envelope.subject) : '',
                attachment_filename: filename,
                xml_filename: entryName,
                reporter_org: metadata.org_name,
                date_begin: metadata.date_begin,
                date_end: metadata.date_end,
                record: summarizeRecord(r)
              });
            }
          }
        }
      }
    }

    return { ok: true, failures };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    client.logout().catch(() => {});
  }
});
