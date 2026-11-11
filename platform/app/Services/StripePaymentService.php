<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payment;
use Stripe\Checkout\Session;
use Stripe\Exception\SignatureVerificationException;
use Stripe\StripeClient;
use Stripe\Webhook;
use UnexpectedValueException;

class StripePaymentService
{
    public function createCheckoutSession(Order $order): array
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            abort(500, 'Stripe secret key is not configured.');
        }

        $client = new StripeClient($secret);
        $currency = strtolower((string) config('quote.currency', 'eur'));
        $session = $client->checkout->sessions->create([
            'mode' => 'payment',
            'success_url' => rtrim((string) config('app.url'), '/') . '/payments/success?order=' . $order->id,
            'cancel_url' => rtrim((string) config('app.url'), '/') . '/payments/cancel?order=' . $order->id,
            'line_items' => [[
                'quantity' => 1,
                'price_data' => [
                    'currency' => $currency,
                    'product_data' => [
                        'name' => 'Order ' . $order->order_number,
                    ],
                    'unit_amount' => (int) round(((float) $order->total) * 100),
                ],
            ]],
            'metadata' => [
                'order_id' => (string) $order->id,
            ],
        ]);

        Payment::query()->create([
            'order_id' => $order->id,
            'provider' => 'stripe',
            'provider_payment_id' => (string) $session->id,
            'status' => 'pending',
            'amount' => (float) $order->total,
            'currency' => strtoupper($currency),
            'payload_json' => ['checkout_session' => $session->toArray()],
        ]);

        return [
            'checkout_session_id' => (string) $session->id,
            'checkout_url' => (string) $session->url,
        ];
    }

    public function handleWebhook(string $payload, string $signature): void
    {
        $secret = (string) config('services.stripe.webhook_secret');
        if ($secret === '') {
            throw new UnexpectedValueException('Stripe webhook secret is not configured.');
        }

        try {
            $event = Webhook::constructEvent($payload, $signature, $secret);
        } catch (UnexpectedValueException|SignatureVerificationException $e) {
            throw $e;
        }

        if ($event->type === 'checkout.session.completed') {
            /** @var Session $session */
            $session = $event->data->object;
            $this->markPaid((string) $session->id);
        }
        if ($event->type === 'checkout.session.expired') {
            /** @var Session $session */
            $session = $event->data->object;
            $this->markFailed((string) $session->id, 'expired');
        }
    }

    private function markPaid(string $checkoutSessionId): void
    {
        $payment = Payment::query()
            ->where('provider', 'stripe')
            ->where('provider_payment_id', $checkoutSessionId)
            ->latest('id')
            ->first();
        if (!$payment) {
            return;
        }
        $payment->status = 'paid';
        $payment->paid_at = now();
        $payment->save();

        $order = $payment->order;
        $order->status = 'paid';
        $order->save();
    }

    private function markFailed(string $checkoutSessionId, string $reason): void
    {
        $payment = Payment::query()
            ->where('provider', 'stripe')
            ->where('provider_payment_id', $checkoutSessionId)
            ->latest('id')
            ->first();
        if (!$payment) {
            return;
        }
        $payment->status = 'failed';
        $payload = (array) ($payment->payload_json ?? []);
        $payload['failure_reason'] = $reason;
        $payment->payload_json = $payload;
        $payment->save();
    }
}

