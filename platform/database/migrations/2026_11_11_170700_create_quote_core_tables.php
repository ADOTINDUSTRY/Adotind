<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('machines', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->decimal('setup_minutes', 10, 2)->default(10);
            $table->decimal('setup_cost', 12, 2)->default(0);
            $table->decimal('hourly_rate', 12, 2)->default(75);
            $table->decimal('min_charge', 12, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('materials', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->decimal('sheet_width_mm', 12, 3);
            $table->decimal('sheet_height_mm', 12, 3);
            $table->decimal('sheet_price', 12, 2);
            $table->decimal('waste_percent', 8, 3)->default(10);
            $table->boolean('active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('machine_material_rates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('machine_id')->constrained()->cascadeOnDelete();
            $table->foreignId('material_id')->constrained()->cascadeOnDelete();
            $table->decimal('cut_speed_mm_min', 12, 3);
            $table->decimal('pierce_time_sec', 12, 3)->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['machine_id', 'material_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('machine_material_rates');
        Schema::dropIfExists('materials');
        Schema::dropIfExists('machines');
    }
};
