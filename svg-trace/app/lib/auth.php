<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — authentication: database sessions, passwordless magic
 * links, Google/Facebook OAuth (authorization-code flow with state), and
 * safe linking of providers to one account by verified email address.
 *
 * No passwords are stored. No provider secrets appear in code.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/security.php';

final class StAuth
{
    private const SESSION_LIFETIME = 60 * 60 * 24 * 30;   // 30 days
    private const MAGIC_TTL = 60 * 15;                    // 15 minutes
    private const OAUTH_STATE_KEY = 'st_oauth_state';

    /** Currently signed-in user row, or null. */
    public static function user(): ?array
    {
        StSecurity::startSession();
        $sid = session_id();
        if ($sid === '') {
            return null;
        }
        $row = StDb::one(
            'SELECT u.* FROM st_sessions s
               JOIN st_users u ON u.id = s.user_id
              WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP()
                AND u.status = "active"',
            [hash('sha256', $sid)]
        );
        return $row ?: null;
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if ($user === null) {
            header('Location: /svg-trace/login', true, 303);
            exit;
        }
        return $user;
    }

    public static function requireAdmin(): array
    {
        $user = self::requireUser();
        if ((int)$user['is_admin'] !== 1) {
            http_response_code(403);
            exit('Forbidden.');
        }
        return $user;
    }

    /** Create a server-side session for the user and bind it to the cookie. */
    public static function loginUser(int $userId): void
    {
        StSecurity::startSession();
        StSecurity::regenerateSession();
        $sid = session_id();
        StDb::run(
            'INSERT INTO st_sessions (id, user_id, ip, user_agent, expires_at, created_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND, UTC_TIMESTAMP())',
            [
                hash('sha256', $sid),
                $userId,
                StSecurity::clientIpBinary(),
                substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
                self::SESSION_LIFETIME,
            ]
        );
        StDb::run(
            'UPDATE st_users SET last_login_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?',
            [$userId]
        );
        self::event($userId, 'login');
    }

    public static function logout(): void
    {
        StSecurity::startSession();
        $sid = session_id();
        if ($sid !== '') {
            StDb::run('DELETE FROM st_sessions WHERE id = ?', [hash('sha256', $sid)]);
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], (bool)$p['secure'], (bool)$p['httponly']);
        }
        session_destroy();
    }

    public static function event(?int $userId, string $event, ?array $meta = null): void
    {
        StDb::run(
            'INSERT INTO st_usage_events (user_id, event, meta_json, ip, created_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [$userId, $event, $meta === null ? null : json_encode($meta), StSecurity::clientIpBinary()]
        );
    }

    public static function securityEvent(string $event, ?string $email = null, ?int $userId = null, ?array $meta = null): void
    {
        StDb::run(
            'INSERT INTO st_security_events (user_id, email, event, meta_json, ip, created_at)
             VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [$userId, $email, $event, $meta === null ? null : json_encode($meta), StSecurity::clientIpBinary()]
        );
    }

    /**
     * Sliding-window rate limit backed by st_security_events.
     * Returns true when the action is allowed; logs and returns false when limited.
     */
    public static function rateLimit(string $event, ?string $email, int $maxAttempts, int $windowSeconds): bool
    {
        $ip = StSecurity::clientIpBinary();
        $row = StDb::one(
            'SELECT COUNT(*) AS n FROM st_security_events
              WHERE event = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ? SECOND
                AND (ip = ? OR (email IS NOT NULL AND email = ?))',
            [$event, $windowSeconds, $ip, $email]
        );
        if ((int)($row['n'] ?? 0) >= $maxAttempts) {
            self::securityEvent('rate_limited', $email, null, ['limited_event' => $event]);
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Email magic links
    // ------------------------------------------------------------------

    /** Create a magic-link token; returns the raw token (only ever emailed). */
    public static function magicLinkCreate(string $email): string
    {
        $email = strtolower(trim($email));
        $token = bin2hex(random_bytes(32));
        StDb::run(
            'INSERT INTO st_magic_login_tokens (email, token_hash, expires_at, ip, created_at)
             VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND, ?, UTC_TIMESTAMP())',
            [$email, hash('sha256', $token), self::MAGIC_TTL, StSecurity::clientIpBinary()]
        );
        return $token;
    }

    /**
     * Consume a magic-link token. Returns the user row, creating the account on
     * first use (email is verified by possession of the mailbox). Null on failure.
     */
    public static function magicLinkConsume(string $email, string $token): ?array
    {
        $email = strtolower(trim($email));
        return StDb::tx(static function () use ($email, $token): ?array {
            $row = StDb::one(
                'SELECT * FROM st_magic_login_tokens
                  WHERE email = ? AND token_hash = ? AND consumed_at IS NULL
                    AND expires_at > UTC_TIMESTAMP()
                  ORDER BY id DESC LIMIT 1 FOR UPDATE',
                [$email, hash('sha256', $token)]
            );
            if ($row === null) {
                return null;
            }
            StDb::run('UPDATE st_magic_login_tokens SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [(int)$row['id']]);
            return self::findOrCreateUser($email, 'email', $email, true);
        });
    }

    // ------------------------------------------------------------------
    // OAuth
    // ------------------------------------------------------------------

    public static function oauthStartUrl(StConfig $config, string $provider): ?string
    {
        StSecurity::startSession();
        $state = bin2hex(random_bytes(24));
        $_SESSION[self::OAUTH_STATE_KEY] = ['provider' => $provider, 'state' => $state];
        $redirect = self::baseUrl($config) . '/auth/' . $provider . '/callback';

        if ($provider === 'google') {
            $clientId = $config->get('GOOGLE_CLIENT_ID');
            if (!$clientId) {
                return null;
            }
            return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
                'client_id' => $clientId,
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'scope' => 'openid email profile',
                'state' => $state,
                'access_type' => 'online',
            ]);
        }
        if ($provider === 'facebook') {
            $appId = $config->get('FACEBOOK_APP_ID');
            if (!$appId) {
                return null;
            }
            return 'https://www.facebook.com/v19.0/dialog/oauth?' . http_build_query([
                'client_id' => $appId,
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'scope' => 'email',
                'state' => $state,
            ]);
        }
        return null;
    }

    /**
     * Complete an OAuth callback. Returns the user row or null.
     * Validates the state parameter and the provider identity token.
     */
    public static function oauthCallback(StConfig $config, string $provider, array $query): ?array
    {
        StSecurity::startSession();
        $saved = $_SESSION[self::OAUTH_STATE_KEY] ?? null;
        unset($_SESSION[self::OAUTH_STATE_KEY]);
        $state = (string)($query['state'] ?? '');
        $code = (string)($query['code'] ?? '');
        if (!is_array($saved) || ($saved['provider'] ?? '') !== $provider
            || $state === '' || !hash_equals((string)$saved['state'], $state) || $code === '') {
            self::securityEvent('oauth_state_mismatch', null, null, ['provider' => $provider]);
            return null;
        }
        $redirect = self::baseUrl($config) . '/auth/' . $provider . '/callback';

        if ($provider === 'google') {
            $token = self::httpPost('https://oauth2.googleapis.com/token', [
                'code' => $code,
                'client_id' => (string)$config->get('GOOGLE_CLIENT_ID'),
                'client_secret' => (string)$config->get('GOOGLE_CLIENT_SECRET'),
                'redirect_uri' => $redirect,
                'grant_type' => 'authorization_code',
            ]);
            $idToken = $token['id_token'] ?? null;
            if (!is_string($idToken)) {
                return null;
            }
            // Validate the identity token with Google's tokeninfo endpoint.
            $claims = self::httpGet('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
            if (!is_array($claims)
                || ($claims['aud'] ?? '') !== $config->get('GOOGLE_CLIENT_ID')
                || !in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
                || (int)($claims['exp'] ?? 0) < time()) {
                self::securityEvent('oauth_token_invalid', null, null, ['provider' => 'google']);
                return null;
            }
            $email = strtolower((string)($claims['email'] ?? ''));
            $verified = ($claims['email_verified'] ?? 'false') === 'true';
            $sub = (string)($claims['sub'] ?? '');
            if ($email === '' || $sub === '' || !$verified) {
                return null;
            }
            return self::linkOrCreate($email, 'google', $sub, (string)($claims['name'] ?? ''), (string)($claims['picture'] ?? ''), true);
        }

        if ($provider === 'facebook') {
            $token = self::httpGet('https://graph.facebook.com/v19.0/oauth/access_token?' . http_build_query([
                'client_id' => (string)$config->get('FACEBOOK_APP_ID'),
                'client_secret' => (string)$config->get('FACEBOOK_APP_SECRET'),
                'redirect_uri' => $redirect,
                'code' => $code,
            ]));
            $accessToken = $token['access_token'] ?? null;
            if (!is_string($accessToken)) {
                return null;
            }
            // appsecret_proof proves we hold the app secret.
            $proof = hash_hmac('sha256', $accessToken, (string)$config->get('FACEBOOK_APP_SECRET'));
            $profile = self::httpGet('https://graph.facebook.com/v19.0/me?' . http_build_query([
                'fields' => 'id,name,email',
                'access_token' => $accessToken,
                'appsecret_proof' => $proof,
            ]));
            $fbId = (string)($profile['id'] ?? '');
            $email = strtolower((string)($profile['email'] ?? ''));
            if ($fbId === '' || $email === '') {
                // Facebook may not return an email (user declined) → cannot
                // link safely; ask the user to use email login instead.
                return null;
            }
            return self::linkOrCreate($email, 'facebook', $fbId, (string)($profile['name'] ?? ''), null, true);
        }
        return null;
    }

    /**
     * Link a provider to the account with the same verified email, or create a
     * new account. Provider rows are unique per (provider, provider_uid); an
     * existing row always resolves to its owner — never reassigned.
     */
    private static function linkOrCreate(string $email, string $provider, string $providerUid, string $name, ?string $avatar, bool $verified): ?array
    {
        return StDb::tx(static function () use ($email, $provider, $providerUid, $name, $avatar, $verified): ?array {
            $link = StDb::one(
                'SELECT user_id FROM st_user_auth_providers WHERE provider = ? AND provider_uid = ?',
                [$provider, $providerUid]
            );
            if ($link !== null) {
                $user = StDb::one('SELECT * FROM st_users WHERE id = ?', [(int)$link['user_id']]);
                return $user ?: null;
            }
            return self::findOrCreateUser($email, $provider, $providerUid, $verified, $name, $avatar);
        });
    }

    private static function findOrCreateUser(string $email, string $provider, string $providerUid, bool $verified, string $name = '', ?string $avatar = null): ?array
    {
        $user = StDb::one('SELECT * FROM st_users WHERE email = ?', [$email]);
        $now = StDb::utcNow();
        if ($user === null) {
            $userId = StDb::insert(
                'INSERT INTO st_users (public_id, email, display_name, avatar_url, email_verified_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    self::ulid(),
                    $email,
                    $name !== '' ? substr($name, 0, 120) : (strstr($email, '@', true) ?: $email),
                    $avatar !== null ? substr($avatar, 0, 500) : null,
                    $verified ? $now : null,
                    $now,
                    $now,
                ]
            );
            $user = StDb::one('SELECT * FROM st_users WHERE id = ?', [$userId]);
            self::event($userId, 'register', ['provider' => $provider]);
        } elseif ($verified && $user['email_verified_at'] === null) {
            StDb::run('UPDATE st_users SET email_verified_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?', [(int)$user['id']]);
        }
        // Record the provider link if not present.
        StDb::run(
            'INSERT IGNORE INTO st_user_auth_providers (user_id, provider, provider_uid, created_at)
             VALUES (?, ?, ?, UTC_TIMESTAMP())',
            [(int)$user['id'], $provider, $providerUid]
        );
        return $user;
    }

    // ------------------------------------------------------------------
    // Guest accounts
    // ------------------------------------------------------------------

    /** Guests get a placeholder address on the reserved .invalid TLD, so no
     *  email can ever be sent to them and the schema stays unchanged. */
    public const GUEST_DOMAIN = 'guest.invalid';

    public static function isGuest(?array $user): bool
    {
        return $user !== null && str_ends_with((string)($user['email'] ?? ''), '@' . self::GUEST_DOMAIN);
    }

    /** Create an anonymous account bound to this browser. Null if rate limited. */
    public static function createGuest(): ?array
    {
        if (!self::rateLimit('guest_created', null, 10, 3600)) {
            return null;
        }
        self::securityEvent('guest_created');
        $publicId = self::ulid();
        $now = StDb::utcNow();
        $userId = StDb::insert(
            'INSERT INTO st_users (public_id, email, display_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)',
            [$publicId, 'guest-' . strtolower($publicId) . '@' . self::GUEST_DOMAIN, 'Guest', $now, $now]
        );
        self::event($userId, 'register', ['provider' => 'guest']);
        return StDb::one('SELECT * FROM st_users WHERE id = ?', [$userId]);
    }

    /** Move a guest's work into the account they just signed in to, then retire the guest. */
    public static function mergeGuestInto(array $guest, int $targetUserId): void
    {
        $guestId = (int)$guest['id'];
        if (!self::isGuest($guest) || $guestId === $targetUserId) {
            return;
        }
        StDb::tx(static function () use ($guestId, $targetUserId): void {
            foreach (['st_projects', 'st_files', 'st_jobs', 'st_usage_events'] as $table) {
                StDb::run("UPDATE {$table} SET user_id = ? WHERE user_id = ?", [$targetUserId, $guestId]);
            }
            StDb::run('DELETE FROM st_sessions WHERE user_id = ?', [$guestId]);
            StDb::run(
                "UPDATE st_users SET status = 'deleted', deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?",
                [$guestId]
            );
        });
        self::event($targetUserId, 'guest_merged', ['guest_id' => $guestId]);
    }

    // ------------------------------------------------------------------
    // Utilities
    // ------------------------------------------------------------------

    public static function baseUrl(StConfig $config): string
    {
        return rtrim((string)$config->get('SVGTRACE_BASE_URL', 'https://adotind.com/svg-trace'), '/');
    }

    /** Crockford-base32 ULID (26 chars) for public identifiers. */
    public static function ulid(): string
    {
        $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        $time = (int)(microtime(true) * 1000);
        $out = '';
        for ($i = 9; $i >= 0; $i--) {
            $out .= $alphabet[($time >> ($i * 5)) & 31];
        }
        $bytes = random_bytes(10);
        $bits = 0;
        $value = 0;
        for ($i = 0; $i < 16; $i++) {
            while ($bits < 5) {
                $value = ($value << 8) | ord($bytes[intdiv($i * 5, 8)]);
                $bits += 8;
            }
            $bits -= 5;
            $out .= $alphabet[($value >> $bits) & 31];
        }
        return $out;
    }

    private static function httpPost(string $url, array $fields): ?array
    {
        return self::httpRequest($url, http_build_query($fields), true);
    }

    private static function httpGet(string $url): ?array
    {
        return self::httpRequest($url, null, false);
    }

    private static function httpRequest(string $url, ?string $postBody, bool $isPost): ?array
    {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ];
        if ($isPost) {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = $postBody;
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($raw) || $code < 200 || $code >= 300) {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
