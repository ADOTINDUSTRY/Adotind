<?php

namespace Tests\Feature;

use Database\Seeders\QuoteCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QuoteEstimateApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_quote_estimate_with_breakdown(): void
    {
        $this->seed(QuoteCatalogSeeder::class);

        $machineId = (int) DB::table('machines')->where('code', 'co2')->value('id');
        $materialId = (int) DB::table('materials')->where('name', 'Acrylic 3mm')->value('id');

        $response = $this->postJson('/api/v1/quote/estimate', [
            'machine_id' => $machineId,
            'material_id' => $materialId,
            'vector_length_mm' => 4200,
            'part_width_mm' => 500,
            'part_height_mm' => 300,
            'quantity' => 3,
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'currency',
                'machine' => ['id', 'name'],
                'material' => ['id', 'name'],
                'input' => ['vector_length_mm', 'part_width_mm', 'part_height_mm', 'quantity'],
                'breakdown' => ['setup_minutes', 'cut_minutes', 'total_minutes', 'sheets', 'material_cost', 'vat_amount'],
                'totals' => ['subtotal', 'total'],
            ]);

        $this->assertGreaterThan(0, (float) $response->json('totals.total'));
    }

    public function test_it_validates_estimate_payload(): void
    {
        $response = $this->postJson('/api/v1/quote/estimate', [
            'machine_id' => 0,
            'material_id' => 0,
            'vector_length_mm' => -1,
            'part_width_mm' => 0,
            'part_height_mm' => 0,
            'quantity' => 0,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'machine_id',
                'material_id',
                'vector_length_mm',
                'part_width_mm',
                'part_height_mm',
                'quantity',
            ]);
    }
}

