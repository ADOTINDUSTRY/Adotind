<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Machine;
use App\Models\MachineMaterialRate;
use App\Models\Material;
use Illuminate\Http\JsonResponse;

class QuoteCatalogController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'machines' => Machine::query()
                ->where('active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get(),
            'materials' => Material::query()
                ->where('active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get(),
            'rates' => MachineMaterialRate::query()
                ->where('active', true)
                ->get(),
        ]);
    }
}

