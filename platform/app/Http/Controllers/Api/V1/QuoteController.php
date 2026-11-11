<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuoteRequest;
use App\Models\Quote;
use App\Services\QuoteFlowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QuoteController extends Controller
{
    public function store(StoreQuoteRequest $request, QuoteFlowService $flow): JsonResponse
    {
        $quote = $flow->createDraftQuote($request->validated(), $request->user()?->id);
        return response()->json(['quote' => $quote], 201);
    }

    public function show(Request $request, Quote $quote): JsonResponse
    {
        $user = $request->user();
        $customerEmail = DB::table('customers')->where('id', $quote->customer_id)->value('email');
        if ($user && $user->hasRole('customer') && strtolower((string) $user->email) !== strtolower((string) $customerEmail)) {
            abort(403, 'You do not have access to this quote.');
        }

        return response()->json(['quote' => $quote->load(['customer', 'items'])]);
    }

    public function confirm(Request $request, Quote $quote): JsonResponse
    {
        if ($quote->status !== 'draft') {
            return response()->json(['message' => 'Quote is already confirmed or closed.'], 422);
        }

        $customerEmail = DB::table('customers')->where('id', $quote->customer_id)->value('email');
        if ($request->user()?->hasRole('customer') && strtolower((string) $request->user()->email) !== strtolower((string) $customerEmail)) {
            abort(403, 'You do not have access to confirm this quote.');
        }

        $quote->status = 'confirmed';
        $quote->save();

        $order = $quote->orders()->create([
            'customer_id' => $quote->customer_id,
            'user_id' => $quote->user_id ?? $request->user()?->id,
            'order_number' => 'O-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
            'status' => 'new',
            'total' => $quote->total,
            'ordered_at' => now(),
        ]);

        return response()->json([
            'quote' => $quote,
            'order' => $order,
        ], 201);
    }
}

