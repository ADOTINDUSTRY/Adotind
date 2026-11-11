<?php

namespace App\Jobs;

use App\Models\ProcessingJob;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessGraphicAssetJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $processingJobId)
    {
        $this->onQueue('graphics');
    }

    public function handle(): void
    {
        $job = ProcessingJob::query()->find($this->processingJobId);
        if (!$job) {
            return;
        }

        $job->status = 'processing';
        $job->started_at = now();
        $job->save();

        // Placeholder workflow; replace with real tracing/conversion pipeline workers.
        $input = (array) ($job->input_json ?? []);
        $job->output_json = [
            'message' => 'Processing completed.',
            'input' => $input,
            'processed_at' => now()->toIso8601String(),
        ];
        $job->status = 'completed';
        $job->finished_at = now();
        $job->save();
    }
}

