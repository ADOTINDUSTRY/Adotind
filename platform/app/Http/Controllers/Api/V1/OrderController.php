<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateOrderStatusRequest;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function show(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->hasRole('customer')) {
            $customerEmail = DB::table('customers')->where('id', $order->customer_id)->value('email');
            if (strtolower((string) $user->email) !== strtolower((string) $customerEmail)) {
                abort(403, 'You do not have access to this order.');
            }
        }

        return response()->json(['order' => $order->load(['quote', 'customer', 'payments'])]);
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order): JsonResponse
    {
        $order->status = (string) $request->input('status');
        if ($request->filled('due_at')) {
            $order->due_at = (string) $request->input('due_at');
        }
        $order->save();

        return response()->json(['order' => $order]);
    }
}

