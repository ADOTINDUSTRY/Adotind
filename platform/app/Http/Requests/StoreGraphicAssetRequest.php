<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGraphicAssetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:51200'],
            'kind' => ['nullable', 'string', Rule::in(['source', 'traced', 'preview', 'edit-session'])],
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
        ];
    }
}

