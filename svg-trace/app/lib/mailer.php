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

        try {
            if (!str_starts_with($read(), '220')) {
                return false;
            }
            if (!str_starts_with($cmd('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost')), '250')) {
                return false;
            }
            if (!str_starts_with($cmd('AUTH LOGIN'), '334')) {
                return false;
            }
            if (!str_starts_with($cmd(base64_encode($user)), '334')) {
                return false;
            }
            if (!str_starts_with($cmd(base64_encode($pass)), '235')) {
                return false;
            }
            if (!str_starts_with($cmd('MAIL FROM:<' . $from . '>'), '250')) {
                return false;
            }
            if (!str_starts_with($cmd('RCPT TO:<' . $toEmail . '>'), '25')) {
                return false;
            }
            if (!str_starts_with($cmd('DATA'), '354')) {
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
            if (!str_starts_with($cmd($payload), '250')) {
                return false;
            }
            $cmd('QUIT');
            return true;
        } finally {
            fclose($fp);
        }
    }
}
