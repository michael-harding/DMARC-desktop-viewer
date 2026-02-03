# DMARC-desktop-viewer (TypeScript prototype)

Prototype Electron app that:
- connects to an IMAP server with username/password,
- scans recent messages in a mailbox,
- extracts .zip attachments and looks for DMARC aggregate XML reports,
- parses report metadata and records, and lists DMARC failures.

Run locally:
1. npm install
2. npm run build
3. npm start

Notes:
- Manual username/password entry; credentials are not persisted in this prototype.
- ZIP attachments containing XML reports are supported. Gzip (.gz) isn't implemented yet.
- No database or history; every run scans specified number of messages from the mailbox.
- If your provider requires OAuth (e.g. Gmail), you'll need to add OAuth flow later. For now use IMAP username/password.
