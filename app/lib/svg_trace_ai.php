<?php
declare(strict_types=1);
require_once __DIR__ . '/quote_assistant.php';

/** Accept geometry only. Every segment must have its own absolute command. */
function svg_trace_ai_path(mixed $path, int $w, int $h, bool $closed, bool $single): ?string
{
    if (!is_string($path) || strlen($path) > 32000) return null;
    $path = trim($path);
    $arity = ['M'=>2, 'L'=>2, 'Q'=>4, 'C'=>6, 'Z'=>0];
    $parts = preg_split('/(?=[MLQCZ])/', $path, -1, PREG_SPLIT_NO_EMPTY);
    if (!$parts || count($parts) > 1600 || $parts[0][0] !== 'M') return null;
    $starts = $edges = 0;
    $open = false;
    $clean = [];
    foreach ($parts as $part) {
        $command = $part[0];
        $args = trim(substr($part, 1));
        $numbers = $args === '' ? [] : preg_split('/[\s,]+/', $args);
        if (count($numbers) !== ($arity[$command] ?? -1)) return null;
        foreach ($numbers as $i => $value) {
            if (!is_numeric($value) || abs((float)$value) > 3 * ($i % 2 ? $h : $w)) return null;
        }
        if ($command === 'M') {
            if ($open || ($single && $starts)) return null;
            $starts++;
            $open = true;
            $edges = 0;
        } elseif (!$open) {
            return null;
        } elseif ($command === 'Z') {
            if (!$closed || $edges < 1) return null;
            $open = false;
        } else {
            $edges++;
        }
        $clean[] = $command . implode(' ', $numbers);
    }
    return $edges && $open !== $closed ? implode(' ', $clean) : null;
}

function svg_trace_ai_handle(): never
{
    $input = json_decode((string)file_get_contents('php://input', false, null, 0, 1500001), true);
    if (!is_array($input)) quote_svg_trace_json(400, ['error'=>'This trace request could not be read.']);
    $mode = $input['mode'] ?? null;
    $trace = $mode === 'trace';
    $w = $input['width'] ?? 0;
    $h = $input['height'] ?? 0;
    $prompt = $input['instruction'] ?? '';
    if ((!$trace && $mode !== 'refine') || !is_int($w) || !is_int($h) || min($w,$h)<1 || max($w,$h)>16384 ||
        !is_string($prompt) || strlen($prompt)>1500) quote_svg_trace_json(422, ['error'=>'Choose artwork and enter a short editing instruction.']);
    $parts = [];
    $closed = true;
    if ($trace) {
        $encoded = $input['image'] ?? '';
        $bytes = is_string($encoded) && strlen($encoded)<1400000 ? base64_decode($encoded, true) : false;
        $size = $bytes ? @getimagesizefromstring($bytes) : false;
        if (!$size || $size[2] !== IMAGETYPE_JPEG || $w !== $size[0] || $h !== $size[1] || max($w,$h)>960) {
            quote_svg_trace_json(422, ['error'=>'Choose an image to trace again.']);
        }
        $parts[] = ['inlineData'=>['mimeType'=>'image/jpeg','data'=>base64_encode($bytes)]];
        $task = 'Visually trace the supplied raster into accurate editable vector paths in its pixel coordinates. Keep silhouettes, sharp corners, true smooth curves, letter counters, dots and major flat colours. Omit the background. Use multiple closed subpaths in one path with evenodd fill for holes. Layer from back to front. Do not identify the font or substitute text.';
    } else {
        $contour = $input['contour'] ?? '';
        $closed = $input['closed'] ?? null;
        if (!is_bool($closed) || !is_string($contour) || strlen($contour)>22000 || !preg_match('/^M[MLCAZ0-9eE+.,\s-]+$/D',$contour)) {
            quote_svg_trace_json(422, ['error'=>'Select one editable contour with fewer points.']);
        }
        $task = 'Refine only the given contour as requested. Keep its visual identity, position, scale, direction and winding. Preserve open endpoints or closed topology. Return exactly one path with exactly one M. Preserve original geometry where no change was requested. Input contour: ' . $contour;
    }
    $key = getenv('GEMINI_API_KEY');
    if (!$key) quote_svg_trace_json(503, ['error'=>'The AI connection is unavailable. Manual tracing and point editing are available.']);
    quote_assistant_reserve_call();
    session_write_close();
    $parts[] = ['text'=>json_encode(['task'=>$task,'width'=>$w,'height'=>$h,'closed'=>$closed,'request'=>$prompt], JSON_THROW_ON_ERROR)];
    $body = ['systemInstruction'=>['parts'=>[['text'=>'You draw SVG geometry. Return JSON in the form {"paths":[{"d":"M...","fill":"#000000"}]}. Use only uppercase absolute M, L, Q, C, Z. Write a command letter before every coordinate group. Separate numbers by spaces. Keep all output in the supplied coordinate system. Each closed contour ends in Z. Never return markup, a background rectangle, or text labels. Aim for the fewest points that faithfully describe the artwork.']]],
        'contents'=>[['role'=>'user','parts'=>$parts]],
        'generationConfig'=>['temperature'=>0.15,'maxOutputTokens'=>10000,'responseMimeType'=>'application/json','thinkingConfig'=>['thinkingBudget'=>0]]];
    $curl = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    curl_setopt_array($curl, [CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>55,
        CURLOPT_HTTPHEADER=>['Content-Type: application/json','x-goog-api-key: '.trim($key)], CURLOPT_POSTFIELDS=>json_encode($body,JSON_THROW_ON_ERROR)]);
    $raw = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($status !== 200 || !is_string($raw)) quote_svg_trace_json(503, ['error'=>'AI tracing is temporarily unavailable. Please try again.']);
    $candidate = json_decode($raw, true)['candidates'][0] ?? [];
    $reply = implode('', array_column($candidate['content']['parts'] ?? [], 'text'));
    $paths = json_decode($reply, true)['paths'] ?? null;
    if (($candidate['finishReason'] ?? '') !== 'STOP' || !is_array($paths) || !$paths || count($paths)>($trace ? 80 : 1)) {
        quote_svg_trace_json(422, ['error'=>'AI could not finish the drawing. Try a simpler image or a smaller contour.']);
    }
    $drawing = [];
    foreach ($paths as $path) {
        $d = svg_trace_ai_path($path['d'] ?? null,$w,$h,$closed,!$trace);
        $fill = $path['fill'] ?? '';
        if (!$d || !is_string($fill) || !preg_match('/^#[a-f0-9]{6}$/iD',$fill)) {
            quote_svg_trace_json(422, ['error'=>'AI returned an incomplete curve. Your drawing is safe. Try again.']);
        }
        $drawing[] = ['d'=>$d,'fill'=>$fill];
    }
    quote_svg_trace_json(200, ['paths'=>$drawing]);
}
