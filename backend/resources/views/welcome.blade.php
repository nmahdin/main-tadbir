<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta http-equiv="refresh" content="30">
    <title>وضعیت سامانه تدبیر</title>
    <style>
        @font-face {
            font-family: Vazirmatn;
            src: url('/fonts/vazirmatn-arabic-variable.woff2') format('woff2');
            font-style: normal;
            font-weight: 100 900;
            font-display: swap;
        }
        :root {
            --ink: #172033;
            --muted: #687386;
            --line: #e6eaf0;
            --surface: #ffffff;
            --canvas: #f5f7fb;
            --primary: #4f46e5;
            --primary-dark: #3730a3;
            --success: #059669;
            --success-soft: #ecfdf5;
            --danger: #dc2626;
            --danger-soft: #fff1f2;
            --warning: #d97706;
            --warning-soft: #fffbeb;
            --radius: 20px;
            --shadow: 0 16px 36px rgba(30, 41, 59, .08), 0 2px 0 rgba(30, 41, 59, .03);
        }
        * { box-sizing: border-box; }
        html { background: var(--canvas); }
        body {
            margin: 0;
            min-height: 100vh;
            color: var(--ink);
            background:
                radial-gradient(circle at 8% 4%, rgba(99, 102, 241, .08), transparent 25rem),
                radial-gradient(circle at 92% 18%, rgba(14, 165, 233, .06), transparent 28rem),
                var(--canvas);
            font-family: Vazirmatn, Tahoma, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        a { color: inherit; }
        .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 34px; }
        .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .brand { display: flex; align-items: center; gap: 11px; }
        .brand-mark {
            width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px;
            color: #fff; background: linear-gradient(145deg, #6366f1, #4338ca);
            box-shadow: 0 9px 18px rgba(79, 70, 229, .23), inset 0 1px rgba(255, 255, 255, .28);
        }
        .brand-mark svg { width: 23px; height: 23px; }
        .brand strong { display: block; font-size: 15px; font-weight: 900; }
        .brand span { color: var(--muted); font-size: 11px; }
        .icon-button {
            width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid #dde2eb;
            border-radius: 13px; color: #556177; background: linear-gradient(#fff, #f8fafc);
            box-shadow: 0 3px 0 rgba(30, 41, 59, .05); text-decoration: none;
            transition: transform .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
        }
        .icon-button:hover { transform: translateY(-2px); border-color: #c7d2fe; color: var(--primary); box-shadow: 0 8px 18px rgba(30, 41, 59, .1); }
        .icon-button:active { transform: translateY(0); }
        .icon-button svg { width: 18px; height: 18px; }
        .hero {
            position: relative; overflow: hidden; padding: 30px; border-radius: 28px; color: white;
            background: linear-gradient(120deg, #182237 0%, #28345c 58%, #4338ca 120%);
            box-shadow: 0 22px 46px rgba(30, 41, 59, .2), inset 0 1px rgba(255,255,255,.12);
        }
        .hero::before, .hero::after { content: ''; position: absolute; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; }
        .hero::before { width: 270px; height: 270px; left: -80px; top: -170px; }
        .hero::after { width: 190px; height: 190px; left: 30px; bottom: -160px; }
        .hero-content { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: space-between; gap: 22px; }
        .eyebrow { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #c7d2fe; font-size: 11px; font-weight: 800; }
        .eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #818cf8; box-shadow: 0 0 0 5px rgba(129, 140, 248, .13); }
        h1 { margin: 0; font-size: clamp(24px, 3vw, 36px); line-height: 1.45; font-weight: 950; letter-spacing: -.5px; }
        .hero p { max-width: 650px; margin: 8px 0 0; color: #cbd5e1; font-size: 13px; line-height: 2; }
        .overall {
            min-width: 220px; padding: 15px 17px; border: 1px solid rgba(255,255,255,.14); border-radius: 18px;
            background: rgba(255,255,255,.08); backdrop-filter: blur(9px);
        }
        .overall-label { color: #cbd5e1; font-size: 10px; }
        .overall-state { display: flex; align-items: center; gap: 9px; margin-top: 7px; font-size: 15px; font-weight: 900; }
        .pulse { width: 10px; height: 10px; border-radius: 50%; background: {{ $healthy ? '#34d399' : '#fb7185' }}; box-shadow: 0 0 0 0 {{ $healthy ? 'rgba(52,211,153,.45)' : 'rgba(251,113,133,.45)' }}; animation: pulse 1.9s infinite; }
        @keyframes pulse { 70% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 18px; }
        .stat-card {
            position: relative; min-height: 168px; padding: 20px; overflow: hidden; border: 1px solid var(--line);
            border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow);
            transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .stat-card:hover { transform: translateY(-3px); border-color: #d5daf5; box-shadow: 0 22px 42px rgba(30, 41, 59, .12); }
        .stat-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .stat-title { color: var(--muted); font-size: 11px; font-weight: 800; }
        .stat-icon { width: 39px; height: 39px; display: grid; place-items: center; border-radius: 13px; }
        .stat-icon svg { width: 19px; height: 19px; }
        .tone-green { color: #047857; background: #ecfdf5; }
        .tone-indigo { color: #4f46e5; background: #eef2ff; }
        .tone-sky { color: #0369a1; background: #f0f9ff; }
        .tone-amber { color: #b45309; background: #fffbeb; }
        .stat-value { margin-top: 22px; font-size: 25px; line-height: 1; font-weight: 950; letter-spacing: -.4px; }
        .stat-caption { margin-top: 10px; color: var(--muted); font-size: 10px; line-height: 1.8; }
        .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 9px; font-size: 9px; font-weight: 900; }
        .chip-ok { color: #047857; background: var(--success-soft); }
        .chip-bad { color: #be123c; background: var(--danger-soft); }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .content-grid { display: grid; grid-template-columns: 1.18fr .82fr; gap: 16px; margin-top: 16px; }
        .panel { padding: 22px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); }
        .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 19px; }
        .panel-title { display: flex; align-items: center; gap: 9px; }
        .panel-title-icon { width: 34px; height: 34px; display: grid; place-items: center; color: var(--primary); border-radius: 11px; background: #eef2ff; }
        .panel-title-icon svg { width: 17px; height: 17px; }
        .panel h2 { margin: 0; font-size: 14px; font-weight: 950; }
        .panel-note { color: #98a1b1; font-size: 9px; }
        .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .check-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px; border: 1px solid #edf0f4; border-radius: 14px; background: #fafbfc; }
        .check-name { display: flex; align-items: center; gap: 8px; color: #3d485c; font-size: 11px; font-weight: 800; }
        .check-name i { width: 8px; height: 8px; border-radius: 50%; }
        .check-value { color: var(--muted); font-size: 10px; font-weight: 700; white-space: nowrap; }
        .progress-group { margin-top: 18px; }
        .progress-row + .progress-row { margin-top: 14px; }
        .progress-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; color: var(--muted); font-size: 10px; font-weight: 700; }
        .track { height: 7px; overflow: hidden; border-radius: 999px; background: #edf0f5; }
        .bar { height: 100%; min-width: 2px; border-radius: inherit; background: linear-gradient(90deg, #818cf8, #4f46e5); }
        .bar-danger { background: linear-gradient(90deg, #fb7185, #e11d48); }
        .details { display: grid; gap: 2px; }
        .detail-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 3px; border-bottom: 1px dashed #e9edf2; }
        .detail-row:last-child { border: 0; }
        .detail-label { color: var(--muted); font-size: 10px; }
        .detail-value { direction: ltr; color: #344054; font-size: 10px; font-weight: 900; text-align: left; }
        .footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 17px; padding: 0 5px; color: #8590a2; font-size: 9px; }
        .footer-links { display: flex; gap: 7px; }
        .footer a { padding: 6px 9px; border-radius: 9px; text-decoration: none; background: #fff; border: 1px solid var(--line); transition: color .16s, border-color .16s; }
        .footer a:hover { color: var(--primary); border-color: #c7d2fe; }
        @media (max-width: 950px) {
            .summary-grid { grid-template-columns: repeat(2, 1fr); }
            .content-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 650px) {
            .shell { width: min(100% - 20px, 1180px); padding-top: 14px; }
            .hero { padding: 22px; border-radius: 22px; }
            .hero-content { align-items: stretch; flex-direction: column; }
            .overall { min-width: 0; }
            .summary-grid { grid-template-columns: 1fr; gap: 10px; }
            .stat-card { min-height: 146px; }
            .checks { grid-template-columns: 1fr; }
            .panel { padding: 17px; }
            .footer { align-items: flex-start; flex-direction: column; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    </style>
</head>
<body>
@php
    $fa = static fn ($value) => strtr((string) $value, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']);
    $diskPercent = $server['disk_used_percent'] ?? 0;
    $errorPercent = min(100, max(0, $metrics['error_rate']));
@endphp
<main class="shell">
    <div class="topbar">
        <div class="brand">
            <div class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V8l8-4 8 4v11"/><path d="M8 19v-6h8v6M3 19h18"/></svg>
            </div>
            <div><strong>سامانه تدبیر</strong><span>پایش سرویس بک‌اند</span></div>
        </div>
        <a class="icon-button" href="/" aria-label="به‌روزرسانی وضعیت" title="به‌روزرسانی وضعیت">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 11M20 13l-2.2 4.8A7 7 0 0 1 5.5 15"/></svg>
        </a>
    </div>

    <section class="hero">
        <div class="hero-content">
            <div>
                <div class="eyebrow"><i></i><span>داشبورد زنده زیرساخت</span></div>
                <h1>وضعیت عملیاتی سامانه</h1>
                <p>نمای یکپارچهٔ اتصال پایگاه داده، ترافیک درخواست‌ها، سرعت پاسخ و منابع سرور. اطلاعات این صفحه هر ۳۰ ثانیه به‌صورت خودکار تازه می‌شود.</p>
            </div>
            <div class="overall">
                <div class="overall-label">وضعیت کلی سرویس</div>
                <div class="overall-state"><span class="pulse"></span><span>{{ $healthy ? 'تمام سرویس‌های اصلی فعال‌اند' : 'بخشی از سرویس نیازمند بررسی است' }}</span></div>
            </div>
        </div>
    </section>

    <section class="summary-grid" aria-label="خلاصه وضعیت">
        <article class="stat-card">
            <div class="stat-head">
                <span class="stat-title">پایگاه داده</span>
                <span class="stat-icon {{ $databaseConnected ? 'tone-green' : 'tone-amber' }}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg></span>
            </div>
            <div class="stat-value">{{ $databaseConnected ? 'متصل' : 'قطع' }}</div>
            <div class="stat-caption">
                <span class="chip {{ $databaseConnected ? 'chip-ok' : 'chip-bad' }}"><i class="dot"></i>{{ $databaseConnected ? 'پاسخ‌گو' : 'نیازمند بررسی' }}</span>
                @if($databaseLatencyMs !== null)<span> · {{ $fa($databaseLatencyMs) }} میلی‌ثانیه</span>@endif
            </div>
        </article>

        <article class="stat-card">
            <div class="stat-head">
                <span class="stat-title">درخواست‌های امروز</span>
                <span class="stat-icon tone-indigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/><path d="M2 19h20"/></svg></span>
            </div>
            <div class="stat-value">{{ $fa(number_format($metrics['requests_today'])) }}</div>
            <div class="stat-caption">{{ $fa(number_format($metrics['requests_five_minutes'])) }} درخواست در پنج دقیقهٔ اخیر</div>
        </article>

        <article class="stat-card">
            <div class="stat-head">
                <span class="stat-title">میانگین سرعت پاسخ</span>
                <span class="stat-icon tone-sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 13a8 8 0 1 1-3-6.2"/><path d="M12 12l5-5M15 3h4v4"/></svg></span>
            </div>
            <div class="stat-value">{{ $fa($metrics['average_ms']) }} <small style="font-size:11px;color:#7b8798">ms</small></div>
            <div class="stat-caption">بر پایهٔ پاسخ‌های ثبت‌شده در امروز</div>
        </article>

        <article class="stat-card">
            <div class="stat-head">
                <span class="stat-title">خطاهای سرور</span>
                <span class="stat-icon tone-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/></svg></span>
            </div>
            <div class="stat-value">{{ $fa(number_format($metrics['errors_today'])) }}</div>
            <div class="stat-caption">نرخ خطای امروز: {{ $fa($metrics['error_rate']) }} درصد</div>
        </article>
    </section>

    <section class="content-grid">
        <article class="panel">
            <div class="panel-head">
                <div class="panel-title"><span class="panel-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7 9 18l-5-5"/></svg></span><h2>بررسی سرویس‌های اصلی</h2></div>
                <span class="panel-note">پایش لحظه‌ای</span>
            </div>
            <div class="checks">
                <div class="check-row"><span class="check-name"><i style="background:#10b981"></i>هستهٔ API</span><span class="check-value">فعال</span></div>
                <div class="check-row"><span class="check-name"><i style="background:{{ $databaseConnected ? '#10b981' : '#f43f5e' }}"></i>پایگاه داده</span><span class="check-value">{{ $databaseConnected ? 'متصل' : 'قطع' }}</span></div>
                <div class="check-row"><span class="check-name"><i style="background:{{ $server['secure_transport'] ? '#10b981' : '#f59e0b' }}"></i>ارتباط امن</span><span class="check-value">{{ $server['secure_transport'] ? 'HTTPS' : 'HTTP' }}</span></div>
                <div class="check-row"><span class="check-name"><i style="background:#10b981"></i>صف پردازش</span><span class="check-value">{{ $server['queue'] }}</span></div>
            </div>
            <div class="progress-group">
                <div class="progress-row">
                    <div class="progress-label"><span>فضای دیسک مصرف‌شده</span><span>{{ $server['disk_used_percent'] !== null ? $fa($server['disk_used_percent']).'٪' : 'نامشخص' }}</span></div>
                    <div class="track"><div class="bar {{ $diskPercent >= 90 ? 'bar-danger' : '' }}" style="width:{{ min(100, max(0, $diskPercent)) }}%"></div></div>
                </div>
                <div class="progress-row">
                    <div class="progress-label"><span>نرخ خطای پاسخ‌های امروز</span><span>{{ $fa($metrics['error_rate']) }}٪</span></div>
                    <div class="track"><div class="bar {{ $errorPercent > 5 ? 'bar-danger' : '' }}" style="width:{{ $errorPercent }}%"></div></div>
                </div>
            </div>
        </article>

        <aside class="panel">
            <div class="panel-head">
                <div class="panel-title"><span class="panel-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 9h.01M11 9h6M7 13h.01M11 13h6"/></svg></span><h2>مشخصات اجرا</h2></div>
            </div>
            <div class="details">
                <div class="detail-row"><span class="detail-label">نسخه Laravel</span><span class="detail-value">{{ $server['laravel_version'] }}</span></div>
                <div class="detail-row"><span class="detail-label">نسخه PHP</span><span class="detail-value">{{ $server['php_version'] }}</span></div>
                <div class="detail-row"><span class="detail-label">محیط اجرا</span><span class="detail-value">{{ $server['environment'] }}</span></div>
                <div class="detail-row"><span class="detail-label">حافظهٔ مصرفی / اوج</span><span class="detail-value">{{ $server['memory_used'] }} / {{ $server['memory_peak'] }}</span></div>
                <div class="detail-row"><span class="detail-label">سقف حافظه</span><span class="detail-value">{{ $server['memory_limit'] }}</span></div>
                <div class="detail-row"><span class="detail-label">فضای آزاد دیسک</span><span class="detail-value">{{ $server['disk_free'] ?? 'N/A' }}</span></div>
                <div class="detail-row"><span class="detail-label">بار یک‌دقیقه‌ای سرور</span><span class="detail-value">{{ $server['load_one_minute'] !== null ? $server['load_one_minute'] : 'N/A' }}</span></div>
            </div>
        </aside>
    </section>

    <footer class="footer">
        <span>آخرین به‌روزرسانی: {{ $fa($updatedAt->format('Y/m/d - H:i:s')) }} · تازه‌سازی خودکار هر {{ $fa(30) }} ثانیه</span>
        <span class="footer-links"><a href="/api/v1/health">سلامت API</a><a href="/api/v1/health/db">سلامت دیتابیس</a></span>
    </footer>
</main>
</body>
</html>
