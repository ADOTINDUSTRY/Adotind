<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\QuoteCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuoteOrderFlowApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_create_quote_and_confirm_order(): void
    {
        $this->seed(QuoteCatalogSeeder::class);

        $user = User::query()->create([
            'name' => 'Customer One',
            'email' => 'customer1@example.com',
            'password' => 'StrongPass123',
            'role' => 'customer',
        ]);
        Sanctum::actingAs($user);

        $machineId = (int) DB::table('machines')->where('code', 'co2')->value('id');
        $materialId = (int) DB::table('materials')->where('name', 'Acrylic 3mm')->value('id');

        $quoteResponse = $this->postJson('/api/v1/quotes', [
            'customer_name' => 'Customer One',
            'customer_email' => 'customer1@example.com',
            'customer_phone' => '+35790000000',
            'machine_id' => $machineId,
            'material_id' => $materialId,
            'vector_length_mm' => 6000,
            'part_width_mm' => 500,
            'part_height_mm' => 350,
            'quantity' => 2,
            'title' => 'Facade letters',
        ]);

        $quoteResponse->assertCreated();
        $quoteId = (int) $quoteResponse->json('quote.id');
        $this->assertGreaterThan(0, $quoteId);

        $confirmResponse = $this->postJson("/api/v1/quotes/{$quoteId}/confirm");
        $confirmResponse->assertCreated()
            ->assertJsonStructure([
                'quote' => ['id', 'status'],
                'order' => ['id', 'order_number', 'status', 'total'],
            ]);
    }
}

