<?php

namespace App\Support\Storage;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * پشتیبان‌گیری و بازگردانی دیتابیس بدون هیچ وابستگی بیرونی.
 *
 * روی هاست اشتراکی معمولاً SSH و mysqldump در دسترس نیست؛ این کلاس با PDO و
 * همان اتصال خودِ برنامه دامپ SQL می‌سازد، با gzip فشرده می‌کند و در پوشه‌ای
 * بیرون از نرم‌افزار می‌نویسد. هر پشتیبان یک `manifest.json` کنار خود دارد تا
 * قبل از بازگردانی بتوان اندازه، تعداد جدول‌ها، هش و نسخهٔ schema را دید.
 *
 * نکات ایمنی:
 * - بایت‌های فایل با X'..' نوشته می‌شوند تا متن فارسی/دودویی خراب نشود.
 * - هر جدول `DROP TABLE IF EXISTS` + `CREATE TABLE` + INSERT دارد، پس
 *   بازگردانی روی همان نصب کاملاً تکرارپذیر است.
 * - گاردها همیشه پیش از هر نوشتن روی دیتابیس فعال می‌شوند (FK و توکن تأیید).
 */
final class DatabaseBackup
{
    public const MANIFEST = 'manifest.json';

    private const CHUNK_ROWS = 400;

    /** @return array{driver:string,tables:string[],rows:int} */
    public function inspect(): array
    {
        $tables = $this->tables();
        $rows = 0;
        foreach ($tables as $table) {
            $rows += (int) $this->pdo()->query('SELECT COUNT(*) FROM '.$this->wrap($table))->fetchColumn();
        }

        return ['driver' => $this->driver(), 'tables' => $tables, 'rows' => $rows];
    }

    /**
     * ساخت یک پشتیبان کامل.
     *
     * @param  array{label?:string, include_files?:bool}  $options
     * @return array{file:string,manifest:string,path:string,bytes:int,sha256:string,tables:int,rows:int,warnings:string[]}
     */
    public function create(array $options = []): array
    {
        $root = StoragePaths::backupRoot();
        $dir = $root.DIRECTORY_SEPARATOR.'db';
        $this->ensureDirectory($dir);

        $label = trim((string) ($options['label'] ?? ''));
        $label = $label === '' ? '' : '-'.$this->slug($label);
        $file = $dir.DIRECTORY_SEPARATOR.'db-'.now()->format('Ymd-His').$label.'.sql.gz';

        $handle = gzopen($file, 'wb9');
        if ($handle === false) {
            throw new RuntimeException('پوشهٔ پشتیبان قابل نوشتن نیست: '.$dir);
        }

        $warnings = [];
        $rows = 0;
        $buffer = '';
        $flush = function (string $sql) use (&$buffer, $handle): void {
            $buffer .= $sql;
            if (strlen($buffer) >= 262144) {
                gzwrite($handle, $buffer);
                $buffer = '';
            }
        };

        try {
            $tables = $this->tables();
            $flush($this->header($tables));

            foreach ($tables as $table) {
                $flush($this->createStatement($table));
                $rows += $this->dumpRows($table, $flush);
            }

            $flush($this->footer());
            if ($buffer !== '') {
                gzwrite($handle, $buffer);
            }
        } finally {
            gzclose($handle);
        }

        $bytes = (int) (filesize($file) ?: 0);
        $sha256 = (string) hash_file('sha256', $file);

        $manifest = [
            'created_at' => now()->toIso8601String(),
            'app_name' => (string) config('app.name'),
            'app_env' => (string) config('app.env'),
            'app_url' => (string) config('app.url'),
            'driver' => $this->driver(),
            'database' => $this->databaseName(),
            'tables' => count($tables),
            'rows' => $rows,
            'bytes' => $bytes,
            'sha256' => $sha256,
            'migrations' => $this->lastMigrations(),
            'files_root' => StoragePaths::filesRoot(),
            'files_root_external' => ! StoragePaths::isInsideApplication(StoragePaths::filesRoot()),
            'backup_root' => $root,
            'include_files' => (bool) ($options['include_files'] ?? false),
            'php' => PHP_VERSION,
        ];

        if (StoragePaths::isInsideApplication($root)) {
            $warnings[] = 'پوشهٔ پشتیبان داخل پوشهٔ نرم‌افزار است؛ برای نصب با اطمینان، TADBIR_FILES_ROOT یا TADBIR_BACKUP_ROOT را به بیرون نرم‌افزار ببرید.';
        }
        if (! StoragePaths::isInsideApplication(StoragePaths::filesRoot())) {
            $warnings[] = 'ریشهٔ فایل‌ها بیرون نرم‌افزار است؛ فایل‌های آپلودی در این پشتیبان نیستند و باید جداگانه (tar) پشتیبان گرفته شوند.';
        }

        if (($options['include_files'] ?? false) === true) {
            $tar = $this->archiveFiles($manifest['created_at']);
            if ($tar) {
                $manifest['files_archive'] = $tar;
                $manifest['files_archive_bytes'] = (int) (filesize($tar) ?: 0);
                $manifest['files_archive_sha256'] = (string) hash_file('sha256', $tar);
            } else {
                $warnings[] = 'پشتیبان فایل‌ها ساخته نشد؛ دستور tar روی این هاست در دسترس نیست. دستور دستی در docs/storage-and-backup.md آمده است.';
            }
        }

        $manifest = array_merge($manifest, ['warnings' => $warnings]);
        file_put_contents($this->manifestPath($file), json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        $this->prune((int) config('tadbir.backup_keep', 5));

        return [
            'file' => basename($file),
            'manifest' => basename($this->manifestPath($file)),
            'path' => $file,
            'bytes' => $bytes,
            'sha256' => $sha256,
            'tables' => count($tables),
            'rows' => $rows,
            'warnings' => $warnings,
        ];
    }

    /** فهرست پشتیبان‌های موجود، تازه‌ترین اول. */
    public function list(): array
    {
        $dir = StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db';
        if (! is_dir($dir)) {
            return [];
        }

        $items = [];
        foreach (glob($dir.DIRECTORY_SEPARATOR.'*.sql.gz') ?: [] as $file) {
            $manifestFile = $this->manifestPath($file);
            $manifest = is_file($manifestFile) ? json_decode((string) file_get_contents($manifestFile), true) : null;
            $items[] = [
                'file' => basename($file),
                'bytes' => (int) (filesize($file) ?: 0),
                'created_at' => is_array($manifest) ? ($manifest['created_at'] ?? null) : null,
                'rows' => is_array($manifest) ? ($manifest['rows'] ?? null) : null,
                'tables' => is_array($manifest) ? ($manifest['tables'] ?? null) : null,
                'migrations' => is_array($manifest) ? ($manifest['migrations'] ?? []) : [],
                'verified' => is_array($manifest) && isset($manifest['sha256'])
                    ? hash_file('sha256', $file) === $manifest['sha256']
                    : null,
            ];
        }

        usort($items, fn ($a, $b) => strcmp((string) $b['file'], (string) $a['file']));

        return $items;
    }

    /** پاک‌کردن پشتیبان‌های قدیمی‌تر از `keep` نسخهٔ آخر. */
    public function prune(int $keep): array
    {
        $keep = max(1, $keep);
        $items = $this->list();
        $removed = [];
        foreach (array_slice($items, $keep) as $item) {
            $dir = StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db'.DIRECTORY_SEPARATOR;
            foreach ([$dir.$item['file'], $this->manifestPath($dir.$item['file'])] as $path) {
                if (is_file($path)) {
                    @unlink($path);
                    $removed[] = basename($path);
                }
            }
        }

        return $removed;
    }

    /**
     * بازگردانی یک پشتیبان. پیش از نوشتن، از وضعیت فعلی هم پشتیبان گرفته می‌شود
     * تا بازگردانی خودش قابل بازگشت باشد.
     *
     * @return array{safety:string,statements:int,tables:int}
     */
    public function restore(string $file, bool $confirmed): array
    {
        $path = $this->resolve($file);
        $manifestFile = $this->manifestPath($path);
        $manifest = is_file($manifestFile) ? json_decode((string) file_get_contents($manifestFile), true) : [];

        if (! $confirmed) {
            throw new RuntimeException('بازگردانی نیازمند تأیید صریح است (--confirm='.basename($path).').');
        }
        if (is_array($manifest) && isset($manifest['sha256']) && hash_file('sha256', $path) !== $manifest['sha256']) {
            throw new RuntimeException('هش فایل پشتیبان با manifest یکسان نیست؛ بازگردانی متوقف شد.');
        }
        if (is_array($manifest) && isset($manifest['driver']) && $manifest['driver'] !== $this->driver()) {
            throw new RuntimeException("این پشتیبان برای درایور «{$manifest['driver']}» است و قابل بازگردانی روی «{$this->driver()}» نیست.");
        }

        // فایل پیش از پشتیبان ایمنی باز می‌شود تا سیاست نگه‌داشت نسخه‌ها نتواند
        // همان فایلی را که در حال بازگردانی است حذف کند.
        $handle = gzopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('فایل پشتیبان خوانده نشد.');
        }

        $safety = $this->create(['label' => 'pre-restore']);

        $pdo = $this->pdo();
        $statements = 0;
        $buffer = '';
        $tables = [];

        try {
            while (! gzeof($handle)) {
                $buffer .= (string) gzread($handle, 262144);
                $statementsRun = $this->runCompleted($pdo, $buffer, $statements, $tables);
                $statements = $statementsRun['statements'];
                $buffer = $statementsRun['rest'];
                $tables = $statementsRun['tables'];
            }
            $statementsRun = $this->runCompleted($pdo, $buffer."\n;\n", $statements, $tables);
            $statements = $statementsRun['statements'];
            $tables = $statementsRun['tables'];
        } finally {
            gzclose($handle);
        }

        return ['safety' => $safety['file'], 'statements' => $statements, 'tables' => count(array_unique($tables))];
    }

    /**
     * اجرای دستورهای کامل‌شدهٔ داخل بافر.
     *
     * @return array{statements:int,rest:string,tables:string[]}
     */
    private function runCompleted(\PDO $pdo, string $buffer, int $statements, array $tables): array
    {
        $offset = 0;
        $length = strlen($buffer);
        $start = 0;
        $quote = null;
        $rest = $buffer;

        while ($offset < $length) {
            $char = $buffer[$offset];

            if ($quote !== null) {
                if ($char === '\\' && $quote !== '`') {
                    $offset += 2;
                    continue;
                }
                if ($char === $quote) {
                    $quote = null;
                }
                $offset++;
                continue;
            }

            if ($char === "'" || $char === '"' || $char === '`') {
                $quote = $char;
                $offset++;
                continue;
            }

            if ($char === '-' && substr($buffer, $offset, 2) === '--') {
                $newline = strpos($buffer, "\n", $offset);
                $offset = $newline === false ? $length : $newline + 1;
                continue;
            }

            if ($char === ';') {
                $statement = trim(substr($buffer, $start, $offset - $start));
                $offset++;
                $start = $offset;
                if ($statement !== '') {
                    $pdo->exec($statement);
                    $statements++;
                    if (preg_match('/^CREATE TABLE(?: IF NOT EXISTS)? [`"]?([^`"\s(]+)/i', $statement, $match)) {
                        $tables[] = $match[1];
                    }
                }
                continue;
            }

            $offset++;
        }

        return ['statements' => $statements, 'rest' => $start === 0 ? $buffer : substr($buffer, $start), 'tables' => $tables];
    }

    /**
     * نوشتن ردیف‌ها به‌صورت تکه‌تکه.
     *
     * هر تکه با یک پرس‌وجوی محدود خوانده می‌شود (به‌ترتیب `id` یا با LIMIT/OFFSET)
     * تا هیچ‌گاه کل یک جدول بزرگ در حافظهٔ PHP بافر نشود؛ روی هاست اشتراکی با
     * حافظهٔ محدود همین نکته تفاوت بین موفقیت و خطای memory_limit است.
     *
     * @param  callable(string):void  $flush
     */
    private function dumpRows(string $table, callable $flush): int
    {
        $pdo = $this->pdo();
        $columns = $this->columns($table);
        if ($columns === []) {
            return 0;
        }
        $columnList = implode(', ', array_map(fn (string $column) => $this->wrap($column), $columns));
        $ordered = in_array('id', $columns, true);
        $rows = 0;
        $lastId = null;
        $offset = 0;

        while (true) {
            if ($ordered) {
                $condition = $lastId === null ? '' : ' WHERE '.$this->wrap('id').' > '.$this->literal($lastId);
                $statement = $pdo->query('SELECT '.$columnList.' FROM '.$this->wrap($table).$condition
                    .' ORDER BY '.$this->wrap('id').' LIMIT '.self::CHUNK_ROWS);
            } else {
                $statement = $pdo->query('SELECT '.$columnList.' FROM '.$this->wrap($table)
                    .' LIMIT '.self::CHUNK_ROWS.' OFFSET '.$offset);
            }

            $values = [];
            $fetched = 0;
            while (($row = $statement->fetch(\PDO::FETCH_ASSOC)) !== false) {
                $quoted = [];
                foreach ($row as $value) {
                    $quoted[] = $this->literal($value);
                }
                $values[] = '('.implode(', ', $quoted).')';
                $fetched++;
                if ($ordered) {
                    // شناسه در SQLite می‌تواند رشته برگردد؛ عددی‌کردن آن از مقایسهٔ
                    // متنی در شرط `id > ...` جلوگیری می‌کند.
                    $lastId = is_numeric($row['id']) ? (int) $row['id'] : $row['id'];
                }
            }
            $statement->closeCursor();

            if ($fetched === 0) {
                break;
            }
            $rows += $fetched;
            $flush($this->insert($table, $columns, $values));

            if ($fetched < self::CHUNK_ROWS) {
                break;
            }
            $offset += $fetched;
        }

        return $rows;
    }

    /** @return string[] نام ستون‌های جدول، به ترتیب واقعی جدول */
    private function columns(string $table): array
    {
        try {
            if ($this->driver() === 'sqlite') {
                $rows = $this->pdo()->query('PRAGMA table_info('.$this->wrap($table).')')->fetchAll(\PDO::FETCH_ASSOC);

                return array_values(array_map(fn ($row) => (string) $row['name'], $rows));
            }
            $rows = $this->pdo()->query('SHOW COLUMNS FROM '.$this->wrap($table))->fetchAll(\PDO::FETCH_ASSOC);

            return array_values(array_map(fn ($row) => (string) ($row['Field'] ?? ''), $rows));
        } catch (\Throwable) {
            return [];
        }
    }

    /** @param  string[]  $columns  @param  string[]  $values */
    private function insert(string $table, array $columns, array $values): string
    {
        $quotedColumns = implode(', ', array_map(fn (string $column) => $this->wrap($column), $columns));

        return 'INSERT INTO '.$this->wrap($table).' ('.$quotedColumns.') VALUES'."\n".implode(",\n", $values).";\n";
    }

    private function literal(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        $string = (string) $value;
        // هر بایت غیرقابل‌چاپ با X'..' نوشته می‌شود؛ امن‌ترین حالت برای متن فارسی،
        // کاراکترهای کنترلی و دادهٔ دودویی بدون وابستگی به charset اتصال.
        if ($string !== '' && preg_match('//u', $string) === 1 && ! preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $string)) {
            return $this->pdo()->quote($string);
        }

        return $string === '' ? "''" : "X'".bin2hex($string)."'";
    }

    private function header(array $tables): string
    {
        $lines = [
            '-- Tadbir database backup',
            '-- created: '.now()->toIso8601String(),
            '-- driver: '.$this->driver(),
            '-- tables: '.count($tables),
            '-- WARNING: restoring this file replaces the current data of every listed table.',
            '',
        ];

        if ($this->driver() === 'sqlite') {
            $lines[] = 'PRAGMA foreign_keys=OFF;';
            $lines[] = 'BEGIN TRANSACTION;';
        } else {
            $lines[] = 'SET NAMES utf8mb4;';
            $lines[] = 'SET FOREIGN_KEY_CHECKS=0;';
            $lines[] = 'SET SQL_MODE=NO_AUTO_VALUE_ON_ZERO;';
        }

        return implode("\n", $lines)."\n";
    }

    private function footer(): string
    {
        if ($this->driver() === 'sqlite') {
            return "COMMIT;\nPRAGMA foreign_keys=ON;\n";
        }

        return "SET FOREIGN_KEY_CHECKS=1;\n";
    }

    private function createStatement(string $table): string
    {
        if ($this->driver() === 'sqlite') {
            $sql = $this->pdo()->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ".$this->pdo()->quote($table))->fetchColumn();
            $sql = is_string($sql) && trim($sql) !== '' ? trim($sql) : 'CREATE TABLE '.$this->wrap($table).' (id INTEGER PRIMARY KEY)';

            return "DROP TABLE IF EXISTS ".$this->wrap($table).";\n".$sql.";\n";
        }

        $row = $this->pdo()->query('SHOW CREATE TABLE '.$this->wrap($table))->fetch(\PDO::FETCH_ASSOC);
        $sql = (string) (array_values($row ?? [])[1] ?? '');

        return "DROP TABLE IF EXISTS ".$this->wrap($table).";\n".$sql.";\n";
    }

    /** @return string[] */
    private function tables(): array
    {
        $pdo = $this->pdo();
        if ($this->driver() === 'sqlite') {
            $rows = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(\PDO::FETCH_COLUMN);

            return array_values(array_filter(array_map('strval', $rows)));
        }

        $rows = $pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);

        return array_values(array_filter(array_map('strval', $rows)));
    }

    private function pdo(): \PDO
    {
        return DB::connection()->getPdo();
    }

    private function driver(): string
    {
        return (string) DB::connection()->getDriverName();
    }

    private function databaseName(): string
    {
        try {
            return (string) DB::connection()->getDatabaseName();
        } catch (\Throwable) {
            return '';
        }
    }

    /** آخرین migrationهای ثبت‌شده؛ برای دیدن «روی چه نسخه‌ای پشتیبان گرفته شده». */
    private function lastMigrations(): array
    {
        try {
            $rows = DB::table('migrations')->orderByDesc('id')->limit(5)->pluck('migration')->all();

            return array_map('strval', $rows);
        } catch (\Throwable) {
            return [];
        }
    }

    private function wrap(string $identifier): string
    {
        return $this->driver() === 'sqlite'
            ? '"'.str_replace('"', '""', $identifier).'"'
            : '`'.str_replace('`', '``', $identifier).'`';
    }

    private function ensureDirectory(string $path): void
    {
        if (is_dir($path)) {
            return;
        }
        if (! @mkdir($path, 0770, true) && ! is_dir($path)) {
            throw new RuntimeException('ساخت پوشهٔ پشتیبان ممکن نشد: '.$path);
        }
    }

    /** مسیر manifest متناظر یک دامپ: db-X.sql.gz ⇒ db-X.json */
    private function manifestPath(string $dumpPath): string
    {
        $base = preg_replace('/\.sql\.gz$/', '', basename($dumpPath)) ?? basename($dumpPath);

        return dirname($dumpPath).DIRECTORY_SEPARATOR.$base.'.json';
    }

    private function resolve(string $file): string
    {
        $file = basename(trim($file));
        if ($file === '' || ! str_ends_with($file, '.sql.gz')) {
            throw new RuntimeException('نام فایل پشتیبان نامعتبر است.');
        }

        $path = StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db'.DIRECTORY_SEPARATOR.$file;
        if (! is_file($path)) {
            throw new RuntimeException('پشتیبان پیدا نشد: '.$file);
        }

        return $path;
    }

    private function slug(string $label): string
    {
        $clean = preg_replace('/[^A-Za-z0-9-]+/', '-', $label) ?? '';

        return trim($clean, '-') === '' ? '' : strtolower(trim($clean, '-'));
    }

    /** آرشیو tar.gz از ریشهٔ فایل‌ها؛ فقط اگر tar میزبان در دسترس باشد. */
    private function archiveFiles(string $stamp): ?string
    {
        $tar = trim((string) shell_exec('command -v tar 2>/dev/null'));
        if ($tar === '') {
            return null;
        }

        $root = StoragePaths::filesRoot();
        if (! is_dir($root)) {
            return null;
        }

        $target = StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'files-'.date('Ymd-His', strtotime($stamp) ?: time()).'.tar.gz';
        $command = escapeshellarg($tar).' -czf '.escapeshellarg($target).' -C '.escapeshellarg(dirname($root)).' '.escapeshellarg(basename($root)).' 2>&1';
        shell_exec($command);

        return is_file($target) && filesize($target) > 0 ? $target : null;
    }
}
