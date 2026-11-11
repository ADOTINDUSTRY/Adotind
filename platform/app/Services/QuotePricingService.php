<?php

namespace App\Services;

use App\Models\Machine;
use App\Models\MachineMaterialRate;
use App\Models\Material;
use RuntimeException;

class QuotePricingService
{
    public function estimate(
        Machine $machine,
        Material $material,
        MachineMaterialRate $rate,
        float $vectorLengthMm,
        float $partWidthMm,
        float $partHeightMm,
        int $quantity,
    ): array {
        if ($rate->cut_speed_mm_min <= 0) {
            throw new RuntimeException('Cut speed is not configured for this machine/material.');
        }

        $totalCutLengthMm = $vectorLengthMm * $quantity;
        $cutMinutes = $totalCutLengthMm / $rate->cut_speed_mm_min;
        $setupMinutes = (float) $machine->setup_minutes;
        $totalMinutes = $cutMinutes + $setupMinutes;

        $setupCost = (float) $machine->setup_cost;
        $cutCost = ($cutMinutes / 60) * (float) $machine->hourly_rate;

        $sheetArea = (float) $material->sheet_width_mm * (float) $material->sheet_height_mm;
        $partArea = $partWidthMm * $partHeightMm;
        $wasteFactor = 1 + ((float) $material->waste_percent / 100);
        $requiredArea = $partArea * $quantity * $wasteFactor;
        $sheets = $sheetArea > 0 ? max(1, (int) ceil($requiredArea / $sheetArea)) : 1;
        $materialCost = $sheets * (float) $material->sheet_price;

        $subtotalRaw = $setupCost + $cutCost + $materialCost;
        $subtotalWithMin = max($subtotalRaw, (float) $machine->min_charge);

        $markupPercent = (float) config('quote.markup_percent', 0);
        $vatPercent = (float) config('quote.vat_percent', 0);
        $roundStep = (float) config('quote.round_to', 0.5);

        $markupAmount = $subtotalWithMin * ($markupPercent / 100);
        $subtotal = $subtotalWithMin + $markupAmount;
        $vatAmount = $subtotal * ($vatPercent / 100);
        $total = $subtotal + $vatAmount;

        return [
            'currency' => (string) config('quote.currency', 'EUR'),
            'machine' => [
                'id' => $machine->id,
                'name' => $machine->name,
            ],
            'material' => [
                'id' => $material->id,
                'name' => $material->name,
            ],
            'input' => [
                'vector_length_mm' => $vectorLengthMm,
                'part_width_mm' => $partWidthMm,
                'part_height_mm' => $partHeightMm,
                'quantity' => $quantity,
            ],
            'breakdown' => [
                'setup_minutes' => round($setupMinutes, 2),
                'cut_minutes' => round($cutMinutes, 2),
                'total_minutes' => round($totalMinutes, 2),
                'total_cut_length_mm' => round($totalCutLengthMm, 2),
                'sheets' => $sheets,
                'setup_cost' => $this->money($setupCost, $roundStep),
                'cut_cost' => $this->money($cutCost, $roundStep),
                'material_cost' => $this->money($materialCost, $roundStep),
                'minimum_charge' => $this->money((float) $machine->min_charge, $roundStep),
                'markup_percent' => $markupPercent,
                'markup_amount' => $this->money($markupAmount, $roundStep),
                'vat_percent' => $vatPercent,
                'vat_amount' => $this->money($vatAmount, $roundStep),
            ],
            'totals' => [
                'subtotal' => $this->money($subtotal, $roundStep),
                'total' => $this->money($total, $roundStep),
            ],
        ];
    }

    private function money(float $value, float $step): float
    {
        if ($step <= 0) {
            return round($value, 2);
        }

        return round(round($value / $step) * $step, 2);
    }
}

