<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\QueueProcessingJobRequest;
use App\Jobs\ProcessGraphicAssetJob;
use App\Models\GraphicAsset;
use App\Models\ProcessingJob;
use Illuminate\Http\JsonResponse;

class GraphicProcessingController extends Controller
{
    public function queue(QueueProcessingJobRequest $request, GraphicAsset $asset): JsonResponse
    {
        $job = ProcessingJob::query()->create([
            'graphic_asset_id' => $asset->id,
            'job_type' => (string) $request->input('job_type'),
            'status' => 'queued',
            'queue_name' => 'graphics',
            'input_json' => (array) $request->input('input', []),
        ]);

        ProcessGraphicAssetJob::dispatch($job->id);

        return response()->json(['processing_job' => $job], 201);
    }

    public function show(ProcessingJob $processingJob): JsonResponse
    {
        return response()->json(['processing_job' => $processingJob->load('graphicAsset')]);
    }
}

