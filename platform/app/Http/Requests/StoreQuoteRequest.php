<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_name' => ['required', 'string', 'max:120'],
            'customer_email' => ['required', 'string', 'email', 'max:190'],
            'customer_phone' => ['nullable', 'string', 'max:40'],
            'machine_id' => ['required', 'integer', 'exists:machines,id'],
            'material_id' => ['required', 'integer', 'exists:materials,id'],
            'vector_length_mm' => ['required', 'numeric', 'gt:0'],
            'part_width_mm' => ['required', 'numeric', 'gt:0'],
            'part_height_mm' => ['required', 'numeric', 'gt:0'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'title' => ['nullable', 'string', 'max:190'],
        ];
    }
}

