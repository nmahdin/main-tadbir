<?php

namespace App\Modules\Projects\Services;

use RuntimeException;
use ZipArchive;

/**
 * UX-02-3-FINAL XLSX writer (no spreadsheet package exists in
 * composer.lock and the lock cannot be regenerated offline, so the
 * export is produced with PHP's bundled ZipArchive + hand-built,
 * minimal OOXML). Safety properties:
 *  - every text cell is written as an inline string (t="inlineStr"),
 *    so a value starting with "=", "+", "-" or "@" can never become
 *    an executable formula cell — formula injection is impossible
 *    by construction (the CSV writer additionally '-prefixes);
 *  - output is a single worksheet, bounded by the caller;
 *  - Persian text is plain UTF-8 XML (no BOM needed in OOXML).
 * Returns the file bytes; throws RuntimeException when ext-zip is
 * unavailable so the controller can answer an honest 501.
 */
final class ProjectXlsxExporter
{
    public static function available(): bool
    {
        return extension_loaded('zip') && class_exists(ZipArchive::class);
    }

    /**
     * @param  list<string>  $headers
     * @param  list<list<string|int|float|null>>  $rows
     */
    public static function build(array $headers, array $rows, string $sheetName = 'پروژه‌ها'): string
    {
        if (!self::available()) {
            throw new RuntimeException('xlsx_unavailable');
        }

        $path = tempnam(sys_get_temp_dir(), 'tadbir-xlsx-');
        if ($path === false) {
            throw new RuntimeException('xlsx_unavailable');
        }

        try {
            $zip = new ZipArchive;
            if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('xlsx_unavailable');
            }
            $zip->addFromString('[Content_Types].xml', self::contentTypes());
            $zip->addFromString('_rels/.rels', self::rootRels());
            $zip->addFromString('xl/workbook.xml', self::workbook($sheetName));
            $zip->addFromString('xl/_rels/workbook.xml.rels', self::workbookRels());
            $zip->addFromString('xl/styles.xml', self::styles());
            $zip->addFromString('xl/worksheets/sheet1.xml', self::sheet($headers, $rows, count($headers)));
            $zip->close();

            $bytes = file_get_contents($path);
            if ($bytes === false) {
                throw new RuntimeException('xlsx_unavailable');
            }

            return $bytes;
        } finally {
            @unlink($path);
        }
    }

    /** Excel column letters for a 1-based index (A, B, …, Z, AA, …). */
    private static function columnLetter(int $index): string
    {
        $letters = '';
        while ($index > 0) {
            $index--;
            $letters = chr(65 + ($index % 26)).$letters;
            $index = intdiv($index, 26);
        }

        return $letters;
    }

    private static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private static function contentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .'</Types>';
    }

    private static function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>';
    }

    private static function workbook(string $sheetName): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets><sheet name="'.self::esc($sheetName).'" sheetId="1" r:id="rId1"/></sheets>'
            .'</workbook>';
    }

    private static function workbookRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            .'</Relationships>';
    }

    private static function styles(): string
    {
        // Style 1 = bold header with the canonical Ocean fill.
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            .'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFDCE9ED"/></patternFill></fill></fills>'
            .'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
            .'</styleSheet>';
    }

    /**
     * @param  list<string>  $headers
     * @param  list<list<string|int|float|null>>  $rows
     */
    private static function sheet(array $headers, array $rows, int $columnCount): string
    {
        $cols = '';
        for ($i = 1; $i <= $columnCount; $i++) {
            $cols .= '<col min="'.$i.'" max="'.$i.'" width="22" customWidth="1"/>';
        }

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>'
            .'<cols>'.$cols.'</cols>'
            .'<sheetData>';

        $xml .= '<row r="1">';
        foreach ($headers as $i => $header) {
            $ref = self::columnLetter($i + 1).'1';
            $xml .= '<c r="'.$ref.'" s="1" t="inlineStr"><is><t>'.self::esc((string) $header).'</t></is></c>';
        }
        $xml .= '</row>';

        $rowNumber = 1;
        foreach ($rows as $row) {
            $rowNumber++;
            $xml .= '<row r="'.$rowNumber.'">';
            foreach (array_values($row) as $i => $value) {
                $ref = self::columnLetter($i + 1).$rowNumber;
                if (is_int($value) || is_float($value)) {
                    $xml .= '<c r="'.$ref.'"><v>'.$value.'</v></c>';
                } else {
                    $xml .= '<c r="'.$ref.'" t="inlineStr"><is><t>'.self::esc((string) ($value ?? '')).'</t></is></c>';
                }
            }
            $xml .= '</row>';
        }

        return $xml.'</sheetData></worksheet>';
    }
}
