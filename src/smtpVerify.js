const dns = require('dns').promises;
const net = require('net');

const FROM_EMAIL = process.env.SMTP_VERIFY_FROM || process.env.EMAIL_USER || 'verify@example.com';
const HELO_DOMAIN = process.env.SMTP_VERIFY_HELO || 'gmail.com';
const TIMEOUT_MS = 7000;

const cache = new Map();

function readUntil(socket, buf) {
  return new Promise((resolve, reject) => {
    let data = buf || '';
    const onData = (chunk) => {
      data += chunk.toString('utf8');
      const lines = data.split('\r\n');
      const last = lines[lines.length - 2];
      if (last && /^\d{3} /.test(last)) {
        socket.removeListener('data', onData);
        resolve(data);
      }
    };
    const onErr = (e) => { socket.removeListener('data', onData); reject(e); };
    socket.on('data', onData);
    socket.once('error', onErr);
    socket.once('end', () => resolve(data));
    setTimeout(() => { socket.removeListener('data', onData); reject(new Error('SMTP read timeout')); }, TIMEOUT_MS);
  });
}

function send(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + '\r\n', 'utf8', (err) => err ? reject(err) : resolve());
  });
}

function lastCode(reply) {
  const lines = reply.trim().split('\r\n');
  const last = lines[lines.length - 1];
  const m = last && last.match(/^(\d{3})/);
  return m ? parseInt(m[1], 10) : 0;
}

async function pickMx(domain) {
  const mx = await dns.resolveMx(domain);
  if (!mx || !mx.length) return null;
  mx.sort((a, b) => a.priority - b.priority);
  return mx[0].exchange;
}

/**
 * SMTP-level recipient probe.
 * Returns { ok: true, status: 'accepted' | 'catchall' } if the server says yes,
 * or { ok: false, status: 'rejected' | 'unknown', code, reason }.
 *
 * status 'catchall' means we couldn't trust the result (server accepts everything) — caller should send anyway.
 */
async function verifyRecipient(email) {
  if (cache.has(email)) return cache.get(email);

  const domain = email.split('@')[1];
  if (!domain) {
    const r = { ok: false, status: 'rejected', reason: 'invalid email syntax' };
    cache.set(email, r);
    return r;
  }

  let host;
  try {
    host = await pickMx(domain);
  } catch (e) {
    const r = { ok: false, status: 'rejected', reason: 'no MX records' };
    cache.set(email, r);
    return r;
  }
  if (!host) {
    const r = { ok: false, status: 'rejected', reason: 'no MX records' };
    cache.set(email, r);
    return r;
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    socket.setTimeout(TIMEOUT_MS);

    let result = { ok: false, status: 'unknown', reason: 'no response' };
    let stage = 'banner';

    const finish = (r) => {
      result = r;
      cache.set(email, r);
      try { socket.end(); } catch {}
      resolve(r);
    };

    socket.once('error', (e) => finish({ ok: false, status: 'unknown', reason: e.message }));
    socket.once('timeout', () => finish({ ok: false, status: 'unknown', reason: 'connection timeout' }));

    (async () => {
      try {
        let reply = await readUntil(socket);
        if (lastCode(reply) !== 220) return finish({ ok: false, status: 'unknown', reason: 'bad banner: ' + reply.trim() });

        await send(socket, `EHLO ${HELO_DOMAIN}`);
        reply = await readUntil(socket);
        if (lastCode(reply) >= 400) {
          await send(socket, `HELO ${HELO_DOMAIN}`);
          reply = await readUntil(socket);
          if (lastCode(reply) >= 400) return finish({ ok: false, status: 'unknown', reason: 'EHLO/HELO refused' });
        }

        await send(socket, `MAIL FROM:<${FROM_EMAIL}>`);
        reply = await readUntil(socket);
        if (lastCode(reply) >= 400) return finish({ ok: false, status: 'unknown', reason: 'MAIL FROM refused: ' + reply.trim() });

        await send(socket, `RCPT TO:<${email}>`);
        reply = await readUntil(socket);
        const code = lastCode(reply);

        // Hard reject
        if (code === 550 || code === 553 || code === 551 || code === 552) {
          return finish({ ok: false, status: 'rejected', code, reason: reply.trim() });
        }
        // Soft / temporary
        if (code >= 400 && code < 500) {
          return finish({ ok: false, status: 'unknown', code, reason: reply.trim() });
        }
        // Accepted — but might be catch-all; we don't probe further to keep things fast.
        if (code >= 200 && code < 300) {
          await send(socket, 'QUIT').catch(() => {});
          return finish({ ok: true, status: 'accepted', code });
        }

        finish({ ok: false, status: 'unknown', code, reason: reply.trim() });
      } catch (e) {
        finish({ ok: false, status: 'unknown', reason: e.message });
      }
    })();
  });
}

module.exports = { verifyRecipient };
