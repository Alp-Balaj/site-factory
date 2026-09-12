// Opening hours as the Skeleton wants them: [{ day, time }] with time in 24h "08:00 - 23:00" form.
// Places API gives ["e hënë: 08:00–23:00", ...] or, in the Albanian locale, "8:00 p.d. – 11:00 m.d." (p.d. = AM, m.d. = PM).

const to24 = (h, m, ap) => { let hh = Number(h) % 12; if (/^m/.test(ap)) hh += 12; return `${String(hh).padStart(2, '0')}:${m}`; };

// One time range, normalised. Idempotent: an already clean "08:00 - 23:00" comes back unchanged.
export function cleanTime(t) {
  return String(t ?? '')
    .replace(/(\d{1,2}):(\d{2})\s*(p\.d\.|m\.d\.)/gi, (_, h, m, ap) => to24(h, m, ap.toLowerCase()))
    .replace(/\b(\d):(\d{2})/g, '0$1:$2')
    .replace(/\s*[\u2013\u2014\u2009\u202f-]+\s*/g, ' - ')
    .trim();
}

// Google's weekday strings -> [{ day, time }]. A day with no time reads "Mbyllur" (closed).
export function parseHours(list = []) {
  return list.map(s => { const [day, ...t] = s.split(': '); return { day, time: cleanTime(t.join(': ')) || 'Mbyllur' }; });
}

// Re-cleans hours already in config form (older configs kept whatever they were generated with).
export function normaliseHours(hours = []) {
  return hours.map(h => ({ ...h, time: h.time === 'Mbyllur' ? h.time : (cleanTime(h.time) || 'Mbyllur') }));
}
