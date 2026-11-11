<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Machine extends Model
{
    protected $fillable = [
        'name',
        'code',
        'setup_minutes',
        'setup_cost',
        'hourly_rate',
        'min_charge',
        'active',
        'sort_order',
    ];

    protected $casts = [
        'setup_minutes' => 'float',
        'setup_cost' => 'float',
        'hourly_rate' => 'float',
        'min_charge' => 'float',
        'active' => 'boolean',
    ];

    public function rates(): HasMany
    {
        return $this->hasMany(MachineMaterialRate::class);
    }
}

