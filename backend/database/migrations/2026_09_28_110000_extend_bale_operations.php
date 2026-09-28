<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bale_user_links', fn (Blueprint $t) => $t->boolean('notifications_enabled')->default(true));
        Schema::table('domain_records', fn (Blueprint $t) => $t->string('notification_key', 64)->nullable()->unique());
        Schema::create('dam_data_table_team', function (Blueprint $t) {
            $t->foreignId('dam_data_table_id')->constrained()->cascadeOnDelete();
            $t->foreignId('team_id')->constrained()->cascadeOnDelete();
            $t->primary(['dam_data_table_id', 'team_id']);
        });
        Schema::create('bale_reminder_runs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('meeting_id')->constrained('workspace_records')->cascadeOnDelete();
            $t->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('request_key', 64)->unique();
            $t->string('snapshot', 64);
            $t->json('notification_ids');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bale_reminder_runs');
        Schema::dropIfExists('dam_data_table_team');
        Schema::table('domain_records', function (Blueprint $t) {
            $t->dropUnique(['notification_key']);
            $t->dropColumn('notification_key');
        });
        Schema::table('bale_user_links', fn (Blueprint $t) => $t->dropColumn('notifications_enabled'));
    }
};
