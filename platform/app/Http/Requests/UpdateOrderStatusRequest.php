<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOrderStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', 'string', Rule::in(['new', 'processing', 'ready', 'completed', 'cancelled', 'paid'])],
            'due_at' => ['nullable', 'date'],
        ];
    }
}

