<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * صفحهٔ مستقل «وضعیت بک‌اند» روی ریشهٔ دامنهٔ API.
 *
 * - کاملاً مستقل از فرانت‌اند و بدون Blade/کش view (روی هاست اشتراکی نیازی به نوشتن در storage/framework/views نیست).
 * - خود صفحه هیچ query، نشست یا کوکی ندارد؛ وضعیت را مرورگر فقط یک‌بار هنگام باز شدن و سپس
 *   با دکمهٔ «بررسی مجدد» از همان دو endpoint عمومی `/api/v1/health` و `/api/v1/health/db` می‌خواند.
 * - هیچ polling خودکاری وجود ندارد و هیچ داده‌ای جز آنچه health عمومی از قبل می‌دهد نمایش داده نمی‌شود.
 */
class StatusPageController extends Controller
{
    public function __invoke(): Response
    {
        $nonce = base64_encode(random_bytes(16));

        $csp = implode('; ', [
            "default-src 'none'",
            "script-src 'nonce-{$nonce}'",
            "style-src 'nonce-{$nonce}'",
            "font-src 'self'",
            "connect-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        ]);

        return response(str_replace('__NONCE__', $nonce, self::html()), 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store, max-age=0',
            'Content-Security-Policy' => $csp,
            'Referrer-Policy' => 'no-referrer',
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'X-Robots-Tag' => 'noindex, nofollow',
        ]);
    }

    private static function html(): string
    {
        return <<<'HTML'
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>وضعیت بک‌اند تدبیر</title>
<style nonce="__NONCE__">
@font-face{font-family:"Vazirmatn";src:url("/fonts/vazirmatn-arabic-variable.woff2") format("woff2");font-weight:100 900;font-display:swap}
:root{color-scheme:light dark;--bg:#f4f6f8;--card:#fff;--text:#16202a;--muted:#5d6b78;--line:#dde3e9;--ok:#0d7a47;--ok-bg:#e3f6ec;--bad:#b42318;--bad-bg:#fde8e6;--warn:#8a5a00;--warn-bg:#fff2d6;--idle:#4a5866;--idle-bg:#e9edf1;--accent:#1b5fd1}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--card:#1a222b;--text:#e8eef4;--muted:#9aa8b6;--line:#2c3743;--ok:#4fd18b;--ok-bg:#12301f;--bad:#ff8a80;--bad-bg:#3a1714;--warn:#ffcb6b;--warn-bg:#35280b;--idle:#b4c0cc;--idle-bg:#27313b;--accent:#7aa7ff}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font-family:"Vazirmatn",Tahoma,"Segoe UI",system-ui,sans-serif;line-height:1.8;display:flex;justify-content:center;padding:24px 16px}
main{width:100%;max-width:680px}
h1{font-size:1.35rem;margin:8px 0 2px}
.sub{margin:0 0 18px;color:var(--muted);font-size:.9rem}
.banner{border-radius:14px;padding:14px 16px;font-weight:700;margin-bottom:16px;background:var(--idle-bg);color:var(--idle)}
.banner[data-tone=ok]{background:var(--ok-bg);color:var(--ok)}
.banner[data-tone=bad]{background:var(--bad-bg);color:var(--bad)}
.banner[data-tone=warn]{background:var(--warn-bg);color:var(--warn)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.label{color:var(--muted);font-size:.82rem}
.value{font-size:1.15rem;font-weight:700;margin:2px 0}
.value[data-tone=ok]{color:var(--ok)}
.value[data-tone=bad]{color:var(--bad)}
.value[data-tone=warn]{color:var(--warn)}
.hint{font-size:.82rem;color:var(--muted);min-height:1.6em;overflow-wrap:anywhere}
.row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:16px}
button{font:inherit;font-weight:700;background:var(--accent);color:#fff;border:0;border-radius:10px;padding:9px 18px;cursor:pointer}
button:disabled{opacity:.6;cursor:progress}
button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.meta{color:var(--muted);font-size:.82rem}
footer{margin-top:22px;color:var(--muted);font-size:.78rem}
bdi{unicode-bidi:isolate}
</style>
</head>
<body>
<main>
<h1>وضعیت بک‌اند تدبیر</h1>
<p class="sub">این صفحه مستقل از پنل است و فقط وضعیت سرویس API را نشان می‌دهد.</p>

<div id="banner" class="banner" data-tone="idle" role="status" aria-live="polite">در حال بررسی…</div>

<section class="grid" aria-label="وضعیت سرویس‌ها">
<div class="card"><div class="label">اتصال API</div><div id="api-value" class="value">در حال بررسی…</div><div id="api-hint" class="hint"></div></div>
<div class="card"><div class="label">اتصال دیتابیس</div><div id="db-value" class="value">در حال بررسی…</div><div id="db-hint" class="hint"></div></div>
<div class="card"><div class="label">زمان سرور (وقت تهران)</div><div id="time-value" class="value">نامشخص</div><div class="hint">از پاسخ سلامت API خوانده می‌شود.</div></div>
<div class="card"><div class="label">نسخهٔ API</div><div id="ver-value" class="value">نامشخص</div><div id="ver-hint" class="hint"></div></div>
</section>

<div class="row">
<button id="refresh" type="button">بررسی مجدد</button>
<span id="checked" class="meta">هنوز بررسی نشده</span>
</div>

<noscript><p class="hint">برای نمایش وضعیت زنده، جاوااسکریپت مرورگر باید فعال باشد. در صورت پاسخ‌گویی این صفحه، وب‌سرور بک‌اند در دسترس است.</p></noscript>

<footer>بررسی فقط هنگام باز شدن صفحه و با دکمهٔ «بررسی مجدد» انجام می‌شود؛ هیچ بررسی خودکار دوره‌ای وجود ندارد. این صفحه اطلاعات محرمانه، تنظیمات یا خطاهای داخلی سرور را نمایش نمی‌دهد.</footer>
</main>

<script nonce="__NONCE__">
(function () {
  'use strict';
  var TIMEOUT_MS = 10000;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('fa-IR');
  var lastCheckedAt = 0;

  var LABELS = { ok: 'سالم', down: 'قطع', unreachable: 'در دسترس نیست', invalid: 'پاسخ نامعتبر', unknown: 'نامشخص', skipped: 'بررسی نشد' };
  var TONES = { ok: 'ok', down: 'bad', unreachable: 'bad', invalid: 'warn', unknown: 'warn', skipped: 'idle' };

  function setTile(prefix, state, hint) {
    var v = $(prefix + '-value');
    v.textContent = LABELS[state];
    v.setAttribute('data-tone', TONES[state]);
    $(prefix + '-hint').textContent = hint || '';
  }

  function probe(path) {
    var started = performance.now();
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    return fetch(path, { method: 'GET', cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal: ctl.signal })
      .then(function (res) {
        var ms = Math.round(performance.now() - started);
        return res.json().catch(function () { return null; }).then(function (body) {
          if (res.ok) {
            var good = body && typeof body === 'object' && body.ok === true;
            return { state: good ? 'ok' : 'invalid', body: good ? body : null, ms: ms };
          }
          if (res.status === 503) return { state: 'down', body: null, ms: ms };
          if (res.status === 502) return { state: 'invalid', body: null, ms: ms };
          if (res.status === 408) return { state: 'unreachable', body: null, ms: ms };
          return { state: 'unknown', body: null, ms: ms };
        });
      })
      .catch(function () { return { state: 'unreachable', body: null, ms: Math.round(performance.now() - started) }; })
      .then(function (r) { clearTimeout(timer); return r; });
  }

  function formatTime(value) {
    if (typeof value !== 'string') return 'نامشخص';
    var d = new Date(value);
    if (isNaN(d.getTime())) return 'نامشخص';
    try {
      return new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
    } catch (e) { return 'نامشخص'; }
  }

  function banner(api, db) {
    var el = $('banner');
    var text, tone;
    if (api === 'ok' && db === 'ok') { text = 'بک‌اند در دسترس است و به دیتابیس وصل است.'; tone = 'ok'; }
    else if (api === 'unreachable') { text = 'ارتباط با بک‌اند برقرار نشد. وضعیت دیتابیس بررسی نشد.'; tone = 'bad'; }
    else if (api === 'ok' && db === 'down') { text = 'API پاسخ می‌دهد اما اتصال به دیتابیس برقرار نیست.'; tone = 'bad'; }
    else { text = 'پاسخ بک‌اند غیرعادی است؛ وضعیت هر بخش را در کارت‌ها ببینید.'; tone = 'warn'; }
    el.textContent = text;
    el.setAttribute('data-tone', tone);
  }

  function updateChecked() {
    var el = $('checked');
    if (!lastCheckedAt) { el.textContent = 'هنوز بررسی نشده'; return; }
    var sec = Math.max(0, Math.round((Date.now() - lastCheckedAt) / 1000));
    el.textContent = sec < 5 ? 'آخرین بررسی: همین الان' : 'آخرین بررسی: ' + nf.format(sec < 60 ? sec : Math.floor(sec / 60)) + (sec < 60 ? ' ثانیه' : ' دقیقه') + ' پیش';
  }

  var running = false;
  function run() {
    if (running) return;
    running = true;
    var btn = $('refresh');
    btn.disabled = true;
    btn.textContent = 'در حال بررسی…';

    probe('/api/v1/health').then(function (api) {
      var apiHint = api.state === 'ok' ? 'زمان پاسخ: ' + nf.format(api.ms) + ' میلی‌ثانیه'
        : api.state === 'unreachable' ? 'ارتباط با سرور برقرار نشد یا پاسخ دیر رسید.'
        : api.state === 'invalid' ? 'پاسخ سرور مطابق قرارداد سلامت نبود.'
        : 'سرور پاسخ غیرمنتظره داد.';
      setTile('api', api.state, apiHint);
      $('time-value').textContent = api.state === 'ok' ? formatTime(api.body.time) : 'نامشخص';
      var ver = api.state === 'ok' && typeof api.body.version === 'string' && api.body.version !== '' ? api.body.version : '';
      $('ver-value').textContent = ver || 'نامشخص';
      $('ver-hint').textContent = api.state === 'ok' && api.body.service === 'tadbir-api' ? 'سرویس: tadbir-api' : '';

      if (api.state === 'unreachable') {
        setTile('db', 'skipped', 'تا برقراری ارتباط با سرور، وضعیت دیتابیس بررسی نمی‌شود.');
        return { api: api.state, db: 'skipped' };
      }
      return probe('/api/v1/health/db').then(function (db) {
        var dbHint = db.state === 'ok' ? 'زمان پاسخ: ' + nf.format(db.ms) + ' میلی‌ثانیه'
          : db.state === 'down' ? 'اتصال دیتابیس برقرار نشد؛ این مورد نیازمند بررسی مدیر سیستم است.'
          : db.state === 'unreachable' ? 'ارتباط با سرور در حین بررسی دیتابیس قطع شد.'
          : 'پاسخ بررسی دیتابیس مطابق قرارداد نبود.';
        setTile('db', db.state, dbHint);
        return { api: api.state, db: db.state };
      });
    }).then(function (s) {
      banner(s.api, s.db);
      lastCheckedAt = Date.now();
      updateChecked();
    }).catch(function () {
      $('banner').textContent = 'بررسی کامل نشد؛ دوباره تلاش کنید.';
      $('banner').setAttribute('data-tone', 'warn');
    }).then(function () {
      running = false;
      btn.disabled = false;
      btn.textContent = 'بررسی مجدد';
    });
  }

  $('refresh').addEventListener('click', run);
  // فقط برای تازه‌سازی متن «چند ثانیه پیش»؛ هیچ درخواست شبکه‌ای نمی‌فرستد.
  setInterval(updateChecked, 15000);
  run();
})();
</script>
</body>
</html>
HTML;
    }
}
