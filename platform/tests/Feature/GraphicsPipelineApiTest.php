<?php

namespace Tests\Feature;

use App\Jobs\ProcessGraphicAssetJob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GraphicsPipelineApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_upload_graphic_and_queue_job(): void
    {
        Storage::fake('local');
        Queue::fake();

        $user = User::query()->create([
            'name' => 'Designer',
            'email' => 'designer@example.com',
            'password' => 'StrongPass123',
            'role' => 'customer',
        ]);
        Sanctum::actingAs($user);

        $upload = $this->postJson('/api/v1/graphics/assets', [
            'kind' => 'source',
            'file' => UploadedFile::fake()->create('sample.svg', 20, 'image/svg+xml'),
        ]);
        $upload->assertCreated();
        $assetId = (int) $upload->json('asset.id');

        $queue = $this->postJson("/api/v1/graphics/assets/{$assetId}/jobs", [
            'job_type' => 'trace',
            'input' => ['quality' => 'high'],
        ]);
        $queue->assertCreated()
            ->assertJsonStructure(['processing_job' => ['id', 'status', 'job_type']]);

        Queue::assertPushed(ProcessGraphicAssetJob::class);
    }
}

