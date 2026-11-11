<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GraphicAsset extends Model
{
    protected $fillable = [
        'customer_id',
        'order_id',
        'kind',
        'storage_disk',
        'storage_path',
        'mime_type',
        'file_size',
        'meta_json',
    ];

    protected $casts = [
        'meta_json' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function processingJobs(): HasMany
    {
        return $this->hasMany(ProcessingJob::class);
    }
}

