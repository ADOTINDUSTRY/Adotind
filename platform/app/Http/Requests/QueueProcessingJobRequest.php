<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class QueueProcessingJobRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'job_type' => ['required', 'string', Rule::in(['trace', 'convert', 'optimize', 'preview'])],
            'input' => ['nullable', 'array'],
        ];
    }
}

