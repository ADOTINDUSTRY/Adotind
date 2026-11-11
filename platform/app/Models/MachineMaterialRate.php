<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MachineMaterialRate extends Model
{
    protected $fillable = [
        'machine_id',
        'material_id',
        'cut_speed_mm_min',
        'pierce_time_sec',
        'active',
    ];

    protected $casts = [
        'cut_speed_mm_min' => 'float',
        'pierce_time_sec' => 'float',
        'active' => 'boolean',
    ];

    public function machine(): BelongsTo
    {
        return $this->belongsTo(Machine::class);
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(Material::class);
    }
}

