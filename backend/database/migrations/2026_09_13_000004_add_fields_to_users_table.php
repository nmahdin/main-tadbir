<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->unique()->nullable()->after('name');
            $table->string('avatar')->nullable()->after('email');
            $table->foreignId('role_id')->nullable()->after('avatar')->constrained()->nullOnDelete();
            $table->string('role_key')->nullable()->after('role_id');
            $table->enum('status', ['active', 'inactive', 'blocked', 'pending'])->default('active')->after('role_key');
            $table->string('title')->nullable()->after('status');
            $table->foreignId('department_id')->nullable()->after('title')->constrained()->nullOnDelete();
            $table->string('phone', 20)->nullable()->after('department_id');
            $table->string('location')->nullable()->after('phone');
            $table->text('bio')->nullable()->after('location');
            $table->json('skills')->nullable()->after('bio');
            $table->boolean('two_factor_enabled')->default(false)->after('skills');
            $table->timestamp('last_login_at')->nullable()->after('two_factor_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['role_id']);
            $table->dropForeign(['department_id']);
            $table->dropColumn([
                'username', 'avatar', 'role_id', 'role_key', 'status', 'title',
                'department_id', 'phone', 'location', 'bio', 'skills',
                'two_factor_enabled', 'last_login_at'
            ]);
        });
    }
};

