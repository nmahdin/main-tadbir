<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * کاربران پایه سامانه تدبیر.
 *
 * تمام کاربران فرانت‌اند (INITIAL_USERS) در اینجا تعریف شده‌اند تا پس از اتصال API،
 * اطلاعات موجود در localStorage با دیتابیس هم‌خوانی داشته باشد.
 *
 * رمز عبور پیش‌فرض همه کاربران «password» است و باید در اولین ورود تغییر کند.
 * شماره تلفن‌ها با ارقام لاتین ذخیره می‌شوند تا ورود با موبایل ممکن باشد.
 */
class UserSeeder extends Seeder
{
    /**
     * کلید هر عضو، شناسه همان کاربر در فرانت‌اند است تا سایر Seederها بتوانند
     * بدون وابستگی به شناسه عددی دیتابیس به کاربران ارجاع بدهند.
     *
     * @var array<string, array{name: string, username: string, email: string, role: string, status: string, title: string, department: string, phone: string, location: string, two_factor: bool, avatar: string, skills: array<int, string>}>
     */
    public const USERS = [
        'usr-1' => [
            'name' => 'سارا چنگیزی',
            'username' => 'sarah.changizi',
            'email' => 'sarah.changizi@tadbir.ir',
            'role' => 'admin',
            'status' => 'active',
            'title' => 'معاونت فنی و مدیریت محصول',
            'department' => 'executive',
            'phone' => '09123456789',
            'location' => 'تهران، ونک',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
            'skills' => ['برنامه‌ریزی استراتژیک', 'معماری سیستم', 'اسکرام و چابک', 'نقشه راه محصول'],
        ],
        'usr-2' => [
            'name' => 'مهرداد وصالی',
            'username' => 'mehrdad.vesali',
            'email' => 'mehrdad.vesali@tadbir.ir',
            'role' => 'project_manager',
            'status' => 'active',
            'title' => 'مدیر ارشد پروژه‌های چابک',
            'department' => 'pm',
            'phone' => '09192345678',
            'location' => 'تهران، سعادت‌آباد',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
            'skills' => ['مدیریت اسپرینت', 'تحلیل ریسک', 'Jira / Linear', 'تسهیل‌گری اسکرام'],
        ],
        'usr-3' => [
            'name' => 'علی رضوانی',
            'username' => 'ali.rezvani',
            'email' => 'ali.rezvani@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'توسعه‌دهنده ارشد فرانت‌اند',
            'department' => 'engineering',
            'phone' => '09351234567',
            'location' => 'تهران، یوسف‌آباد',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
            'skills' => ['React 19', 'TypeScript', 'Tailwind CSS', 'Next.js', 'بهینه‌سازی کارایی'],
        ],
        'usr-4' => [
            'name' => 'داوود کیانی',
            'username' => 'davood.kiani',
            'email' => 'davood.kiani@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'توسعه‌دهنده ارشد بک‌اند و زیرساخت',
            'department' => 'engineering',
            'phone' => '09361112233',
            'location' => 'اصفهان، چهارباغ',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Node.js', 'Go', 'PostgreSQL', 'GraphQL', 'Kubernetes', 'Redis'],
        ],
        'usr-5' => [
            'name' => 'النا رستمی',
            'username' => 'elena.rostami',
            'email' => 'elena.rostami@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'طراح ارشد رابط و تجربه کاربری (UI/UX)',
            'department' => 'product-design',
            'phone' => '09129876543',
            'location' => 'شیراز، ارم',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Figma', 'سیستم دیزاین', 'تست کاربری', 'پروتوتایپ تعاملی'],
        ],
        'usr-6' => [
            'name' => 'نیما شریفی',
            'username' => 'nima.sharifi',
            'email' => 'nima.sharifi@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'متخصص تضمین کیفیت و تست خودکار (QA)',
            'department' => 'qa',
            'phone' => '09305554433',
            'location' => 'مشهد، وکیل‌آباد',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Playwright', 'Jest', 'Cypress', 'پایپ‌لاین CI/CD', 'تست امنیت'],
        ],
        'usr-7' => [
            'name' => 'مهسا کاظمی',
            'username' => 'mahsa.kazemi',
            'email' => 'mahsa.kazemi@tadbir.ir',
            'role' => 'team_member',
            'status' => 'pending',
            'title' => 'کارشناس توسعه بازار و آنبوردینگ',
            'department' => 'customer-growth',
            'phone' => '09184443322',
            'location' => 'تبریز، آبرسان',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
            'skills' => ['تحلیل مشتری', 'ارتباطات سازمانی', 'مستندسازی'],
        ],
        'usr-8' => [
            'name' => 'رضا میرزایی',
            'username' => 'reza.mirzaei',
            'email' => 'reza.mirzaei@tadbir.ir',
            'role' => 'team_member',
            'status' => 'blocked',
            'title' => 'توسعه‌دهنده سابق برون‌سپاری',
            'department' => 'engineering',
            'phone' => '09120001144',
            'location' => 'کرج، گوهردشت',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            'skills' => ['پایتون', 'اسکریپت‌نویسی'],
        ],
        'usr-10' => [
            'name' => 'مهدی رضایی',
            'username' => 'mehdi.rezaei',
            'email' => 'mehdi.rezaei@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'طراح ارشد رابط کاربری و دیزاین سیستم',
            'department' => 'product-design',
            'phone' => '09121114455',
            'location' => 'تهران، نیاوران',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Figma', 'Design System', 'Micro-interactions', 'Prototyping'],
        ],
        'usr-11' => [
            'name' => 'علی احمدی',
            'username' => 'ali.ahmadi',
            'email' => 'ali.ahmadi@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'توسعه‌دهنده ارشد بک‌اند و API',
            'department' => 'engineering',
            'phone' => '09195556677',
            'location' => 'تهران، میرداماد',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Node.js', 'NestJS', 'PostgreSQL', 'Docker', 'Redis'],
        ],
        'usr-12' => [
            'name' => 'سارا محمدی',
            'username' => 'sara.mohammadi',
            'email' => 'sara.mohammadi@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'مدیر بازاریابی دیجیتال و رشد',
            'department' => 'marketing',
            'phone' => '09378889900',
            'location' => 'تهران، پاسداران',
            'two_factor' => false,
            'avatar' => 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150&auto=format&fit=crop&q=80',
            'skills' => ['Digital Marketing', 'Growth Hacking', 'SEO', 'Data Analytics'],
        ],
        'usr-13' => [
            'name' => 'محمد کریمی',
            'username' => 'mohammad.karimi',
            'email' => 'mohammad.karimi@tadbir.ir',
            'role' => 'team_member',
            'status' => 'active',
            'title' => 'سرپرست آزمون نرم‌افزار و DevOps',
            'department' => 'qa',
            'phone' => '09127778899',
            'location' => 'کرج، عظیمیه',
            'two_factor' => true,
            'avatar' => 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
            'skills' => ['DevOps', 'CI/CD', 'Automated Testing', 'Security Audit'],
        ],
    ];

    /**
     * نام کاربری متناظر با شناسه کاربر در فرانت‌اند (مثلاً usr-5).
     * سایر Seederها با همین متد به کاربران ارجاع می‌دهند.
     */
    public static function usernameFor(string $frontendId): ?string
    {
        return self::USERS[$frontendId]['username'] ?? null;
    }

    public function run(): void
    {
        $namesBySlug = collect(DepartmentSeeder::DEPARTMENTS)->pluck('name', 'slug');
        $departmentIds = Department::query()->pluck('id', 'name');
        $roleIds = Role::query()->pluck('id', 'key');

        foreach (self::USERS as $definition) {
            $departmentName = $namesBySlug[$definition['department']] ?? null;

            User::updateOrCreate(
                ['username' => $definition['username']],
                [
                    'name' => $definition['name'],
                    'email' => $definition['email'],
                    'password' => 'password',
                    'avatar' => $definition['avatar'],
                    'role_id' => $roleIds[$definition['role']] ?? null,
                    'role_key' => $definition['role'],
                    'status' => $definition['status'],
                    'title' => $definition['title'],
                    'department_id' => $departmentName ? ($departmentIds[$departmentName] ?? null) : null,
                    'phone' => $definition['phone'],
                    'location' => $definition['location'],
                    'skills' => $definition['skills'],
                    'two_factor_enabled' => $definition['two_factor'],
                    'email_verified_at' => $definition['status'] === 'pending' ? null : now()->subDays(30),
                    'last_login_at' => $definition['status'] === 'active' ? now()->subHours(random_int(1, 72)) : null,
                ],
            );
        }
    }
}
