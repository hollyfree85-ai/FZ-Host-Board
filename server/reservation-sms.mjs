// Server only. This module is also used by the unattended reconciliation job.
const SMS_MIN = 60000;
const SMS_ZONE = 'America/Chicago';
const SMS_TERMINAL = new Set(['sent', 'delivered', 'undelivered', 'failed', 'canceled']);
export function smsTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return NaN;
  const target = Date.parse(date + 'T' + time + ':00Z');
  let instant = target;
  for (let n = 0; n < 3 && Number.isFinite(instant); n++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: SMS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(x => [x.type, x.value]));
    instant += target - Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z');
  }
  if (!Number.isFinite(instant)) return NaN;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SMS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant) === date + ' ' + time ? instant : NaN;
}
export function smsPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return /^[2-9]\d{9}$/.test(digits) ? '+1' + digits : '';
}
export function smsConsent(r) {
  const consent = r?.smsConsent || r?.online?.contactConsent;
  return !!(consent && ['reservation-sms-v2', 'reservation-reminders-v1'].includes(consent.textVersion) && smsPhone(r.phone) && smsPhone(r.phone) === smsPhone(consent.phone) && Number.isFinite(consent.at));
}
export function smsActive(r) { return !!r && !/cancel|complete|seated|no.?show|deleted/i.test(r.status || ''); }
export function smsRevision(r) { return JSON.stringify([r?.date, r?.time, r?.name, r?.people, smsPhone(r?.phone), (r?.smsConsent || r?.online?.contactConsent)?.at, r?.smsRevisionAt || 0]); }
export function smsCode(id) { return id.slice(-6).toUpperCase(); }
async function smsHash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function smsConfigured(env) { return env.RESERVATION_SMS_ENABLED === 'true' && !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID && env.SMS_PUBLIC_BASE_URL && env.FIREBASE_BOARD_URL); }
function smsXML(text = '') { return new Response('<Response>' + (text ? '<Message>' + text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])) + '</Message>' : '') + '</Response>', { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } }); }
async function smsDb(env, path, init = {}, fetcher = fetch) {
  const r = await fetcher(env.FIREBASE_BOARD_URL.replace(/\/$/, '') + '/' + path + '.json', { ...init, signal: AbortSignal.timeout(10000) });
  if (!r.ok && r.status !== 412) throw Error('SMS database unavailable');
  return r;
}
async function smsRead(env, path, fetcher) { return (await smsDb(env, path, {}, fetcher)).json(); }
async function smsChange(env, path, fn, fetcher) {
  for (let n = 0; n < 6; n++) {
    const r = await smsDb(env, path, { headers: { 'X-Firebase-ETag': 'true' } }, fetcher);
    const old = await r.json(), next = fn(old), etag = r.headers.get('etag');
    if (next === undefined) return { changed: false, value: old };
    if (!etag) throw Error('SMS database version unavailable');
    const written = await smsDb(env, path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(next) }, fetcher);
    if (written.ok) return { changed: true, value: next };
  }
  throw Error('SMS update conflict');
}
async function smsTwilio(env, fields, sid, fetcher) {
  try {
    const response = await fetcher('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(env.TWILIO_ACCOUNT_SID) + '/Messages' + (sid ? '/' + encodeURIComponent(sid) : '') + '.json', {
      method: 'POST', headers: { Authorization: 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.sid) return { status: result.status || 'accepted', providerId: result.sid };
    // Never automatically retry an uncertain POST: Twilio might have accepted it.
    return { status: response.status >= 500 ? 'unknown' : 'failed', errorCode: String(result.code || response.status) };
  } catch { return { status: 'unknown', errorCode: 'response_not_confirmed' }; }
}
export function smsText(id, r, kind) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: SMS_ZONE, hour: 'numeric', minute: '2-digit' }).format(smsTime(r.date, r.time));
  return kind === '1h'
    ? `Juicy Seafood Huntsville: ${r.people} guests today at ${time}. Reply CONFIRM to confirm. Ref ${smsCode(id)}. STOP to opt out.`
    : `Juicy Seafood Huntsville: Your visit is in 10 min. Reply HERE once your whole party arrives. Ref ${smsCode(id)}. STOP to opt out.`;
}
export async function reconcileSms(id, env, now = Date.now(), fetcher = fetch) {
  if (!smsConfigured(env)) return { enabled: false };
  if (!/^(web_[a-f0-9]{24}|res_[A-Za-z0-9_-]{1,100})$/.test(id)) throw Error('Invalid reservation reference');
  const r = await smsRead(env, 'reservations/' + id, fetcher);
  const revision = smsRevision(r), arrival = smsTime(r?.date, r?.time);
  const stopped = r?.phone ? await smsRead(env, 'reservationSmsOptOuts/' + await smsHash(smsPhone(r.phone)), fetcher) : null;
  const active = smsActive(r) && smsConsent(r) && !stopped?.stopped && !(r?.guestReply?.arrivedAt && r.guestReply.revision === revision);
  const jobs = await smsRead(env, 'reservationSmsJobs/' + id, fetcher) || {};
  // Cancel obsolete scheduled messages before considering a new schedule.
  for (const [key, job] of Object.entries(jobs)) {
    if (SMS_TERMINAL.has(job.status) || (active && job.revision === revision)) continue;
    if (job.providerId) {
      const result = await smsTwilio(env, { Status: 'canceled' }, job.providerId, fetcher);
      if (result.status !== 'canceled') return { enabled: true, review: true };
      await smsChange(env, 'reservationSmsJobs/' + id + '/' + key, old => old && ({ ...old, status: 'canceled', updatedAt: now }), fetcher);
    } else if (['claimed', 'unknown'].includes(job.status)) return { enabled: true, review: true };
  }
  if (!active || !Number.isFinite(arrival) || arrival <= now) return { enabled: true };
  for (const kind of ['1h', '10m']) {
    const sendAt = arrival - (kind === '1h' ? 60 : 10) * SMS_MIN;
    // Native scheduling requires 15 minutes of lead time. The unattended job
    // handles shorter lead times at the due time, with a maximum 5-minute grace.
    if (sendAt - now > 34 * 86400000 || (sendAt > now && sendAt - now < 16 * SMS_MIN) || now - sendAt > 5 * SMS_MIN || r.at > sendAt) continue;
    const key = await smsHash(revision + ':' + kind), path = 'reservationSmsJobs/' + id + '/' + key;
    const claim = { kind, revision, sendAt, status: 'claimed', createdAt: now, updatedAt: now };
    const won = await smsChange(env, path, old => old ? undefined : claim, fetcher);
    if (!won.changed) continue;
    const latest = await smsRead(env, 'reservations/' + id, fetcher);
    const optOut = await smsRead(env, 'reservationSmsOptOuts/' + await smsHash(smsPhone(r.phone)), fetcher);
    if (!smsActive(latest) || !smsConsent(latest) || (latest.guestReply?.arrivedAt && latest.guestReply.revision === revision) || optOut?.stopped || smsRevision(latest) !== revision) {
      await smsChange(env, path, old => ({ ...old, status: 'canceled', updatedAt: now }), fetcher); continue;
    }
    const fields = { To: smsPhone(r.phone), MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, Body: smsText(id, r, kind), StatusCallback: env.SMS_PUBLIC_BASE_URL.replace(/\/$/, '') + '/api/sms/status?id=' + encodeURIComponent(id) + '&job=' + key, ValidityPeriod: '300' };
    if (sendAt > now) Object.assign(fields, { ScheduleType: 'fixed', SendAt: new Date(sendAt).toISOString() });
    const result = await smsTwilio(env, fields, null, fetcher);
    await smsChange(env, path, old => ({ ...old, ...(!SMS_TERMINAL.has(old?.status) && old?.status !== 'queued' ? result : {}), updatedAt: now }), fetcher);
    // An edit while Twilio was scheduling must also cancel the old job.
    const checked = await smsRead(env, 'reservations/' + id, fetcher);
    const stoppedAfter = await smsRead(env, 'reservationSmsOptOuts/' + await smsHash(smsPhone(r.phone)), fetcher);
    if (result.providerId && (!smsActive(checked) || smsRevision(checked) !== revision || (checked.guestReply?.arrivedAt && checked.guestReply.revision === revision) || stoppedAfter?.stopped)) {
      const canceled = await smsTwilio(env, { Status: 'canceled' }, result.providerId, fetcher);
      if (canceled.status === 'canceled') await smsChange(env, path, old => ({ ...old, status: 'canceled', updatedAt: now }), fetcher);
    }
  }
  return { enabled: true };
}
export async function reconcileAllSms(env, now = Date.now(), fetcher = fetch) {
  if (!smsConfigured(env)) return { enabled: false, checked: 0 };
  const records = await smsRead(env, 'reservations', fetcher) || {}, jobs = await smsRead(env, 'reservationSmsJobs', fetcher) || {};
  let checked = 0;
  for (const id of new Set([...Object.keys(records), ...Object.keys(jobs)])) { await reconcileSms(id, env, now, fetcher); checked++; }
  return { enabled: true, checked };
}
export async function smsSignature(url, params, token) {
  let text = url;
  for (const key of [...new Set(params.keys())].sort()) for (const value of [...new Set(params.getAll(key))].sort()) text += key + value;
  const encoder = new TextEncoder(), secret = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', secret, encoder.encode(text)))));
}
function smsEqual(a, b) { if (!a || a.length !== b.length) return false; let n = 0; for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i); return n === 0; }
export async function handleSmsWebhook(request, env, now = Date.now(), fetcher = fetch) {
  if (!smsConfigured(env)) return new Response('SMS is not activated', { status: 503 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(request.headers.get('content-type') || '').startsWith('application/x-www-form-urlencoded')) return new Response('Unsupported body', { status: 415 });
  const raw = await request.text(); if (raw.length > 16000) return new Response('Body too large', { status: 413 });
  const params = new URLSearchParams(raw), url = new URL(request.url);
  const external = env.SMS_PUBLIC_BASE_URL.replace(/\/$/, '') + url.pathname + url.search;
  if (!smsEqual(request.headers.get('x-twilio-signature'), await smsSignature(external, params, env.TWILIO_AUTH_TOKEN)) || params.get('AccountSid') !== env.TWILIO_ACCOUNT_SID) return new Response('Invalid signature', { status: 403 });
  const sid = params.get('MessageSid'); if (!/^SM[a-f0-9]{32}$/i.test(sid || '')) return new Response('Invalid message', { status: 400 });
  if (url.pathname === '/api/sms/status') {
    const id = url.searchParams.get('id'), key = url.searchParams.get('job'), status = params.get('MessageStatus');
    if (!/^(web_[a-f0-9]{24}|res_[A-Za-z0-9_-]{1,100})$/.test(id || '') || !/^[a-f0-9]{64}$/.test(key || '') || !['scheduled','queued','sending','sent','delivered','undelivered','failed','canceled'].includes(status)) return new Response('Invalid status', { status: 400 });
    await smsChange(env, 'reservationSmsJobs/' + id + '/' + key, old => {
      if (!old || (old.providerId && old.providerId !== sid) || SMS_TERMINAL.has(old.status) && !(old.status === 'sent' && ['delivered','undelivered'].includes(status))) return undefined;
      return { ...old, providerId: sid, status, updatedAt: now, ...(params.get('ErrorCode') ? { errorCode: params.get('ErrorCode') } : {}) };
    }, fetcher);
    return smsXML();
  }
  if (url.pathname !== '/api/sms/inbound') return new Response('Not found', { status: 404 });
  const phone = smsPhone(params.get('From')), body = String(params.get('Body') || '').trim().toUpperCase();
  if (!phone) return smsXML();
  const stop = params.get('OptOutType') === 'STOP' || /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/.test(body);
  const start = params.get('OptOutType') === 'START' || /^(START|UNSTOP)$/.test(body);
  if (stop || start) {
    await smsChange(env, 'reservationSmsOptOuts/' + await smsHash(phone), old => ({ stopped: stop, at: now }), fetcher);
    // Twilio handles the opt-out acknowledgement; never send a second reply.
    if (stop) { const rows = await smsRead(env, 'reservations', fetcher) || {}; for (const [id, r] of Object.entries(rows)) if (smsPhone(r.phone) === phone) await reconcileSms(id, env, now, fetcher); }
    return smsXML();
  }
  if (params.get('OptOutType') === 'HELP' || body === 'HELP') return smsXML();
  if ((await smsRead(env, 'reservationSmsOptOuts/' + await smsHash(phone), fetcher))?.stopped) return smsXML();
  const command = body.match(/^(CONFIRM|HERE)(?:\s+([A-Z0-9]{6}))?[.!]?$/);
  if (!command) return smsXML();
  const records = await smsRead(env, 'reservations', fetcher) || {}, allJobs = await smsRead(env, 'reservationSmsJobs', fetcher) || {};
  const candidates = Object.entries(records).filter(([id, r]) => {
    const at = smsTime(r.date, r.time);
    return smsActive(r) && smsConsent(r) && smsPhone(r.phone) === phone && Math.abs(now - at) <= 2 * 60 * SMS_MIN && (!command[2] || smsCode(id) === command[2]) && Object.values(allJobs[id] || {}).some(j => j.revision === smsRevision(r) && j.sendAt <= now && ['accepted','queued','sending','sent','delivered'].includes(j.status));
  });
  if (candidates.length !== 1) return smsXML(candidates.length > 1 ? 'Juicy Seafood: More than one booking matches. Reply ' + command[1] + ' and the 6-character Ref from your reminder.' : 'Juicy Seafood: We could not match an active reservation. Please check with our host.');
  const [id, reservation] = candidates[0], revision = smsRevision(reservation), field = command[1] === 'HERE' ? 'arrivedAt' : 'confirmedAt';
  const result = await smsChange(env, 'reservations/' + id, current => {
    if (!smsActive(current) || smsRevision(current) !== revision || (current.guestReply?.[field] && current.guestReply.revision === revision)) return undefined;
    return { ...current, guestReply: { ...(current.guestReply?.revision === revision ? current.guestReply : {}), [field]: now, [field + 'Sid']: sid, revision }, updatedAt: now };
  }, fetcher);
  if (!result.changed) return smsXML();
  if (field === 'arrivedAt') await reconcileSms(id, env, now, fetcher);
  return smsXML(field === 'arrivedAt' ? 'Juicy Seafood: You are checked in. Our host has been notified. Please stay nearby; your table is not yet guaranteed ready.' : 'Juicy Seafood: Thank you! Your attendance is confirmed. Our host has been notified.');
}
