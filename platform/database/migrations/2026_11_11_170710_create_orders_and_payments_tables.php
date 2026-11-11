<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->index();
            $table->string('phone')->nullable();
            $table->timestamps();
        });

        Schema::create('quotes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('quote_number')->unique();
            $table->string('status')->default('draft')->index();
            $table->string('currency', 8)->default('EUR');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('vat_percent', 8, 3)->default(0);
            $table->decimal('vat_amount', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->json('pricing_snapshot_json')->nullable();
            $table->timestamps();
        });

        Schema::create('quote_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('quote_id')->constrained()->cascadeOnDelete();
            $table->foreignId('machine_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('material_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->decimal('vector_length_mm', 14, 3)->nullable();
            $table->decimal('quantity', 12, 3)->default(1);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->json('geometry_meta_json')->nullable();
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('quote_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('order_number')->unique();
            $table->string('status')->default('new')->index();
            $table->decimal('total', 12, 2)->default(0);
            $table->timestamp('ordered_at')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('provider')->index(); // stripe, viva, etc.
            $table->string('provider_payment_id')->nullable()->index();
            $table->string('status')->default('pending')->index();
            $table->decimal('amount', 12, 2);
            $table->string('currency', 8)->default('EUR');
            $table->json('payload_json')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('quote_items');
        Schema::dropIfExists('quotes');
        Schema::dropIfExists('customers');
    }
};

