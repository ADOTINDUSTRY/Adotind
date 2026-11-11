<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('graphic_assets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind')->default('source')->index(); // source, traced, preview, edit-session
            $table->string('storage_disk')->default('s3');
            $table->string('storage_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->json('meta_json')->nullable();
            $table->timestamps();
        });

        Schema::create('processing_jobs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('graphic_asset_id')->nullable()->constrained()->nullOnDelete();
            $table->string('job_type')->index(); // trace, convert, optimize, preview
            $table->string('status')->default('queued')->index();
            $table->string('queue_name')->default('graphics')->index();
            $table->json('input_json')->nullable();
            $table->json('output_json')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('worklogs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('activity_type')->index(); // setup, cut, finishing, install, design
            $table->decimal('minutes', 10, 2);
            $table->text('notes')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('worklogs');
        Schema::dropIfExists('processing_jobs');
        Schema::dropIfExists('graphic_assets');
    }
};

