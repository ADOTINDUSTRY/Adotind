<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Material extends Model
{
    protected $fillable = [
        'name',
        'sheet_width_mm',
        'sheet_height_mm',
        'sheet_price',
        'waste_percent',
        'active',
        'sort_order',
    ];

    protected $casts = [
        'sheet_width_mm' => 'float',
        'sheet_height_mm' => 'float',
        'sheet_price' => 'float',
        'waste_percent' => 'float',
        'active' => 'boolean',
    ];

    public function rates(): HasMany
    {
        return $this->hasMany(MachineMaterialRate::class);
    }
}

