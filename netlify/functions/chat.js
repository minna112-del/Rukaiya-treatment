// Netlify Function: /.netlify/functions/chat
// Key কখনো এখানে লিখবেন না — শুধু Netlify-র Site settings → Environment variables-এ OPENAI_API_KEY রাখুন।
// ক্লায়েন্টের পাঠানো system prompt বিশ্বাস করা হয় না; সার্ভার নিজের নিরাপদ prompt ব্যবহার করে।

const SYSTEM_PROMPT = `তুমি MT Studio AI-র AI সহকারী। তুমি একজন AI — মানুষ নও, রুকইয়াহ বিশেষজ্ঞও নও, এবং তোমার কোনো মানবিক নাম নেই। জিজ্ঞেস করলে সত্যভাবে বলবে তুমি AI।
তোমার কাজ: রুকইয়াহ শরীয়্যাহ বিষয়ক সাধারণ ইসলামিক তথ্য দেওয়া — কুরআন ও সহিহ সুন্নাহর আলোকে, বাংলায়, সংক্ষেপে (সর্বোচ্চ ৩-৫ প্যারা)।
নিয়ম: চিকিৎসা নির্ণয় করবে না, ফতোয়া দেবে না, নিশ্চিতভাবে কারো উপর নজর/জাদু/জ্বীন আছে বলে দাবি করবে না। শারীরিক বা মানসিক সমস্যায় চিকিৎসক ও যোগ্য আলেমের পরামর্শ নিতে বলবে। আরবি দোয়া দিলে অর্থ ও উচ্চারণ দেবে।`;

// সহজ in-memory rate limit (সাধারণ অপব্যবহার ঠেকাতে; বেশি ট্রাফিক হলে
// Netlify-র rate limiting / Redis-ভিত্তিক সমাধান ব্যবহার করুন।)
const hits = new Map();
const LIMIT = 20; // প্রতি IP-তে প্রতি মিনিটে সর্বোচ্চ ২০টি অনুরোধ
const WINDOW_MS = 60 * 1000;

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

function header(headers, name) {
  if (!headers) return '';
  if (headers[name]) return headers[name];
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function allowedOrigin(event) {
  const allowed = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = header(event.headers, 'origin');
  if (!origin) return null;
  // একই Netlify সাইট থেকে কল এলে origin সাধারণত সাইটের ডোমেইনই হবে।
  // ALLOWED_ORIGIN না থাকলে টেস্টের জন্য origin-কে অনুমতি দেওয়া হয়;
  // লাইভে ALLOWED_ORIGIN অবশ্যই বসান।
  if (allowed.length === 0) return origin;
  return allowed.includes(origin) ? origin : null;
}

exports.handler = async (event) => {
  const origin = allowedOrigin(event);
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  headers.Vary = 'Origin';
  const json = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!origin && header(event.headers, 'origin')) {
    return json(403, { error: 'Origin not allowed' });
  }

  const ip =
    (header(event.headers, 'x-forwarded-for') || '').split(',')[0].trim() ||
    header(event.headers, 'client-ip') ||
    'unknown';
  if (rateLimited(ip)) {
    return json(429, { error: 'Too many requests. একটু পরে আবার চেষ্টা করুন।' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { error: 'Server API key is not configured' });

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userMessages = messages
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .slice(-5)
    .map((m) => ({ role: 'user', content: m.content.slice(0, 2000) }));
  if (userMessages.length === 0) return json(400, { error: 'A user message is required' });
  const totalChars = userMessages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > 8000) return json(400, { error: 'Message too long' });

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...userMessages],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    const data = await r.json();
    if (!r.ok) return json(r.status, { error: 'OpenAI error' });
    return json(200, { reply: data.choices?.[0]?.message?.content || '' });
  } catch {
    return json(502, { error: 'Upstream error' });
  }
};
