<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuoteEstimateRequest;
use App\Models\Machine;
use App\Models\MachineMaterialRate;
use App\Models\Material;
use App\Services\QuotePricingService;
use Illuminate\Http\JsonResponse;

class QuoteEstimateController extends Controller
{
    public function __invoke(QuoteEstimateRequest $request, QuotePricingService $pricing): JsonResponse
    {
        $machine = Machine::query()
            ->whereKey((int) $request->integer('machine_id'))
            ->where('active', true)
            ->firstOrFail();

        $material = Material::query()
            ->whereKey((int) $request->integer('material_id'))
            ->where('active', true)
            ->firstOrFail();

        $rate = MachineMaterialRate::query()
            ->where('machine_id', $machine->id)
            ->where('material_id', $material->id)
            ->where('active', true)
            ->first();

        if (!$rate) {
            return response()->json([
                'message' => 'No active speed/rate configured for selected machine and material.',
            ], 422);
        }

        $estimate = $pricing->estimate(
            machine: $machine,
            material: $material,
            rate: $rate,
            vectorLengthMm: (float) $request->input('vector_length_mm'),
            partWidthMm: (float) $request->input('part_width_mm'),
            partHeightMm: (float) $request->input('part_height_mm'),
            quantity: (int) $request->integer('quantity'),
        );

        return response()->json($estimate);
    }
}

