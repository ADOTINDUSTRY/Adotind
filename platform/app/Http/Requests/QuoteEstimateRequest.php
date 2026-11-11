<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QuoteEstimateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'machine_id' => ['required', 'integer', 'exists:machines,id'],
            'material_id' => ['required', 'integer', 'exists:materials,id'],
            'vector_length_mm' => ['required', 'numeric', 'gt:0'],
            'part_width_mm' => ['required', 'numeric', 'gt:0'],
            'part_height_mm' => ['required', 'numeric', 'gt:0'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
        ];
    }
}

