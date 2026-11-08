<?php
/**
 * A Dot SVG Trace - line output for neon signs, routers, plotters and cutters.
 *
 *   centreline() - one stroke down the middle of every line (the path a neon tube
 *                  or an engraving bit follows). VTracer only traces shape edges,
 *                  so this is done here: colour layers -> despeckle -> thinning
 *                  (Zhang-Suen) -> skeleton graph -> spur pruning -> straight-through
 *                  joins at crossings -> smoothing -> cubic Bezier curves.
 *   outline()    - the traced shapes as thin strokes with no fill.
 */
declare(strict_types=1);

final class StLines
{
    /** Longest side of the image the centre-line tracer works on. */
    public const WORK_SIDE = 1200;
    public const MAX_WORK_PIXELS = 1600000;

    private const MAX_LAYERS = 16;

    /**
     * Trace centre lines of the prepared (palette-snapped) PNG.
     *
     * @param array<string,mixed> $s normalised settings
     * @return array{svg:string,paths:int}|null
     */
    public static function centreline(string $png, ?string $keyHex, array $s): ?array
    {
        $img = @imagecreatefrompng($png);
        if (!$img) {
            return null;
        }
        $w = imagesx($img);
        $h = imagesy($img);
        $W = $w + 2; // one pixel of padding all round avoids bounds checks
        $bw = ($s['colormode'] ?? 'color') === 'bw';
        $key = $keyHex !== null ? (int)hexdec(ltrim($keyHex, '#')) : null;

        // Layer id per pixel (0 = background).
        $ids = [];
        $rows = [];
        $count = [];
        for ($y = 0; $y < $h; $y++) {
            $row = '';
            for ($x = 0; $x < $w; $x++) {
                $c = imagecolorat($img, $x, $y) & 0xFFFFFF;
                if ($bw) {
                    $id = (($c >> 16) + (($c >> 8) & 255) + ($c & 255)) < 384 ? 1 : 0;
                    $ids[0x000000] = 1;
                } elseif ($c === $key) {
                    $id = 0;
                } else {
                    $id = $ids[$c] ?? 0;
                    if ($id === 0) {
                        if (count($ids) >= self::MAX_LAYERS) {
                            $id = 0;
                        } else {
                            $id = $ids[$c] = count($ids) + 1;
                        }
                    }
                }
                $row .= chr($id);
                if ($id) {
                    $count[$id] = ($count[$id] ?? 0) + 1;
                }
            }
            $rows[] = "\0" . $row . "\0";
        }
        unset($img);
        $pad = str_repeat("\0", $W);
        $pix = $pad . implode('', $rows) . $pad;
        unset($rows);

        // Without a key colour the largest layer touching the border is background.
        if (!$bw && $key === null && $ids) {
            $border = [];
            for ($x = 1; $x <= $w; $x++) {
                foreach ([$W + $x, $h * $W + $x] as $i) {
                    $id = ord($pix[$i]);
                    $border[$id] = ($border[$id] ?? 0) + 1;
                }
            }
            arsort($border);
            $bgId = (int)array_key_first($border);
            if ($bgId > 0) {
                $pix = strtr($pix, chr($bgId), "\0");
                unset($count[$bgId]);
            }
        }

        $speckle = max(1, (int)($s['filter_speckle'] ?? 4));
        $minArea = $speckle * $speckle;
        $eps = max(0.5, (float)($s['segment_length'] ?? 4.0) * 0.25);
        $corner = (float)($s['corner_threshold'] ?? 60);
        $straight = ($s['mode'] ?? 'spline') !== 'spline';
        $prec = max(0, min(3, (int)($s['path_precision'] ?? 2)));
        $sw = round(max(1.0, max($w, $h) / 220), 2);

        $out = '';
        $paths = 0;
        arsort($count);
        foreach ($count as $id => $area) {
            if ($area < $minArea) {
                continue;
            }
            $rgb = (int)array_search($id, $ids, true);
            $hex = $bw ? '#000000' : sprintf('#%06x', $rgb);
            $m = strtr($pix, [chr($id) => "\1"] + self::zeroMap($id));
            $box = self::bbox($m, $W);
            if ($box === null) {
                continue;
            }
            self::flipSmall($m, $W, $box, "\1", $minArea);
            self::flipSmall($m, $W, $box, "\0", $minArea);
            $fgArea = substr_count($m, "\1");
            $shape = $m;
            self::thin($m, $W, $box);
            self::unstair($m, $W, $box);
            $lines = self::graph($m, $shape, $W, $box, $fgArea, $speckle);
            $d = '';
            foreach ($lines as [$pts, $closed]) {
                $pts = self::smooth($pts, $closed);
                $pts = self::simplify($pts, $eps, $closed);
                if (count($pts) < 2) {
                    continue;
                }
                $d .= self::pathData($pts, $closed, $corner, $straight, $prec);
                $paths++;
            }
            if ($d !== '') {
                $out .= '<path d="' . trim($d) . '" fill="none" stroke="' . $hex . '" stroke-width="' . $sw
                    . '" stroke-linecap="round" stroke-linejoin="round"/>' . "\n";
            }
        }

        $svg = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="' . $w . '" height="' . $h . '">' . "\n"
            . $out . '</svg>' . "\n";
        return ['svg' => $svg, 'paths' => $paths];
    }

    /**
     * Turn filled shapes into stroked outlines. Holes (even-odd subpaths) become
     * inner outlines, which is what a cutter or an outline neon needs.
     */
    public static function outline(string $svg, float $strokeWidth): string
    {
        $sw = round(max(0.5, $strokeWidth), 2);
        return preg_replace_callback(
            '/<path\b[^>]*\/>/i',
            static function (array $m) use ($sw): string {
                $tag = $m[0];
                if (!preg_match('/\bfill="([^"]+)"/i', $tag, $f) || strtolower($f[1]) === 'none') {
                    return $tag;
                }
                return preg_replace(
                    '/\bfill="[^"]+"/i',
                    'fill="none" stroke="' . $f[1] . '" stroke-width="' . $sw . '" stroke-linejoin="round"',
                    $tag,
                    1
                ) ?? $tag;
            },
            $svg
        ) ?? $svg;
    }

    /** @return array<string,string> every byte except $keep mapped to "\0" */
    private static function zeroMap(int $keep): array
    {
        static $cache = [];
        if (!isset($cache[$keep])) {
            $map = [];
            for ($i = 1; $i < 256; $i++) {
                if ($i !== $keep) {
                    $map[chr($i)] = "\0";
                }
            }
            $cache[$keep] = $map;
        }
        return $cache[$keep];
    }

    /** @return array{0:int,1:int,2:int,3:int}|null x0,y0,x1,y1 of set pixels (padded coordinates) */
    private static function bbox(string $m, int $W): ?array
    {
        $first = strpos($m, "\1");
        if ($first === false) {
            return null;
        }
        $last = strrpos($m, "\1");
        $y0 = intdiv($first, $W);
        $y1 = intdiv($last, $W);
        $x0 = $W;
        $x1 = 0;
        for ($y = $y0; $y <= $y1; $y++) {
            $row = substr($m, $y * $W, $W);
            $a = strpos($row, "\1");
            if ($a !== false) {
                $x0 = min($x0, $a);
                $x1 = max($x1, (int)strrpos($row, "\1"));
            }
        }
        return [$x0, $y0, $x1, $y1];
    }

    /**
     * Flip 4-connected components of value $val smaller than $minArea. Background
     * components touching the bounding box edge are outside, not holes.
     */
    private static function flipSmall(string &$m, int $W, array $box, string $val, int $minArea): void
    {
        [$x0, $y0, $x1, $y1] = $box;
        $other = $val === "\1" ? "\0" : "\1";
        $seen = [];
        for ($y = $y0; $y <= $y1; $y++) {
            for ($x = $x0; $x <= $x1; $x++) {
                $i = $y * $W + $x;
                if ($m[$i] !== $val || isset($seen[$i])) {
                    continue;
                }
                $comp = [$i];
                $seen[$i] = true;
                $edge = false;
                $big = false;
                for ($k = 0; $k < count($comp); $k++) {
                    $p = $comp[$k];
                    $px = $p % $W;
                    $py = intdiv($p, $W);
                    if ($px <= $x0 || $px >= $x1 || $py <= $y0 || $py >= $y1) {
                        $edge = true;
                    }
                    foreach ([$p - 1, $p + 1, $p - $W, $p + $W] as $q) {
                        $qx = $q % $W;
                        $qy = intdiv($q, $W);
                        if ($qx < $x0 || $qx > $x1 || $qy < $y0 || $qy > $y1) {
                            continue;
                        }
                        if ($m[$q] === $val && !isset($seen[$q])) {
                            $seen[$q] = true;
                            $comp[] = $q;
                        }
                    }
                    if (!$big && count($comp) >= $minArea) {
                        $big = true;
                    }
                }
                if (!$big && !($val === "\0" && $edge)) {
                    foreach ($comp as $p) {
                        $m[$p] = $other;
                    }
                }
            }
        }
    }

    /** Zhang-Suen thinning, only re-examining pixels next to recent deletions. */
    private static function thin(string &$m, int $W, array $box): void
    {
        [$x0, $y0, $x1, $y1] = $box;
        $n8 = [-$W, -$W + 1, 1, $W + 1, $W, $W - 1, -1, -$W - 1]; // P2..P9
        $cand = [];
        for ($y = $y0; $y <= $y1; $y++) {
            for ($x = $x0; $x <= $x1; $x++) {
                $i = $y * $W + $x;
                if ($m[$i] === "\1" && ($m[$i - 1] === "\0" || $m[$i + 1] === "\0" || $m[$i - $W] === "\0" || $m[$i + $W] === "\0")) {
                    $cand[$i] = true;
                }
            }
        }
        do {
            $changed = false;
            for ($step = 0; $step < 2; $step++) {
                $del = [];
                foreach ($cand as $i => $_) {
                    if ($m[$i] !== "\1") {
                        unset($cand[$i]);
                        continue;
                    }
                    $p = [];
                    $b = 0;
                    foreach ($n8 as $k => $o) {
                        $p[$k] = $m[$i + $o] === "\1" ? 1 : 0;
                        $b += $p[$k];
                    }
                    if ($b < 2 || $b > 6) {
                        continue;
                    }
                    $a = 0;
                    for ($k = 0; $k < 8; $k++) {
                        if ($p[$k] === 0 && $p[($k + 1) % 8] === 1) {
                            $a++;
                        }
                    }
                    if ($a !== 1) {
                        continue;
                    }
                    // p[0]=N p[2]=E p[4]=S p[6]=W
                    if ($step === 0 ? ($p[0] * $p[2] * $p[4] === 0 && $p[2] * $p[4] * $p[6] === 0)
                                    : ($p[0] * $p[2] * $p[6] === 0 && $p[0] * $p[4] * $p[6] === 0)) {
                        $del[] = $i;
                    }
                }
                if (!$del) {
                    continue;
                }
                $changed = true;
                foreach ($del as $i) {
                    $m[$i] = "\0";
                    unset($cand[$i]);
                }
                foreach ($del as $i) {
                    foreach ($n8 as $o) {
                        if ($m[$i + $o] === "\1") {
                            $cand[$i + $o] = true;
                        }
                    }
                }
            }
        } while ($changed);
    }

    /** Remove staircase pixels so every line pixel has exactly two neighbours. */
    private static function unstair(string &$m, int $W, array $box): void
    {
        [$x0, $y0, $x1, $y1] = $box;
        for ($y = $y0; $y <= $y1; $y++) {
            for ($x = $x0; $x <= $x1; $x++) {
                $i = $y * $W + $x;
                if ($m[$i] !== "\1") {
                    continue;
                }
                $N = $m[$i - $W] === "\1";
                $S = $m[$i + $W] === "\1";
                $E = $m[$i + 1] === "\1";
                $Wt = $m[$i - 1] === "\1";
                $NE = $m[$i - $W + 1] === "\1";
                $NW = $m[$i - $W - 1] === "\1";
                $SE = $m[$i + $W + 1] === "\1";
                $SW = $m[$i + $W - 1] === "\1";
                if (($Wt && $S && !$N && !$E && !$NE) || ($Wt && $N && !$S && !$E && !$SE)
                    || ($E && $S && !$N && !$Wt && !$NW) || ($E && $N && !$S && !$Wt && !$SW)) {
                    $m[$i] = "\0";
                }
            }
        }
    }

    /**
     * Skeleton pixels -> polylines. Short spurs are pruned and, at crossings, the
     * branches that continue most straight are joined so a letter like "X" comes
     * out as two strokes instead of four.
     *
     * @return list<array{0:list<array{0:float,1:float}>,1:bool}>
     */
    private static function graph(string $m, string $shape, int $W, array $box, int $area, int $speckle): array
    {
        [$x0, $y0, $x1, $y1] = $box;
        $n8 = [-$W, 1, $W, -1, -$W + 1, $W + 1, $W - 1, -$W - 1]; // 4-neighbours first
        $deg = [];
        for ($y = $y0; $y <= $y1; $y++) {
            $row = $y * $W;
            $x = $x0;
            while (($p = strpos($m, "\1", $row + $x)) !== false && $p <= $row + $x1) {
                $d = 0;
                foreach ($n8 as $o) {
                    if ($m[$p + $o] === "\1") {
                        $d++;
                    }
                }
                $deg[$p] = $d;
                $x = $p - $row + 1;
            }
        }
        if (!$deg) {
            return [];
        }
        // Typical stroke width = area / centre-line length.
        $width = $area / max(1, count($deg));
        // A spur is a branch shorter than the stroke is thick where it starts
        // (medial-axis noise at corners); real strokes such as the tail of a "p"
        // are much longer than the local radius.
        $radius = static function (int $p) use ($shape, $W): int {
            for ($r = 1; $r < 200; $r++) {
                for ($k = -$r; $k <= $r; $k++) {
                    if ($shape[$p - $r * $W + $k] !== "\1" || $shape[$p + $r * $W + $k] !== "\1"
                        || $shape[$p + $k * $W - $r] !== "\1" || $shape[$p + $k * $W + $r] !== "\1") {
                        return $r;
                    }
                }
            }
            return 200;
        };
        $spurAt = static function (int $p) use ($radius, $speckle): float {
            return max($speckle * 1.5, $radius($p) * 2.5 + 2);
        };

        // Nodes: endpoints, and clusters of junction pixels.
        $node = [];
        $nodes = 0;
        foreach ($deg as $p => $d) {
            if ($d === 2 || isset($node[$p])) {
                continue;
            }
            $id = $nodes++;
            $node[$p] = $id;
            if ($d >= 3) {
                $stack = [$p];
                while ($stack) {
                    $q = array_pop($stack);
                    foreach ($n8 as $o) {
                        $r = $q + $o;
                        if (($deg[$r] ?? 2) >= 3 && isset($deg[$r]) && !isset($node[$r])) {
                            $node[$r] = $id;
                            $stack[] = $r;
                        }
                    }
                }
            }
        }

        $edges = [];
        $visited = [];
        $pairSeen = [];
        foreach ($node as $p => $id) {
            foreach ($n8 as $o) {
                $q = $p + $o;
                if (!isset($deg[$q])) {
                    continue;
                }
                if (isset($node[$q])) {
                    if ($node[$q] !== $id) {
                        $k = min($p, $q) . ':' . max($p, $q);
                        if (!isset($pairSeen[$k])) {
                            $pairSeen[$k] = true;
                            $edges[] = ['pts' => [$p, $q], 'a' => $id, 'b' => $node[$q], 'closed' => false];
                        }
                    }
                    continue;
                }
                if (isset($visited[$q])) {
                    continue;
                }
                $pts = [$p, $q];
                $prev = $p;
                $cur = $q;
                $end = null;
                while (true) {
                    $visited[$cur] = true;
                    $next = null;
                    foreach ($n8 as $o2) {
                        $r = $cur + $o2;
                        if ($r !== $prev && isset($deg[$r]) && (isset($node[$r]) || !isset($visited[$r]))) {
                            if ($r === $p && count($pts) < 3) {
                                continue;
                            }
                            $next = $r;
                            break;
                        }
                    }
                    if ($next === null) {
                        break;
                    }
                    $pts[] = $next;
                    if (isset($node[$next])) {
                        $end = $node[$next];
                        break;
                    }
                    $prev = $cur;
                    $cur = $next;
                }
                $edges[] = ['pts' => $pts, 'a' => $id, 'b' => $end ?? $id, 'closed' => false];
            }
        }
        // Closed loops with no nodes (an "O").
        foreach ($deg as $p => $d) {
            if ($d !== 2 || isset($visited[$p])) {
                continue;
            }
            $pts = [$p];
            $visited[$p] = true;
            $prev = -1;
            $cur = $p;
            while (true) {
                $next = null;
                foreach ($n8 as $o) {
                    $r = $cur + $o;
                    if ($r !== $prev && isset($deg[$r]) && !isset($visited[$r])) {
                        $next = $r;
                        break;
                    }
                }
                if ($next === null) {
                    break;
                }
                $visited[$next] = true;
                $pts[] = $next;
                $prev = $cur;
                $cur = $next;
            }
            if (count($pts) >= 3) {
                $edges[] = ['pts' => $pts, 'a' => -1, 'b' => -1, 'closed' => true];
            }
        }

        // Prune spurs (short branches from a junction to a free end) and dust.
        for ($round = 0; $round < 3; $round++) {
            $nd = [];
            foreach ($edges as $e) {
                if (!$e['closed']) {
                    $nd[$e['a']] = ($nd[$e['a']] ?? 0) + 1;
                    $nd[$e['b']] = ($nd[$e['b']] ?? 0) + 1;
                }
            }
            $removed = false;
            // Forks at a blunt stroke end: a junction on a longer line with two or
            // more short free branches. Keep only the longest of those branches.
            $term = [];
            $inner = [];
            foreach ($edges as $k => $e) {
                if ($e['closed'] || $e['a'] === $e['b']) {
                    continue;
                }
                foreach ([['a', 'b'], ['b', 'a']] as [$here, $there]) {
                    if ($nd[$e[$here]] >= 3) {
                        if ($nd[$e[$there]] === 1) {
                            $term[$e[$here]][$k] = count($e['pts']);
                        } else {
                            $inner[$e[$here]] = true;
                        }
                    }
                }
            }
            $forkSpur = [];
            foreach ($term as $node => $list) {
                if (count($list) < 2 || empty($inner[$node])) {
                    continue;
                }
                arsort($list);
                array_shift($list);
                foreach ($list as $k => $len) {
                    $forkSpur[$k] = true;
                }
            }
            foreach ($edges as $k => $e) {
                if ($e['closed']) {
                    continue;
                }
                $len = count($e['pts']);
                $da = $nd[$e['a']];
                $db = $nd[$e['b']];
                $junction = $da >= 3 ? $e['pts'][0] : end($e['pts']);
                $limit = $spurAt($junction) * (isset($forkSpur[$k]) ? 2 : 1);
                if ((($da === 1 && $db >= 3) || ($db === 1 && $da >= 3)) && $len < $limit) {
                    unset($edges[$k]);
                    $nd[$e['a']]--;
                    $nd[$e['b']]--;
                    $removed = true;
                } elseif ($da >= 3 && $db >= 3 && $e['a'] !== $e['b']
                    && $len < min($spurAt($e['pts'][0]), $spurAt(end($e['pts']))) * 0.6) {
                    // Tiny bridge between two junctions where strokes meet at a slant.
                    unset($edges[$k]);
                    $nd[$e['a']]--;
                    $nd[$e['b']]--;
                    $removed = true;
                } elseif ($da === 1 && $db === 1 && $len < 2) {
                    unset($edges[$k]);
                    $removed = true;
                } elseif ($e['a'] === $e['b'] && $len < $spurAt($e['pts'][0]) * 2) {
                    unset($edges[$k]);
                    $nd[$e['a']] -= 2;
                    $removed = true;
                }
            }
            if (!$removed) {
                break;
            }
        }
        // Isolated pixels are dots (the dot of an "i"): keep them as a tiny stroke.
        foreach ($deg as $p => $d) {
            if ($d === 0) {
                $edges[] = ['pts' => [$p, $p], 'a' => -2, 'b' => -2, 'closed' => false, 'dot' => true];
            }
        }
        $edges = array_values($edges);

        $xy = static function (int $p) use ($W): array {
            return [($p % $W) - 0.5, intdiv($p, $W) - 0.5];
        };

        // Join edge ends at each node: pairs that continue most straight.
        $ends = [];
        foreach ($edges as $k => $e) {
            if (!$e['closed'] && empty($e['dot'])) {
                $ends[$e['a']][] = [$k, 0];
                $ends[$e['b']][] = [$k, 1];
            }
        }
        $reach = (int)max(3, round($width * 2));
        $dir = static function (array $e, int $side) use ($xy, $reach): array {
            $pts = $e['pts'];
            $n = count($pts);
            $i0 = $side === 0 ? 0 : $n - 1;
            $i1 = $side === 0 ? min($n - 1, $reach) : max(0, $n - 1 - $reach);
            [$ax, $ay] = $xy($pts[$i0]);
            [$bx, $by] = $xy($pts[$i1]);
            $l = hypot($bx - $ax, $by - $ay) ?: 1.0;
            return [($bx - $ax) / $l, ($by - $ay) / $l];
        };
        $link = [];
        foreach ($ends as $list) {
            if (count($list) < 2) {
                continue;
            }
            if (count($list) === 2) {
                [$p, $q] = $list;
                if ($p[0] !== $q[0]) {
                    $link[$p[0] . ':' . $p[1]] = $q;
                    $link[$q[0] . ':' . $q[1]] = $p;
                }
                continue;
            }
            $cands = [];
            foreach ($list as $i => $p) {
                foreach ($list as $j => $q) {
                    if ($j <= $i || $p[0] === $q[0]) {
                        continue;
                    }
                    [$ux, $uy] = $dir($edges[$p[0]], $p[1]);
                    [$vx, $vy] = $dir($edges[$q[0]], $q[1]);
                    $dot = $ux * $vx + $uy * $vy;
                    if ($dot < -0.5) {
                        $cands[] = [$dot, $i, $j];
                    }
                }
            }
            usort($cands, static fn($a, $b) => $a[0] <=> $b[0]);
            $used = [];
            foreach ($cands as [, $i, $j]) {
                if (isset($used[$i]) || isset($used[$j])) {
                    continue;
                }
                $used[$i] = $used[$j] = true;
                $p = $list[$i];
                $q = $list[$j];
                $link[$p[0] . ':' . $p[1]] = $q;
                $link[$q[0] . ':' . $q[1]] = $p;
            }
        }

        $lines = [];
        $done = [];
        foreach ($edges as $k => $e) {
            if (isset($done[$k])) {
                continue;
            }
            if ($e['closed']) {
                $done[$k] = true;
                $lines[] = [array_map($xy, $e['pts']), true];
                continue;
            }
            // Walk back to the start of the chain.
            $start = [$k, 0];
            $closed = false;
            $guard = 0;
            while (isset($link[$start[0] . ':' . $start[1]]) && $guard++ < count($edges)) {
                $nb = $link[$start[0] . ':' . $start[1]];
                $start = [$nb[0], 1 - $nb[1]];
                if ($start[0] === $k) {
                    $closed = true;
                    $start = [$k, 0];
                    break;
                }
            }
            $pts = [];
            $out = null;
            $cur = $start;
            $guard = 0;
            while (!isset($done[$cur[0]]) && $guard++ <= count($edges)) {
                $done[$cur[0]] = true;
                $seq = $edges[$cur[0]]['pts'];
                if ($cur[1] === 1) {
                    $seq = array_reverse($seq);
                }
                foreach ($seq as $p) {
                    if (!$pts || end($pts) !== $p) {
                        $pts[] = $p;
                    }
                }
                $out = [$cur[0], 1 - $cur[1]];
                $nb = $link[$out[0] . ':' . $out[1]] ?? null;
                if ($nb === null) {
                    break;
                }
                $cur = $nb;
            }
            if (count($pts) === 1) {
                $pts[] = $pts[0];
            }
            if (count($pts) >= 2) {
                $line = array_map($xy, $pts);
                if (!$closed && count($pts) >= 6) {
                    $nodeAt = static fn(array $end): int => $edges[$end[0]][$end[1] === 0 ? 'a' : 'b'];
                    $head = ($nd[$nodeAt($start)] ?? 0) === 1 ? self::straightEnd(array_reverse($pts), $shape, $W, $radius, $width) : null;
                    $tail = isset($out) && ($nd[$nodeAt($out)] ?? 0) === 1 ? self::straightEnd($pts, $shape, $W, $radius, $width) : null;
                    $from = $head ? count($pts) - 1 - $head[0] : 0;
                    $to = $tail ? $tail[0] : count($pts) - 1;
                    if ($to - $from >= 2) {
                        $line = array_slice($line, $from, $to - $from + 1);
                        if ($head && $head[1]) {
                            array_unshift($line, $head[1]);
                        }
                        if ($tail && $tail[1]) {
                            $line[] = $tail[1];
                        }
                    }
                }
                $lines[] = [$line, $closed];
            }
        }
        return $lines;
    }

    /**
     * Thinning bends the last bit of a line towards a corner of a blunt stroke
     * end. Cut that bit off and continue the line straight to the shape edge.
     *
     * @param list<int> $pix pixel indices, free end last
     * @return array{0:int, 1:?array{0:float,1:float}} index to keep up to, new end point
     */
    private static function straightEnd(array $pix, string $shape, int $W, callable $radius, float $width): array
    {
        $n = count($pix);
        $xy = static fn(int $p): array => [($p % $W) - 0.5, intdiv($p, $W) - 0.5];
        $look = min($n, max(3, (int)round($width * 1.5)));
        $r = 1;
        for ($i = 1; $i <= $look; $i++) {
            $r = max($r, $radius($pix[$n - $i]));
        }
        $trim = min((int)round($r * 1.5), intdiv($n, 3));
        if ($trim < 2) {
            return [$n - 1, null];
        }
        $a = $n - 1 - $trim;
        $b = max(0, $a - max(3, (int)round($r * 2)));
        [$ax, $ay] = $xy($pix[$a]);
        [$bx, $by] = $xy($pix[$b]);
        $l = hypot($ax - $bx, $ay - $by);
        if ($l < 1) {
            return [$n - 1, null];
        }
        $dx = ($ax - $bx) / $l;
        $dy = ($ay - $by) / $l;
        $reach = 0.0;
        for ($t = 1.0, $max = $r * 4 + 4; $t <= $max; $t += 1.0) {
            $px = (int)round($ax + 0.5 + $dx * $t);
            $py = (int)round($ay + 0.5 + $dy * $t);
            if (($shape[$py * $W + $px] ?? "\0") !== "\1") {
                break;
            }
            $reach = $t;
        }
        return [$a, $reach >= 1 ? [$ax + $dx * $reach, $ay + $dy * $reach] : null];
    }

    /** Light moving average to remove pixel stair-steps; free ends stay put. */
    private static function smooth(array $pts, bool $closed): array
    {
        $n = count($pts);
        if ($n < 5) {
            return $pts;
        }
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            if (!$closed && ($i < 2 || $i > $n - 3)) {
                $out[] = $pts[$i];
                continue;
            }
            $sx = $sy = 0.0;
            for ($k = -2; $k <= 2; $k++) {
                $q = $pts[($i + $k + $n) % $n];
                $sx += $q[0];
                $sy += $q[1];
            }
            $out[] = [$sx / 5, $sy / 5];
        }
        return $out;
    }

    /** Ramer-Douglas-Peucker. */
    private static function simplify(array $pts, float $eps, bool $closed): array
    {
        if ($closed && count($pts) > 3) {
            // Split the loop at its farthest point so both halves have real ends.
            $far = 0;
            $best = -1.0;
            foreach ($pts as $i => $p) {
                $d = ($p[0] - $pts[0][0]) ** 2 + ($p[1] - $pts[0][1]) ** 2;
                if ($d > $best) {
                    $best = $d;
                    $far = $i;
                }
            }
            $a = self::rdp(array_slice($pts, 0, $far + 1), $eps);
            $b = self::rdp(array_merge(array_slice($pts, $far), [$pts[0]]), $eps);
            array_pop($b);
            array_shift($b);
            return array_merge($a, $b);
        }
        return self::rdp($pts, $eps);
    }

    private static function rdp(array $pts, float $eps): array
    {
        $n = count($pts);
        if ($n < 3) {
            return $pts;
        }
        $keep = array_fill(0, $n, false);
        $keep[0] = $keep[$n - 1] = true;
        $stack = [[0, $n - 1]];
        while ($stack) {
            [$a, $b] = array_pop($stack);
            [$ax, $ay] = $pts[$a];
            [$bx, $by] = $pts[$b];
            $dx = $bx - $ax;
            $dy = $by - $ay;
            $len = hypot($dx, $dy);
            $max = 0.0;
            $idx = -1;
            for ($i = $a + 1; $i < $b; $i++) {
                [$px, $py] = $pts[$i];
                $d = $len > 0 ? abs($dy * $px - $dx * $py + $bx * $ay - $by * $ax) / $len : hypot($px - $ax, $py - $ay);
                if ($d > $max) {
                    $max = $d;
                    $idx = $i;
                }
            }
            if ($idx >= 0 && $max > $eps) {
                $keep[$idx] = true;
                $stack[] = [$a, $idx];
                $stack[] = [$idx, $b];
            }
        }
        $out = [];
        foreach ($pts as $i => $p) {
            if ($keep[$i]) {
                $out[] = $p;
            }
        }
        return $out;
    }

    /** Catmull-Rom curves through the points, with sharp corners kept sharp. */
    private static function pathData(array $pts, bool $closed, float $cornerDeg, bool $straight, int $prec): string
    {
        $n = count($pts);
        $f = static fn(float $v): string => (string)round($v, $prec);
        $d = 'M' . $f($pts[0][0]) . ' ' . $f($pts[0][1]);
        if ($straight || $n < 3) {
            for ($i = 1; $i < $n; $i++) {
                $d .= ' L' . $f($pts[$i][0]) . ' ' . $f($pts[$i][1]);
            }
            return $d . ($closed ? ' Z ' : ' ');
        }
        $get = static function (int $i) use ($pts, $n, $closed): ?array {
            if ($closed) {
                return $pts[($i % $n + $n) % $n];
            }
            return $pts[$i] ?? null;
        };
        $isCorner = static function (int $i) use ($get, $cornerDeg): bool {
            $a = $get($i - 1);
            $b = $get($i);
            $c = $get($i + 1);
            if ($a === null || $c === null) {
                return true;
            }
            $t1 = atan2($b[1] - $a[1], $b[0] - $a[0]);
            $t2 = atan2($c[1] - $b[1], $c[0] - $b[0]);
            $turn = abs(rad2deg(atan2(sin($t2 - $t1), cos($t2 - $t1))));
            return $turn >= $cornerDeg;
        };
        $segs = $closed ? $n : $n - 1;
        for ($i = 0; $i < $segs; $i++) {
            $p1 = $get($i);
            $p2 = $get($i + 1);
            $p0 = $isCorner($i) ? $p1 : $get($i - 1);
            $p3 = $isCorner($i + 1) ? $p2 : $get($i + 2);
            $c1 = [($p2[0] - $p0[0]) / 6, ($p2[1] - $p0[1]) / 6];
            $c2 = [($p3[0] - $p1[0]) / 6, ($p3[1] - $p1[1]) / 6];
            // Keep handles within a third of this segment so a short segment next
            // to a long one does not loop back (overshoot) at line ends.
            $seg = hypot($p2[0] - $p1[0], $p2[1] - $p1[1]) / 3;
            foreach ([&$c1, &$c2] as &$h) {
                $hl = hypot($h[0], $h[1]);
                if ($hl > $seg && $hl > 0) {
                    $h = [$h[0] * $seg / $hl, $h[1] * $seg / $hl];
                }
            }
            unset($h);
            $c1 = [$p1[0] + $c1[0], $p1[1] + $c1[1]];
            $c2 = [$p2[0] - $c2[0], $p2[1] - $c2[1]];
            $d .= ' C' . $f($c1[0]) . ' ' . $f($c1[1]) . ' ' . $f($c2[0]) . ' ' . $f($c2[1]) . ' ' . $f($p2[0]) . ' ' . $f($p2[1]);
        }
        return $d . ($closed ? ' Z ' : ' ');
    }
}
