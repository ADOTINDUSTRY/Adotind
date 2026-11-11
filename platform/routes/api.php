<?php

use App\Http\Controllers\Api\V1\AdminDashboardController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\GraphicAssetController;
use App\Http\Controllers\Api\V1\GraphicProcessingController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\QuoteEstimateController;
use App\Http\Controllers\Api\V1\QuoteController;
use App\Http\Controllers\Api\V1\QuoteCatalogController;
use App\Http\Controllers\Api\V1\StripeWebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', HealthController::class);
    Route::get('/quote/catalog', QuoteCatalogController::class);
    Route::post('/quote/estimate', QuoteEstimateController::class);
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/payments/stripe/webhook', StripeWebhookController::class);

    Route::middleware(['auth:sanctum'])->group(function (): void {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        Route::post('/quotes', [QuoteController::class, 'store']);
        Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
        Route::post('/quotes/{quote}/confirm', [QuoteController::class, 'confirm']);

        Route::get('/orders/{order}', [OrderController::class, 'show']);
        Route::post('/orders/{order}/payments/stripe/checkout', [PaymentController::class, 'createStripeCheckout']);

        Route::post('/graphics/assets', [GraphicAssetController::class, 'store']);
        Route::post('/graphics/assets/{asset}/jobs', [GraphicProcessingController::class, 'queue']);
        Route::get('/graphics/jobs/{processingJob}', [GraphicProcessingController::class, 'show']);

        Route::middleware(['role:admin,staff'])->group(function (): void {
            Route::get('/admin/dashboard', AdminDashboardController::class);
            Route::patch('/orders/{order}/status', [OrderController::class, 'updateStatus']);
        });
    });
});
