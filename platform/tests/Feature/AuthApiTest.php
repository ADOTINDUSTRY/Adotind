<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_and_get_token(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Client User',
            'email' => 'client@example.com',
            'password' => 'StrongPass123',
            'phone' => '+35790000000',
        ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'email', 'role'],
            ]);
    }
}

