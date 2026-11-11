<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Machine;
use App\Models\MachineMaterialRate;
use App\Models\Material;
use App\Models\Quote;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class QuoteFlowService
{
    public function createDraftQuote(array $payload, ?int $userId = null): Quote
    {
        return DB::transaction(function () use ($payload, $userId): Quote {
            $machine = Machine::query()->whereKey((int) $payload['machine_id'])->where('active', true)->firstOrFail();
            $material = Material::query()->whereKey((int) $payload['material_id'])->where('active', true)->firstOrFail();
            $rate = MachineMaterialRate::query()
                ->where('machine_id', $machine->id)
                ->where('material_id', $material->id)
                ->where('active', true)
                ->first();

            if (!$rate) {
                throw new RuntimeException('No active speed/rate configured for selected machine and material.');
            }

            $pricing = app(QuotePricingService::class)->estimate(
                machine: $machine,
                material: $material,
                rate: $rate,
                vectorLengthMm: (float) $payload['vector_length_mm'],
                partWidthMm: (float) $payload['part_width_mm'],
                partHeightMm: (float) $payload['part_height_mm'],
                quantity: (int) $payload['quantity'],
            );

            $customer = Customer::query()->updateOrCreate(
                ['email' => strtolower((string) $payload['customer_email'])],
                ['name' => (string) $payload['customer_name'], 'phone' => (string) ($payload['customer_phone'] ?? '')]
            );

            $quote = Quote::query()->create([
                'customer_id' => $customer->id,
                'user_id' => $userId,
                'quote_number' => $this->nextQuoteNumber(),
                'status' => 'draft',
                'currency' => (string) $pricing['currency'],
                'subtotal' => (float) $pricing['totals']['subtotal'],
                'vat_percent' => (float) $pricing['breakdown']['vat_percent'],
                'vat_amount' => (float) $pricing['breakdown']['vat_amount'],
                'total' => (float) $pricing['totals']['total'],
                'pricing_snapshot_json' => $pricing,
            ]);

            $quote->items()->create([
                'machine_id' => $machine->id,
                'material_id' => $material->id,
                'title' => (string) ($payload['title'] ?? 'Custom cut item'),
                'vector_length_mm' => (float) $payload['vector_length_mm'],
                'quantity' => (float) $payload['quantity'],
                'unit_price' => max(0.0, round(((float) $pricing['totals']['total']) / max(1, (int) $payload['quantity']), 2)),
                'line_total' => (float) $pricing['totals']['total'],
                'geometry_meta_json' => [
                    'part_width_mm' => (float) $payload['part_width_mm'],
                    'part_height_mm' => (float) $payload['part_height_mm'],
                ],
            ]);

            return $quote->load(['customer', 'items']);
        });
    }

    private function nextQuoteNumber(): string
    {
        return 'Q-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
    }
}

