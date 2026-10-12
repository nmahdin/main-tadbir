<?php

namespace Tests\Unit;

use App\Support\Dam\DamRichText;
use PHPUnit\Framework\TestCase;

class DamRichTextTest extends TestCase
{
    public function test_it_preserves_the_supported_rich_text_subset(): void
    {
        $html = '<h2 style="text-align: center; color: #1e3a8a; position: fixed">عنوان</h2>'
            .'<p><strong>متن</strong> <a href="https://example.com/path" onclick="alert(1)">پیوند</a></p>';

        $clean = DamRichText::sanitize($html);

        $this->assertStringContainsString('<h2 style="text-align: center; color: #1e3a8a">عنوان</h2>', $clean);
        $this->assertStringContainsString('<strong>متن</strong>', $clean);
        $this->assertStringContainsString('href="https://example.com/path"', $clean);
        $this->assertStringContainsString('rel="noopener noreferrer"', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('position', $clean);
    }

    public function test_it_removes_executable_markup_and_unsafe_links(): void
    {
        $html = '<script>alert(1)</script><p onmouseover="alert(2)">امن</p>'
            .'<a href="&#106;avascript:alert(3)">خطرناک</a><iframe src="https://example.com">داخل</iframe>';

        $clean = DamRichText::sanitize($html);

        $this->assertSame('<p>امن</p><a>خطرناک</a>', $clean);
        $this->assertStringNotContainsString('alert', $clean);
        $this->assertStringNotContainsString('iframe', $clean);
    }

    public function test_plain_text_is_derived_from_sanitized_content(): void
    {
        $html = '<h1>عنوان</h1><p>خط <b>اول</b><br>خط دوم</p><ul><li>گزینه</li></ul>';

        $plain = DamRichText::plainText($html);

        $this->assertSame("عنوان\nخط اول\nخط دوم\nگزینه", $plain);
    }
}
