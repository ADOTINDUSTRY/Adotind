<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — security helpers: CSRF, sessions, rate limiting primitives.
 * No external dependencies. PHP 8.1+.
 */

final class StSecurity
{
    public const CSRF_SESSION_KEY = 'st_csrf';
    public const SESSION_TTL = 60 * 60 * 24 * 14; // 14 days idle expiry

    /**
     * Start a hardened session. Cookie is HttpOnly, Secure (on HTTPS),
     * SameSite=Lax (allows top-level OAuth redirects back to us).
     */
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $secure = (($_SERVER['HTTPS'] ?? '') === 'on')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        session_name('STSESSID');
        session_set_cookie_params([
            'lifetime' => 0, // session cookie; expiry enforced server-side
            'path' => '/svg-trace',
            'domain' => '',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
    }

    /** Call after any privilege change (login, logout, role change). */
    public static function regenerateSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
    }

    public static function csrfToken(): string
    {
        self::startSession();
        if (empty($_SESSION[self::CSRF_SESSION_KEY])) {
            $_SESSION[self::CSRF_SESSION_KEY] = bin2hex(random_bytes(32));
        }
        return (string)$_SESSION[self::CSRF_SESSION_KEY];
    }

    public static function csrfField(): string
    {
        return '<input type="hidden" name="csrf_token" value="'
            . htmlspecialchars(self::csrfToken(), ENT_QUOTES, 'UTF-8') . '" />';
    }

    public static function csrfValidate(?string $token): bool
    {
        self::startSession();
        $expected = (string)($_SESSION[self::CSRF_SESSION_KEY] ?? '');
        return $expected !== '' && is_string($token) && hash_equals($expected, $token);
    }

    public static function clientIp(): string
    {
        // Trust REMOTE_ADDR only; proxy headers are spoofable without a
        // trusted-proxy list. Good enough for rate limiting + audit.
        return (string)($_SERVER['REMOTE_ADDR'] ?? '');
    }

    public static function clientIpBinary(): ?string
    {
        $ip = self::clientIp();
        $bin = @inet_pton($ip);
        return $bin === false ? null : $bin;
    }

    /** Escape helper for HTML contexts. */
    public static function e(?string $value): string
    {
        return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Sanitise an SVG document for safe preview/download:
     * strips scripts, event handlers, external references, and foreignObject.
     * Operates on the DOM; returns null if the document is not parseable XML.
     */
    public static function sanitiseSvg(string $svg, bool $trustedLarge = false): ?string
    {
        // Untrusted documents must never contain a DOCTYPE (entity expansion).
        if (preg_match('/<!DOCTYPE/i', $svg) === 1) {
            return null;
        }
        $prev = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        $dom->preserveWhiteSpace = true;
        // Engine output may have path data beyond libxml's 10 MB node limit.
        $ok = $dom->loadXML($svg, LIBXML_NONET | ($trustedLarge ? LIBXML_PARSEHUGE : 0));
        libxml_use_internal_errors($prev);
        if (!$ok || $dom->documentElement === null
            || strtolower($dom->documentElement->tagName) !== 'svg') {
            return null;
        }

        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('svg', 'http://www.w3.org/2000/svg');
        // Remove dangerous elements entirely (namespace-aware).
        $dangerous = ['script', 'foreignObject', 'iframe', 'embed', 'object',
                      'link', 'use', 'handler', 'listener', 'set', 'animate'];
        $toDelete = [];
        foreach ($dom->getElementsByTagName('*') as $el) {
            /** @var DOMElement $el */
            if (in_array(strtolower($el->localName), array_map('strtolower', $dangerous), true)) {
                $toDelete[] = $el;
            }
        }
        foreach ($toDelete as $node) {
            $node->parentNode?->removeChild($node);
        }
        // Scrub dangerous attributes on every remaining element.
        foreach ($dom->getElementsByTagName('*') as $el) {
            /** @var DOMElement $el */
            $toRemove = [];
            foreach ($el->attributes as $attr) {
                $attrNode = $attr->nodeName === $attr->name ? $attr->localName : $attr->nodeName;
                $name = strtolower((string)$attrNode);
                if ($attr->namespaceURI === 'http://www.w3.org/1999/xlink'
                    && strtolower((string)$attr->localName) === 'href') {
                    $name = 'xlink:href';
                }
                $value = trim(strtolower($attr->value));
                $valueSquashed = preg_replace('/[\s\x00-\x1f]+/', '', $value) ?? '';
                if (str_starts_with($name, 'on')) {
                    $toRemove[] = $attr;
                    continue;
                }
                if (in_array($name, ['href', 'xlink:href'], true)) {
                    if (str_starts_with($valueSquashed, 'javascript:')
                        || str_starts_with($valueSquashed, 'data:text/html')
                        || preg_match('#^https?://#', $valueSquashed) === 1) {
                        $toRemove[] = $attr;
                    }
                    continue;
                }
                if ($name === 'style'
                    && (str_contains($valueSquashed, 'url(')
                        || str_contains($valueSquashed, 'expression('))) {
                    $toRemove[] = $attr;
                }
            }
            foreach ($toRemove as $attr) {
                $el->removeAttributeNode($attr);
            }
            // Drop image elements left without a valid (local) href.
            if (strtolower((string)$el->localName) === 'image'
                && !$el->hasAttribute('href')
                && !$el->hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
                $el->parentNode?->removeChild($el);
            }
        }
        $clean = $dom->saveXML($dom->documentElement);
        return is_string($clean) ? $clean : null;
    }
}
