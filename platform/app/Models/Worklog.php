<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Worklog extends Model
{
    protected $fillable = [
        'order_id',
        'user_id',
        'activity_type',
        'minutes',
        'notes',
        'started_at',
        'ended_at',
    ];

    protected $casts = [
        'minutes' => 'float',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

