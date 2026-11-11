<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AuthLoginRequest;
use App\Http\Requests\AuthRegisterRequest;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(AuthRegisterRequest $request): JsonResponse
    {
        $user = User::query()->create([
            'name' => (string) $request->input('name'),
            'email' => strtolower((string) $request->input('email')),
            'password' => (string) $request->input('password'),
            'role' => 'customer',
        ]);

        Customer::query()->updateOrCreate(
            ['email' => $user->email],
            ['name' => $user->name, 'phone' => (string) $request->input('phone', '')]
        );

        $token = $user->createToken((string) $request->input('device_name', 'api-token'))->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
        ], 201);
    }

    public function login(AuthLoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', strtolower((string) $request->input('email')))->first();
        if (!$user || !Hash::check((string) $request->input('password'), $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 422);
        }

        $token = $user->createToken((string) $request->input('device_name', 'api-token'))->plainTextToken;
        return response()->json(['token' => $token, 'user' => $user]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();
        return response()->json(['message' => 'Logged out.']);
    }
}

