<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\StripePaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    public function createStripeCheckout(Request $request, Order $order, StripePaymentService $payments): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->hasRole('customer')) {
            $customerEmail = DB::table('customers')->where('id', $order->customer_id)->value('email');
            if (strtolower((string) $user->email) !== strtolower((string) $customerEmail)) {
                abort(403, 'You do not have access to this order.');
            }
        }

        $session = $payments->createCheckoutSession($order);
        return response()->json($session, 201);
    }
}

