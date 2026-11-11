<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuoteItem extends Model
{
    protected $fillable = [
        'quote_id',
        'machine_id',
        'material_id',
        'title',
        'vector_length_mm',
        'quantity',
        'unit_price',
        'line_total',
        'geometry_meta_json',
    ];

    protected $casts = [
        'vector_length_mm' => 'float',
        'quantity' => 'float',
        'unit_price' => 'float',
        'line_total' => 'float',
        'geometry_meta_json' => 'array',
    ];

    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class);
    }
}

