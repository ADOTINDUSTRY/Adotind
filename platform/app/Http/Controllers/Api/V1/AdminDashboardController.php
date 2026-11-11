<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Machine;
use App\Models\Material;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProcessingJob;
use App\Models\Quote;
use Illuminate\Http\JsonResponse;

class AdminDashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'stats' => [
                'quotes' => Quote::query()->count(),
                'orders' => Order::query()->count(),
                'payments' => Payment::query()->count(),
                'processing_jobs' => ProcessingJob::query()->count(),
            ],
            'machines' => Machine::query()->orderBy('sort_order')->orderBy('id')->get(),
            'materials' => Material::query()->orderBy('sort_order')->orderBy('id')->get(),
            'recent_orders' => Order::query()->latest('id')->limit(20)->get(),
            'recent_payments' => Payment::query()->latest('id')->limit(20)->get(),
            'recent_processing_jobs' => ProcessingJob::query()->latest('id')->limit(20)->get(),
        ]);
    }
}

