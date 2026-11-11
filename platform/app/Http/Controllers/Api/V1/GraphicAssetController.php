<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreGraphicAssetRequest;
use App\Models\Customer;
use App\Models\GraphicAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class GraphicAssetController extends Controller
{
    public function store(StoreGraphicAssetRequest $request): JsonResponse
    {
        $file = $request->file('file');
        $disk = (string) config('filesystems.default', 'local');
        $path = $file->store('graphics/source/' . now()->format('Y/m'), ['disk' => $disk]);

        $customer = Customer::query()
            ->where('email', strtolower((string) $request->user()->email))
            ->first();

        $asset = GraphicAsset::query()->create([
            'customer_id' => $customer?->id,
            'order_id' => $request->integer('order_id') ?: null,
            'kind' => (string) $request->input('kind', 'source'),
            'storage_disk' => $disk,
            'storage_path' => $path,
            'mime_type' => (string) $file->getMimeType(),
            'file_size' => Storage::disk($disk)->size($path),
            'meta_json' => [
                'original_name' => $file->getClientOriginalName(),
            ],
        ]);

        return response()->json(['asset' => $asset], 201);
    }
}

