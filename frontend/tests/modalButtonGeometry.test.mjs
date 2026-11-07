import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const primitives = readFileSync(new URL('../src/components/common/Primitives.tsx', import.meta.url), 'utf8');

const modalFiles = [
  'thought-room/CreateIdeaModal',
  'thought-room/CreateMeetingModal',
  'thought-room/IdeaDetailsModal',
  'thought-room/MeetingMinutesModal',
  'thought-room/ConvertToProjectModal',
  'thought-room/ConvertToTaskModal',
  'secretariat/CreateDossierModal',
  'secretariat/CreateLetterModal',
  'secretariat/CreateResolutionModal',
  'secretariat/LetterArchiveModal',
  'secretariat/LetterDetailsModal',
  'secretariat/LetterReferralModal',
  'secretariat/LetterReplyModal',
  'dam/AssetDetailsDrawer',
  'auth/AuthModal',
  'content/EditContentModal',
];

/**
 * دور ۶۱: همهٔ دکمه‌های مدال‌ها دقیقاً ۳۶ پیکسل ارتفاع دارند.
 * `.ui-button` پدینگ عمودی ۱۰px با خط ۲۰px داشت و به ۴۰px می‌رسید؛ دکمه‌های
 * خام مدال (ورود، ارسال نامه) هم با `py-3`/`py-2.5` بلندتر می‌شدند.
 */
test('دکمه‌های مشترک و دکمه‌های اقدام در مدال‌ها ۳۶px هستند', () => {
  const uiButton = css.match(/\.ui-button \{([^}]*)\}/)?.[1] || '';
  assert.match(uiButton, /min-height: var\(--button-height\)/);
  // ۲۰px خط + ۲×۸px پدینگ عمودی = ۳۶px
  assert.match(uiButton, /padding: \.5rem 1rem/);
  assert.match(uiButton, /line-height: 1\.25rem/);

  const action = css.match(/\.ui-form-action,\s*\n\[data-button-action\],[\s\S]*?\{([^}]*)\}/)?.[1] || '';
  assert.match(action, /min-height: var\(--button-height\)/);
  assert.match(action, /padding-top: \.5rem/);
  assert.match(action, /padding-bottom: \.5rem/);
  assert.match(action, /box-sizing: border-box/);

  // دکمهٔ آیکونی و دکمه‌های فرم هم همان توکن ۳۶px را می‌گیرند.
  assert.match(css, /\.ui-icon-button \{[^}]*height: var\(--button-height\)/);
  assert.match(css, /--form-action-min-height: var\(--button-height\)/);
  assert.match(primitives, /className=\{`ui-button ui-button-\$\{variant\} \$\{actionClass\} \$\{className\}`\}/);
});

test('هیچ دکمه‌ای در مدال‌ها از ۳۶px بلندتر نمی‌شود', () => {
  for (const file of modalFiles) {
    const src = readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), 'utf8');

    for (const tag of src.match(/<button\b[\s\S]*?>/g) || []) {
      if (/ui-form-action|data-button-action/.test(tag)) {
        // پدینگ عمودی دکمه‌های اکشن از CSS می‌آید؛ کلاس محلی آن را به هم نزند.
        assert.doesNotMatch(tag, /\bpy-[2-9]|!py-[2-9]/, `${file}: پدینگ عمودی بزرگ روی دکمهٔ اکشن`);
      } else {
        // دکمهٔ خام مدال با پدینگ/ارتفاع بزرگ از سقف ۳۶px بیرون می‌زند.
        assert.doesNotMatch(tag, /\bpy-3\b|\bh-1[0-4]\b|\bmin-h-\[/, `${file}: دکمهٔ بلندتر از ۳۶px بدون نشانهٔ اکشن`);
      }
    }
  }
});
