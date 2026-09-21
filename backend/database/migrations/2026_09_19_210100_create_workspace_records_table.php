<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_records', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 40);
            $table->string('title')->nullable();
            $table->string('status', 80)->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('payload');
            $table->timestamps();
            $table->index(['kind', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_records');
    }
};
