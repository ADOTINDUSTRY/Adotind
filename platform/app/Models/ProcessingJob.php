<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProcessingJob extends Model
{
    protected $fillable = [
        'graphic_asset_id',
        'job_type',
        'status',
        'queue_name',
        'input_json',
        'output_json',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'input_json' => 'array',
        'output_json' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function graphicAsset(): BelongsTo
    {
        return $this->belongsTo(GraphicAsset::class);
    }
}

