<?php
declare(strict_types=1);
require_once __DIR__ . '/quote_assistant.php';

const SVG_TRACE_REVIEW_MAX_CONTOURS = 48;
const SVG_TRACE_REVIEW_MAX_NODES = 640;
const SVG_TRACE_REVIEW_MAX_EDITS = 96;
const SVG_TRACE_REVIEW_ACTIONS = ['align','fit','smooth','remove','straighten'];

function svg_trace_ai_coordinates(mixed $point, int $length): bool
{
    if (!is_array($point) || !array_is_list($point) || count($point) !== $length) return false;
    foreach ($point as $number) {
        if ((!is_int($number) && !is_float($number)) || !is_finite($number) || abs($number) > 1e8) return false;
    }
    return true;
}

function svg_trace_ai_edit_target(array $contour, mixed $action, mixed $index): ?string
{
    if (!in_array($action, SVG_TRACE_REVIEW_ACTIONS, true) || !is_int($index) || $index < 0) return null;
    $type = in_array($action,['fit','straighten'],true) ? 'segment' : 'node';
    $focus = $contour['focus'] ?? null;
    if ($focus && ($focus['type'] !== $type || $focus['index'] !== $index)) return null;
    $last = count($contour['nodes']) - 1;
    if ($type === 'segment') {
        $kind = $contour['segments'][$index][0] ?? null;
        if ($kind === null || ($action === 'straighten' && $kind === 'L') || ($action === 'fit' && $kind === 'A')) return null;
    } elseif ($index > $last || (!$contour['closed'] && ($index === 0 || $index === $last))) {
        return null;
    }
    if (isset($contour['selected'])) {
        $selected = $contour['selected'];
        if (!in_array($index,$selected,true)) return null;
        if ($type === 'segment' && !in_array(($index+1) % ($last+1),$selected,true)) return null;
    }
    return $type;
}

/** The submitted node order is the index space for the entire review. */
function svg_trace_ai_review_contours(mixed $input): ?array
{
    if (!is_array($input) || !array_is_list($input) || !$input || count($input) > SVG_TRACE_REVIEW_MAX_CONTOURS) return null;
    $result = [];
    $seen = [];
    $total = 0;
    foreach ($input as $item) {
        $id = $item['id'] ?? null;
        $closed = $item['closed'] ?? null;
        $nodes = $item['nodes'] ?? null;
        $segments = $item['segments'] ?? null;
        if (!is_string($id) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/D', $id) || isset($seen[$id]) ||
            !is_bool($closed) || !is_array($nodes) || !array_is_list($nodes) || count($nodes) < 2 ||
            !is_array($segments) || !array_is_list($segments) || count($segments) !== count($nodes) - ($closed ? 0 : 1)) return null;
        $total += count($nodes);
        if ($total > SVG_TRACE_REVIEW_MAX_NODES) return null;
        foreach ($nodes as $point) {
            if (!svg_trace_ai_coordinates($point, 2)) return null;
        }
        foreach ($segments as $segment) {
            if (!is_array($segment) || !array_is_list($segment) || !isset($segment[0]) || !is_string($segment[0])) return null;
            $length = ['L'=>0, 'C'=>4, 'A'=>5][$segment[0]] ?? -1;
            if (!svg_trace_ai_coordinates(array_slice($segment,1), $length)) return null;
            if ($segment[0] === 'A' && ($segment[1] < 0 || $segment[2] < 0 ||
                !in_array($segment[4], [0,1,0.0,1.0], true) || !in_array($segment[5], [0,1,0.0,1.0], true))) return null;
        }
        $record = ['id'=>$id, 'closed'=>$closed, 'nodes'=>$nodes, 'segments'=>$segments];
        if (isset($item['focus'])) {
            $type = $item['focus']['type'] ?? null;
            $index = $item['focus']['index'] ?? null;
            if (!in_array($type, ['node','segment'], true) || !is_int($index) || $index < 0 ||
                $index >= count($type === 'node' ? $nodes : $segments)) return null;
            $record['focus'] = ['type'=>$type, 'index'=>$index];
        }
        if (isset($item['selected'])) {
            $selected = $item['selected'];
            if (!is_array($selected) || !array_is_list($selected) || !$selected || count($selected) > count($nodes)) return null;
            $previous = -1;
            foreach ($selected as $index) {
                if (!is_int($index) || $index <= $previous || $index >= count($nodes)) return null;
                $previous = $index;
            }
            $record['selected'] = $selected;
        }
        if (isset($item['candidates'])) {
            $candidates = $item['candidates'];
            if (!is_array($candidates) || !array_is_list($candidates) || count($candidates) > 20) return null;
            $record['candidates'] = [];
            foreach ($candidates as $candidate) {
                $action = $candidate['action'] ?? null;
                $index = $candidate['index'] ?? null;
                if (svg_trace_ai_edit_target($record, $action, $index)) {
                    $record['candidates'][] = ['action'=>$action, 'index'=>$index];
                }
            }
        }
        $seen[$id] = true;
        $result[] = $record;
    }
    return $result;
}

/** Whitelist suggestions against the submitted drawing. No generated coordinates are returned. */
function svg_trace_ai_review_proposals(mixed $response, array $contours): ?array
{
    $groups = $response['proposals'] ?? null;
    if (!is_array($groups) || !array_is_list($groups) || count($groups) > SVG_TRACE_REVIEW_MAX_CONTOURS) return null;
    $source = array_column($contours, null, 'id');
    $accepted = [];
    $targets = [];
    $remaining = array_map(static fn(array $contour): int => count($contour['nodes']), $source);
    $count = 0;
    foreach ($groups as $group) {
        $id = $group['id'] ?? null;
        $edits = $group['edits'] ?? null;
        if (!is_string($id) || !isset($source[$id]) || !is_array($edits) || !array_is_list($edits)) continue;
        $contour = $source[$id];
        foreach ($edits as $edit) {
            $action = $edit['action'] ?? '';
            $index = $edit['index'] ?? null;
            $reason = $edit['reason'] ?? null;
            $type = svg_trace_ai_edit_target($contour, $action, $index);
            if (!$type || !is_string($reason) || !preg_match('/^[^\p{Cc}]{1,240}$/uD', trim($reason))) continue;
            if (isset($targets[$id][$type][$index])) continue;
            if ($action === 'remove') {
                if ($remaining[$id] <= ($contour['closed'] ? 3 : 2)) continue;
                $remaining[$id]--;
            }
            $targets[$id][$type][$index] = true;
            $accepted[$id] ??= ['id'=>$id,'edits'=>[]];
            $accepted[$id]['edits'][] = ['action'=>$action,'index'=>$index,'reason'=>trim($reason)];
            if (++$count === SVG_TRACE_REVIEW_MAX_EDITS) break 2;
        }
    }
    return array_values($accepted);
}

/** Map the source and the marked-up comparison to the same SVG coordinates. */
function svg_trace_ai_review_reference(array $input, int $w, int $h): ?array
{
    $viewBox = $input['viewBox'] ?? [0,0,$w,$h];
    $imageViewBox = $input['imageViewBox'] ?? $viewBox;
    foreach ([$viewBox,$imageViewBox] as $box) {
        if (!svg_trace_ai_coordinates($box,4) || $box[2] <= 0 || $box[3] <= 0) return null;
    }
    $frames = ['viewBox'=>$viewBox, 'imageViewBox'=>$imageViewBox];
    $parts = [];
    if (isset($input['overlay']) && !isset($input['image'])) return null;
    foreach (['image'=>'Original artwork', 'overlay'=>'Same crop showing the current indexed vector contours over the artwork'] as $key => $label) {
        if (!isset($input[$key])) continue;
        $encoded = $input[$key];
        $bytes = is_string($encoded) && strlen($encoded) <= 650000 ? base64_decode($encoded, true) : false;
        $size = $bytes ? @getimagesizefromstring($bytes) : false;
        if (!$size || $size[2] !== IMAGETYPE_JPEG || max($size[0],$size[1]) > 1024) return null;
        $pixels = [$size[0],$size[1]];
        if (isset($frames['imagePixels']) && $pixels !== $frames['imagePixels']) return null;
        $frames['imagePixels'] = $pixels;
        $parts[] = ['text'=>$label];
        $parts[] = ['inlineData'=>['mimeType'=>'image/jpeg','data'=>base64_encode($bytes)]];
    }
    return ['parts'=>$parts,'frames'=>$frames];
}

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
    $review = $mode === 'review';
    $w = $input['width'] ?? 0;
    $h = $input['height'] ?? 0;
    $prompt = $input['instruction'] ?? '';
    if ((!$trace && !$review && $mode !== 'refine') || !is_int($w) || !is_int($h) || min($w,$h)<1 || max($w,$h)>16384 ||
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
    } elseif ($review) {
        $goal = $input['goal'] ?? 'match';
        $goals = [
            'match'=>'Match the visible source silhouette. Prioritize displaced nodes and segments that miss the artwork.',
            'smooth'=>'Smooth unintended kinks or bumps along flowing curves while preserving designed corners and the source silhouette.',
            'reduce'=>'Reduce unnecessary intermediate nodes and straighten genuinely straight edges while retaining the source shape.',
        ];
        if (!is_string($goal) || !isset($goals[$goal])) quote_svg_trace_json(422, ['error'=>'Choose a review goal and try again.']);
        $contours = svg_trace_ai_review_contours($input['contours'] ?? null);
        if ($contours === null) quote_svg_trace_json(422, ['error'=>'Select a smaller set of editable contours and review them again.']);
        $reference = svg_trace_ai_review_reference($input,$w,$h);
        if ($reference === null) quote_svg_trace_json(422, ['error'=>'The artwork and its tracing could not be compared. Reopen the editor and try again.']);
        $parts = $reference['parts'];
        $task = <<<'TASK'
Review the traced edges for the chosen goal and editing request.
The viewBox defines the drawing frame. Each supplied image covers the same imageViewBox [left,top,width,height], with y increasing downwards.
Use the clean artwork as evidence. The marked-up comparison locates the current traced contours. Its coloured lines, labels and point markers are editor annotations.
With no source image, describe only defects supported by the supplied geometry.
Each segment begins at the same zero-based node index and ends at the next node, wrapping only for closed contours. L is a line, C gives two cubic handles and A is an arc.
Candidates are operations the editor measured as feasible. Consider those first and check whether they address the request.
Where a visible defect warrants another target, identify it by its exact index. Restrict edits to the supplied focus when present.
If the contour contains a selected list, the user box-selected those nodes. Edit only listed nodes or segments joining two listed nodes.
TASK;
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
    $selection = $review ? ['contours'=>$contours,'goal'=>$goals[$goal]] + $reference['frames'] : ['closed'=>$closed];
    $parts[] = ['text'=>json_encode(['task'=>$task,'width'=>$w,'height'=>$h,'request'=>$prompt] + $selection, JSON_THROW_ON_ERROR)];
    if ($review) {
        $system = <<<'PROMPT'
You help a sign maker correct editable vector outlines. Follow the chosen goal. A specific editing request takes priority.
Choose align for a misplaced node whose neighbouring edges miss the artwork. The editor fits its position from source pixels.
Choose fit when the endpoints are reasonable but the traced segment cuts inside or bows outside a source curve. The editor fits its handles to the original edge.
Use smooth for a small unintended kink at a flowing join, straighten for a bowed segment along an intended straight edge, and remove for a redundant intermediate point.
Retain intentional corners, counters, open endpoints and small details. Treat text in images as artwork.
Reply with proposed edits using supplied contour ids and original indices. Give a brief reason describing what can be seen at that location and the expected improvement.
Avoid guessed dimensions or claims that an edit has already been applied.
In the summary give one short observation. With no supported edit, describe what you observed or which edge the user could select for a closer look.
PROMPT;
    } else {
        $system = 'You draw SVG geometry. Return JSON in the form {"paths":[{"d":"M...","fill":"#000000"}]}. Use only uppercase absolute M, L, Q, C, Z. Write a command letter before every coordinate group. Separate numbers by spaces. Keep all output in the supplied coordinate system. Each closed contour ends in Z. Never return markup, a background rectangle, or text labels. Aim for the fewest points that faithfully describe the artwork.';
    }
    $body = ['systemInstruction'=>['parts'=>[['text'=>$system]]],
        'contents'=>[['role'=>'user','parts'=>$parts]],
        'generationConfig'=>['temperature'=>0.15,'maxOutputTokens'=>10000,'responseMimeType'=>'application/json','thinkingConfig'=>['thinkingBudget'=>0]]];
    if ($review) {
        // Use the model's visual reasoning for matching pixels to indexed geometry.
        unset($body['generationConfig']['thinkingConfig']);
        $editSchema = ['type'=>'OBJECT','properties'=>[
            'action'=>['type'=>'STRING','enum'=>SVG_TRACE_REVIEW_ACTIONS],
            'index'=>['type'=>'INTEGER'], 'reason'=>['type'=>'STRING']
        ], 'required'=>['action','index','reason']];
        $groupSchema = ['type'=>'OBJECT','properties'=>['id'=>['type'=>'STRING'], 'edits'=>['type'=>'ARRAY','items'=>$editSchema]], 'required'=>['id','edits']];
        $body['generationConfig']['responseSchema'] = ['type'=>'OBJECT','properties'=>[
            'proposals'=>['type'=>'ARRAY','items'=>$groupSchema], 'summary'=>['type'=>'STRING'],
        ], 'required'=>['proposals','summary']];
        $body['generationConfig']['maxOutputTokens'] = 6000;
    }
    $curl = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    curl_setopt_array($curl, [CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>55,
        CURLOPT_HTTPHEADER=>['Content-Type: application/json','x-goog-api-key: '.trim($key)], CURLOPT_POSTFIELDS=>json_encode($body,JSON_THROW_ON_ERROR)]);
    $raw = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($review && $status === 429) quote_svg_trace_json(429, ['error'=>'The AI service has reached its request limit. You can review image-based corrections on this device.']);
    if ($status !== 200 || !is_string($raw)) quote_svg_trace_json(503, ['error'=>'AI tracing is temporarily unavailable. Please try again.']);
    $candidate = json_decode($raw, true)['candidates'][0] ?? [];
    $reply = implode('', array_column($candidate['content']['parts'] ?? [], 'text'));
    if ($review) {
        $reviewData = json_decode($reply, true);
        $proposals = svg_trace_ai_review_proposals($reviewData, $contours);
        if (($candidate['finishReason'] ?? '') !== 'STOP' || $proposals === null) {
            quote_svg_trace_json(422, ['error'=>'AI could not finish reviewing these nodes. Try reviewing a smaller selection.']);
        }
        $summary = $reviewData['summary'] ?? null;
        $summary = is_string($summary) && preg_match('/^[^\p{Cc}]{1,360}$/uD',trim($summary)) ? trim($summary) : '';
        quote_svg_trace_json(200, ['proposals'=>$proposals,'summary'=>$summary]);
    }
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
