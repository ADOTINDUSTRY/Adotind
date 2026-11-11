<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\StripePaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\Exception\SignatureVerificationException;
use UnexpectedValueException;

class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, StripePaymentService $service): JsonResponse
    {
        try {
            $service->handleWebhook(
                payload: $request->getContent(),
                signature: (string) $request->header('Stripe-Signature', '')
            );
        } catch (UnexpectedValueException|SignatureVerificationException $e) {
            return response()->json(['message' => 'Invalid webhook payload/signature.'], 422);
        }

        return response()->json(['received' => true]);
    }
}

