<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'service' => config('app.name'),
        'message' => 'Adotind platform core is running.',
        'api_base' => '/api/v1',
    ]);
});
