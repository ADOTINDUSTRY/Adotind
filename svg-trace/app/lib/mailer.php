<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — minimal SMTP client (TLS), because mail()/mb_send_mail is
 * disabled on Hostinger. Sends plain-text mail via smtp.hostinger.com:465.
 * No external dependencies.
 */

require_once __DIR__ . '/config.php';

final class StMailer
{
    /** @return bool true when the server accepted the message */
    public static function send(StConfig $config, string $toEmail, string $subject, string $bodyText): bool
    {
        $host = $config->get('MAIL_HOST', 'smtp.hostinger.com');
        $port = (int)$config->get('MAIL_PORT', '465');
        $user = $config->get('MAIL_USERNAME', '');
        $pass = $config->get('MAIL_PASSWORD', '');
        $from = $config->get('MAIL_FROM', $user);
        $fromName = $config->get('MAIL_FROM_NAME', 'A Dot SVG Trace');
        if ($user === '' || $pass === '' || $from === '' || $from === null) {
            return false; // mail not configured; caller decides the UX
        }

        $fp = @fsockopen('ssl://' . $host, $port, $errno, $errstr, 15);
        if (!is_resource($fp)) {
            error_log(sprintf('[svg-trace] SMTP connect to %s:%d failed: %s', $host, $port, $errstr));
            return false;
        }
        stream_set_timeout($fp, 15);
        $read = static function () use ($fp): string {
            $data = '';
            while (($line = fgets($fp, 515)) !== false) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break; // last line of a multiline reply
                }
            }
            return $data;
        };
        $cmd = static function (string $command) use ($fp, $read): string {
            fwrite($fp, $command . "\r\n");
            return $read();
        };

        // Log the failing step and the server reply code only (never credentials).
        $expect = static function (string $step, string $reply, string $code) use ($host, $port): bool {
            if (str_starts_with($reply, $code)) {
                return true;
            }
            error_log(sprintf('[svg-trace] SMTP %s:%d failed at %s: %s', $host, $port, $step, substr(trim($reply), 0, 120)));
            return false;
        };

        try {
            if (!$expect('greeting', $read(), '220')
                || !$expect('EHLO', $cmd('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost')), '250')
                || !$expect('AUTH', $cmd('AUTH LOGIN'), '334')
                || !$expect('username', $cmd(base64_encode($user)), '334')
                || !$expect('password', $cmd(base64_encode($pass)), '235')
                || !$expect('MAIL FROM', $cmd('MAIL FROM:<' . $from . '>'), '250')
                || !$expect('RCPT TO', $cmd('RCPT TO:<' . $toEmail . '>'), '25')
                || !$expect('DATA', $cmd('DATA'), '354')) {
                return false;
            }

            $encodeHeader = static fn(string $s): string =>
                '=?UTF-8?B?' . base64_encode($s) . '?=';
            $headers = [
                'From: ' . $encodeHeader($fromName) . ' <' . $from . '>',
                'To: <' . $toEmail . '>',
                'Subject: ' . $encodeHeader($subject),
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: base64',
                'Date: ' . gmdate('r'),
            ];
            // Dot-stuff the body per RFC 5321.
            $body = preg_replace('/\r?\n/', "\r\n", $bodyText) ?? $bodyText;
            $body = preg_replace('/^\./m', '..', $body) ?? $body;
            $payload = implode("\r\n", $headers) . "\r\n\r\n"
                . chunk_split(base64_encode($body)) . "\r\n.";
            if (!$expect('message', $cmd($payload), '250')) {
                return false;
            }
            $cmd('QUIT');
            return true;
        } finally {
            fclose($fp);
        }
    }
}
