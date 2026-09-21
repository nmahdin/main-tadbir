<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * تیم‌های سازمانی و اعضای هر تیم.
 *
 * نقش هر عضو در جدول میانی team_user ذخیره می‌شود: سرپرست تیم با نقش leader
 * و سایر اعضا با نقش member.
 */
class TeamSeeder extends Seeder
{
    /**
     * @var array<int, array{name: string, description: string, leader: string, department: string, type: string, color: string, members: array<int, string>}>
     */
    public const TEAMS = [
        [
            'name' => 'تیم هسته فرانت‌اند و دیزاین سیستم',
            'description' => 'مسئول معماری کلاینت وب، یکپارچگی تجربه کاربری، توکن‌های طراحی، تعاملات بصری و استانداردهای دسترسی‌پذیری.',
            'leader' => 'usr-3',
            'department' => 'engineering',
            'type' => 'permanent',
            'color' => '#6366f1',
            'members' => ['usr-1', 'usr-3', 'usr-5'],
        ],
        [
            'name' => 'تیم بک‌اند و زیرساخت ابری',
            'description' => 'طراحی معماری میکروسرویس‌ها، بهینه‌سازی کوئری‌های دیتابیس، پروتکل‌های امنیتی و ارکستراسیون کانتینرها.',
            'leader' => 'usr-4',
            'department' => 'engineering',
            'type' => 'permanent',
            'color' => '#0ea5e9',
            'members' => ['usr-1', 'usr-2', 'usr-4', 'usr-6'],
        ],
        [
            'name' => 'تیم استراتژی محصول و تضمین کیفیت',
            'description' => 'برنامه‌ریزی اسپرینت‌ها، تحقیقات کاربری، پایپ‌لاین آزمون خودکار، تحلیل سرعت تیم و هماهنگی تحویل محصول.',
            'leader' => 'usr-2',
            'department' => 'qa',
            'type' => 'project_based',
            'color' => '#10b981',
            'members' => ['usr-1', 'usr-2', 'usr-5', 'usr-6'],
        ],
    ];

    public function run(): void
    {
        $namesBySlug = collect(DepartmentSeeder::DEPARTMENTS)->pluck('name', 'slug');
        $departmentIds = Department::query()->pluck('id', 'name');
        $userIds = User::query()->pluck('id', 'username');

        foreach (self::TEAMS as $definition) {
            $leaderUsername = UserSeeder::usernameFor($definition['leader']);
            $departmentName = $namesBySlug[$definition['department']] ?? null;

            $team = Team::updateOrCreate(
                ['name' => $definition['name']],
                [
                    'description' => $definition['description'],
                    'leader_id' => $userIds[$leaderUsername] ?? null,
                    'department_id' => $departmentName ? ($departmentIds[$departmentName] ?? null) : null,
                    'type' => $definition['type'],
                    'color' => $definition['color'],
                    'status' => 'active',
                ],
            );

            $members = [];
            foreach ($definition['members'] as $frontendId) {
                $userId = $userIds[UserSeeder::usernameFor($frontendId)] ?? null;

                if ($userId === null) {
                    $this->command?->warn("کاربر {$frontendId} یافت نشد و به تیم «{$team->name}» اضافه نشد.");

                    continue;
                }

                $members[$userId] = [
                    'role' => $frontendId === $definition['leader'] ? 'leader' : 'member',
                    'joined_at' => now(),
                ];
            }

            $team->users()->sync($members);
        }
    }
}
