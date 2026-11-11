<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Quote extends Model
{
    protected $fillable = [
        'customer_id',
        'user_id',
        'quote_number',
        'status',
        'currency',
        'subtotal',
        'vat_percent',
        'vat_amount',
        'total',
        'pricing_snapshot_json',
    ];

    protected $casts = [
        'subtotal' => 'float',
        'vat_percent' => 'float',
        'vat_amount' => 'float',
        'total' => 'float',
        'pricing_snapshot_json' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuoteItem::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
