<?php
/**
 * A Dot SVG Trace - precise shape tracer for letters and CNC cutting.
 *
 * VTracer is fast but its edges wobble and its corners come out bevelled, which
 * shows on lettering. This tracer works on the single-colour silhouette:
 *
 *   1. Exact pixel boundaries of every shape and hole (crack following).
 *   2. Corners: points where the outline turns sharply within a short distance
 *      but not much more over twice that distance (curves keep turning).
 *      Each corner is moved to the intersection of the two sides, so the
 *      rounding left by anti-aliasing / JPEG blur is removed.
 *   3. Straight runs: long stretches that stay inside a thin band and do not
 *      bow to one side become single exact lines; near-horizontal and
 *      near-vertical lines are snapped.
 *   4. Everything else is fitted with smooth cubic curves (Schneider's
 *      algorithm) that meet the lines tangentially.
 *
 * The result is closed, non-overlapping outer shapes with their holes: what a
 * CNC router, laser or plotter needs for cutting letters.
 */
declare(strict_types=1);

final class StShapes
{
    /**
     * @param array<string,mixed> $s normalised settings
     * @param float $scale how much prep enlarged the image (affects blur width)
     * @return array{svg:string,paths:int}|null
     */
    public static function trace(string $png, ?string $keyHex, array $s, float $scale = 1.0): ?array
    {
        $img = @imagecreatefrompng($png);
        if (!$img) {
            return null;
        }
        $w = imagesx($img);
        $h = imagesy($img);
        $bw = ($s['colormode'] ?? 'color') === 'bw';
        $key = $keyHex !== null ? (int)hexdec(ltrim($keyHex, '#')) : null;
        if (!$bw && $key === null) {
            $key = self::borderColour($img, $w, $h);
        }

        // Ink mask with one empty pixel of padding all round.
        $W = $w + 2;
        $pad = str_repeat("\0", $W);
        $rows = [$pad];
        for ($y = 0; $y < $h; $y++) {
            $row = "\0";
            for ($x = 0; $x < $w; $x++) {
                $c = imagecolorat($img, $x, $y) & 0xFFFFFF;
                $ink = $bw ? (($c >> 16) + (($c >> 8) & 255) + ($c & 255)) < 384 : $c !== $key;
                $row .= $ink ? "\1" : "\0";
            }
            $rows[] = $row . "\0";
        }
        $rows[] = $pad;
        unset($img);

        $loops = self::boundaries($rows, $W);
        unset($rows);

        $speckle = max(1, (int)($s['filter_speckle'] ?? 4));
        $minArea = max(4, $speckle * $speckle);
        $side = max($w, $h);
        $p = [
            'k' => max(4, (int)round(2 * max(1.0, $scale)) + 2),
            // Blur from upscaling rounds corners by about `scale` px; never move a corner further.
            'reach' => 2 * max(1.0, $scale) + 3,
            'corner' => max(10.0, min(170.0, (float)($s['corner_threshold'] ?? 35))),
            'tol' => max(0.4, (float)($s['segment_length'] ?? 4.0) * 0.2),
            'lmin' => max(10.0, $side * 0.012),
            'snap' => 2.0,
            // Upscaled pixel steps are `scale` px tall; smooth enough to hide them (sigma ~ scale).
            'smooth' => max(2, (int)ceil(2 * max(1.0, $scale) ** 2)),
        ];
        $prec = max(0, min(3, (int)($s['path_precision'] ?? 2)));

        // Outer boundaries run one way, holes the other (negative area = outer).
        $outers = [];
        $holes = [];
        foreach ($loops as $loop) {
            $area = self::area($loop);
            if (abs($area) < $minArea) {
                continue;
            }
            $item = ['v' => $loop, 'area' => abs($area), 'box' => self::box($loop), 'd' => self::fitLoop($loop, $p, $prec)];
            if ($item['d'] === '') {
                continue;
            }
            if ($area < 0) {
                $outers[] = $item;
            } else {
                $holes[] = $item;
            }
        }
        usort($outers, static fn(array $a, array $b): int => $a['area'] <=> $b['area']);
        $groups = [];
        foreach ($holes as $hole) {
            [$hx, $hy] = $hole['v'][0];
            foreach ($outers as $i => $o) {
                $b = $o['box'];
                if ($o['area'] > $hole['area'] && $hole['box'][0] >= $b[0] && $hole['box'][1] >= $b[1]
                    && $hole['box'][2] <= $b[2] && $hole['box'][3] <= $b[3] && self::inside($o['v'], $hx + 0.5, $hy + 0.5)) {
                    $groups[$i][] = $hole['d'];
                    break;
                }
            }
        }

        $out = '';
        foreach ($outers as $i => $o) {
            $d = $o['d'] . (isset($groups[$i]) ? ' ' . implode(' ', $groups[$i]) : '');
            $out .= '<path d="' . $d . '" fill="#000000" fill-rule="evenodd"/>' . "\n";
        }
        $svg = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="' . $w . '" height="' . $h . '">' . "\n"
            . $out . '</svg>' . "\n";
        return ['svg' => $svg, 'paths' => count($outers)];
    }

    // ------------------------------------------------------------------
    // 1. Pixel boundaries

    /**
     * Follow the cracks between ink and empty pixels. Ink is always on the left
     * of the direction of travel (screen coordinates), so outer boundaries and
     * holes come out with opposite orientation.
     *
     * @param list<string> $rows padded mask rows
     * @return list<list<array{0:int,1:int}>> vertex loops in image pixel coordinates
     */
    private static function boundaries(array $rows, int $W): array
    {
        $V = $W + 1;
        $H = count($rows);
        $out = [];
        $add = static function (int $x0, int $y0, int $x1, int $y1) use (&$out, $V): void {
            $out[$y0 * $V + $x0][] = $y1 * $V + $x1;
        };
        for ($y = 1; $y < $H; $y++) {
            $a = $rows[$y - 1];
            $b = $rows[$y];
            $diff = $a ^ $b;
            for ($x = strspn($diff, "\0"); $x < $W; $x += strspn($diff, "\0", $x)) {
                $run = strcspn($diff, "\0", $x);
                for ($e = $x + $run; $x < $e; $x++) {
                    if ($b[$x] === "\1") {
                        $add($x + 1, $y, $x, $y);      // top side of ink: travel west
                    } else {
                        $add($x, $y, $x + 1, $y);      // bottom side of ink: travel east
                    }
                }
            }
        }
        for ($y = 0; $y < $H; $y++) {
            $r = $rows[$y];
            $diff = $r ^ ("\0" . substr($r, 0, -1));
            for ($x = strspn($diff, "\0"); $x < $W; $x += strspn($diff, "\0", $x)) {
                $run = strcspn($diff, "\0", $x);
                for ($e = $x + $run; $x < $e; $x++) {
                    if ($r[$x] === "\1") {
                        $add($x, $y, $x, $y + 1);      // left side of ink: travel south
                    } else {
                        $add($x, $y + 1, $x, $y);      // right side of ink: travel north
                    }
                }
            }
        }

        $loops = [];
        foreach (array_keys($out) as $start) {
            while (!empty($out[$start])) {
                $loop = [];
                $prev = $start;
                $cur = array_pop($out[$start]);
                $guard = 0;
                $loop[] = [$start % $V - 1, intdiv($start, $V) - 1];
                while ($cur !== $start && $guard++ < 50_000_000) {
                    $loop[] = [$cur % $V - 1, intdiv($cur, $V) - 1];
                    $cands = $out[$cur] ?? [];
                    if (!$cands) {
                        break; // cannot happen with a closed mask; stay safe
                    }
                    $pick = 0;
                    if (count($cands) > 1) {
                        // Saddle: two diagonal ink pixels. Turn towards the ink (left)
                        // so they stay separate shapes.
                        $dx = $cur % $V - $prev % $V;
                        $dy = intdiv($cur, $V) - intdiv($prev, $V);
                        $best = PHP_INT_MAX;
                        foreach ($cands as $i => $t) {
                            $cross = $dx * (intdiv($t, $V) - intdiv($cur, $V)) - $dy * ($t % $V - $cur % $V);
                            if ($cross < $best) {
                                $best = $cross;
                                $pick = $i;
                            }
                        }
                    }
                    $next = $cands[$pick];
                    array_splice($out[$cur], $pick, 1);
                    $prev = $cur;
                    $cur = $next;
                }
                if (count($loop) >= 4) {
                    $loops[] = $loop;
                }
            }
        }
        return $loops;
    }

    // ------------------------------------------------------------------
    // 2-4. Corners, lines and curves

    /** @param list<array{0:int,1:int}> $loop */
    private static function fitLoop(array $loop, array $p, int $prec): string
    {
        // Dense outline through the middle of every pixel edge, lightly smoothed.
        $n = count($loop);
        $pts = [];
        for ($i = 0; $i < $n; $i++) {
            $a = $loop[$i];
            $b = $loop[($i + 1) % $n];
            $pts[] = [($a[0] + $b[0]) / 2, ($a[1] + $b[1]) / 2];
        }
        $pts = self::smoothClosed($pts);
        $k = $p['k'];
        $corners = $n >= 4 * $k ? self::corners($pts, $k, $p['corner'], $p['reach']) : [];
        // Curves and lines are fitted to a smoother copy so pixel steps never show.
        for ($r = $p['smooth']; $r > 0; $r--) {
            $pts = self::smoothClosed($pts);
        }

        $segs = [];
        if (!$corners) {
            // Smooth closed shape (O, dots): split in two halves.
            $half = intdiv($n, 2);
            $t0 = self::tangentAt($pts, 0);
            $th = self::tangentAt($pts, $half);
            $run1 = array_slice($pts, 0, $half + 1);
            $run2 = array_merge(array_slice($pts, $half), [$pts[0]]);
            $segs = array_merge(
                self::fitRun($run1, $t0, self::neg($th), $p),
                self::fitRun($run2, $th, self::neg($t0), $p)
            );
        } else {
            $m = count($corners);
            for ($c = 0; $c < $m; $c++) {
                [$ia, $pa, $refA] = $corners[$c];
                [$ib, $pb, $refB] = $corners[($c + 1) % $m];
                $len = ($ib - $ia + $n) % $n;
                if ($len === 0) {
                    $len = $n;
                }
                // Points next to a refined corner belong to its blurred rounding: skip them.
                $skipA = $refA ? $k - 1 : 0;
                $skipB = $refB ? $k - 1 : 0;
                $run = [$pa];
                for ($j = 1 + $skipA; $j <= $len - 1 - $skipB; $j++) {
                    $run[] = $pts[($ia + $j) % $n];
                }
                $run[] = $pb;
                $segs = array_merge($segs, self::fitRun($run, null, null, $p));
            }
        }
        if (!$segs) {
            return '';
        }
        $segs = self::snap($segs, $p['snap']);

        $f = static fn(float $v): string => self::num($v, $prec);
        $d = 'M' . $f($segs[0][1][0]) . ' ' . $f($segs[0][1][1]);
        foreach ($segs as $sg) {
            if ($sg[0] === 'L') {
                $d .= 'L' . $f($sg[4][0]) . ' ' . $f($sg[4][1]);
            } else {
                $d .= 'C' . $f($sg[2][0]) . ' ' . $f($sg[2][1]) . ' ' . $f($sg[3][0]) . ' ' . $f($sg[3][1])
                    . ' ' . $f($sg[4][0]) . ' ' . $f($sg[4][1]);
            }
        }
        return $d . 'Z';
    }

    /**
     * @param list<array{0:float,1:float}> $pts closed dense outline
     * @return list<array{0:int,1:array{0:float,1:float},2:bool}> [index, position, refined]
     */
    private static function corners(array $pts, int $k, float $minTurn, float $reach): array
    {
        $n = count($pts);
        $turn = static function (int $i, int $s) use ($pts, $n): float {
            $p = $pts[$i];
            $a = $pts[($i - $s + $n) % $n];
            $b = $pts[($i + $s) % $n];
            $ax = $p[0] - $a[0];
            $ay = $p[1] - $a[1];
            $bx = $b[0] - $p[0];
            $by = $b[1] - $p[1];
            return abs(rad2deg(atan2($ax * $by - $ay * $bx, $ax * $bx + $ay * $by)));
        };
        $t1 = [];
        for ($i = 0; $i < $n; $i++) {
            $t1[$i] = $turn($i, $k);
        }
        $found = [];
        for ($i = 0; $i < $n; $i++) {
            $v = $t1[$i];
            if ($v < $minTurn) {
                continue;
            }
            // Peak of the turn within +-k (first point of a flat top wins).
            $max = true;
            for ($j = 1; $j <= $k && $max; $j++) {
                $max = $t1[($i - $j + $n) % $n] < $v && $t1[($i + $j) % $n] <= $v;
            }
            if (!$max) {
                continue;
            }
            // A corner turns all at once; a curve keeps turning over a longer stretch.
            if ($turn($i, 2 * $k) > 1.5 * $v + 5) {
                continue;
            }
            $found[] = $i;
        }
        $m = count($found);
        if ($m === 0) {
            return [];
        }
        $out = [];
        foreach ($found as $c => $i) {
            $prev = $found[($c - 1 + $m) % $m];
            $next = $found[($c + 1) % $m];
            $dp = $m === 1 ? $n : ($i - $prev + $n) % $n;
            $dn = $m === 1 ? $n : ($next - $i + $n) % $n;
            $pos = $pts[$i];
            $refined = false;
            $reachA = min(3 * $k, intdiv($dp, 2));
            $reachB = min(3 * $k, intdiv($dn, 2));
            if ($reachA - $k >= 2 && $reachB - $k >= 2) {
                $la = self::fitLine($pts, $i - $reachA, $i - $k, $n);
                $lb = self::fitLine($pts, $i + $k, $i + $reachB, $n);
                // Only sharpen when both sides really are straight (not a small curvy letter part).
                $x = ($la !== null && $lb !== null && $la[4] <= 0.5 && $lb[4] <= 0.5) ? self::intersect($la, $lb) : null;
                if ($x !== null && hypot($x[0] - $pos[0], $x[1] - $pos[1]) <= min(2.5 * $k, $reach)) {
                    $pos = $x;
                    $refined = true;
                }
            }
            $out[] = [$i, $pos, $refined];
        }
        return $out;
    }

    /**
     * Fit one stretch between two corners (or split points): exact lines where
     * the outline is straight, smooth curves elsewhere.
     *
     * @param list<array{0:float,1:float}> $run
     * @return list<array{0:string,1:array,2:array,3:array,4:array}> ['L'|'C', p0, c1, c2, p3]
     */
    private static function fitRun(array $run, ?array $tStart, ?array $tEnd, array $p): array
    {
        $n = count($run);
        if ($n < 2) {
            return [];
        }
        if ($n === 2) {
            return [self::line($run[0], $run[1])];
        }
        // Straight stretches [from, to] (indices into $run).
        $lines = [];
        $i = 0;
        while ($i < $n - 1) {
            $j = self::longestLine($run, $i, $p);
            if ($j === null) {
                $i++;
                continue;
            }
            $lines[] = [$i, $j];
            $i = $j;
        }
        // A straight piece floating inside a curve (touching no corner) must be clearly long,
        // otherwise it is just a flatter part of the curve and would leave a kink.
        $lines = array_values(array_filter($lines, static function (array $l) use ($run, $n, $p, $tStart, $tEnd): bool {
            if (($l[0] === 0 && $tStart === null) || ($l[1] === $n - 1 && $tEnd === null)) {
                return true;
            }
            return hypot($run[$l[1]][0] - $run[$l[0]][0], $run[$l[1]][1] - $run[$l[0]][1]) >= 2.5 * $p['lmin'];
        }));

        // Exact line through each straight stretch; ends at corners stay put.
        $pos = $run;
        $dir = [];
        foreach ($lines as $li => [$a, $b]) {
            $fit = self::fitLine($run, $a, $b, 0);
            if ($fit !== null) {
                if ($a > 0) {
                    $pos[$a] = self::project($fit, $run[$a]);
                }
                if ($b < $n - 1) {
                    $pos[$b] = self::project($fit, $run[$b]);
                }
            }
            $dir[$li] = self::unit([$pos[$b][0] - $pos[$a][0], $pos[$b][1] - $pos[$a][1]]);
        }

        $segs = [];
        $cursor = 0;
        $tangentIn = $tStart;
        $addCurve = function (int $a, int $b, ?array $t1, ?array $t2) use (&$segs, $run, $pos, $p): void {
            if ($b <= $a) {
                return;
            }
            $pts = array_slice($run, $a, $b - $a + 1);
            $pts[0] = $pos[$a];
            $pts[count($pts) - 1] = $pos[$b];
            if (count($pts) <= 4) {
                $segs[] = self::line($pts[0], $pts[count($pts) - 1]);
                return;
            }
            $t1 ??= self::unit([$pts[min(3, count($pts) - 1)][0] - $pts[0][0], $pts[min(3, count($pts) - 1)][1] - $pts[0][1]]);
            $last = count($pts) - 1;
            $t2 ??= self::unit([$pts[max(0, $last - 3)][0] - $pts[$last][0], $pts[max(0, $last - 3)][1] - $pts[$last][1]]);
            $tol = $p['tol'];
            self::fitCubic($pts, 0, $last, $t1, $t2, $tol * $tol, $segs, 0);
        };
        foreach ($lines as $li => [$a, $b]) {
            $addCurve($cursor, $a, $tangentIn, self::neg($dir[$li]));
            $segs[] = self::line($pos[$a], $pos[$b]);
            $cursor = $b;
            $tangentIn = $dir[$li];
        }
        $addCurve($cursor, $n - 1, $cursor === 0 ? $tStart : $tangentIn, $tEnd);

        // Curves that came out straight are lines.
        foreach ($segs as $i => $sg) {
            if ($sg[0] === 'C' && self::flat($sg, 0.25)) {
                $segs[$i] = self::line($sg[1], $sg[4]);
            }
        }
        return $segs;
    }

    /** Last index $j such that $run[$i..$j] is a straight line, or null. */
    private static function longestLine(array $run, int $i, array $p): ?int
    {
        $n = count($run);
        $lmin = $p['lmin'];
        $j = $i + 1;
        while ($j < $n && hypot($run[$j][0] - $run[$i][0], $run[$j][1] - $run[$i][1]) < $lmin) {
            $j++;
        }
        if ($j >= $n || !self::straight($run, $i, $j, $p['tol'])) {
            return null;
        }
        $step = max(1, $j - $i);
        $good = $j;
        $bad = null;
        while (true) {
            $t = $good + $step;
            if ($t >= $n) {
                $t = $n - 1;
                if ($t === $good) {
                    return $good;
                }
            }
            if (self::straight($run, $i, $t, $p['tol'])) {
                $good = $t;
                if ($t === $n - 1) {
                    return $good;
                }
                $step *= 2;
            } else {
                $bad = $t;
                break;
            }
        }
        while ($bad - $good > 1) {
            $mid = intdiv($good + $bad, 2);
            if (self::straight($run, $i, $mid, $p['tol'])) {
                $good = $mid;
            } else {
                $bad = $mid;
            }
        }
        return $good;
    }

    /** Points stay within $tol of the chord and do not bow to one side (which a gentle curve does). */
    private static function straight(array $run, int $a, int $b, float $tol): bool
    {
        $ax = $run[$a][0];
        $ay = $run[$a][1];
        $dx = $run[$b][0] - $ax;
        $dy = $run[$b][1] - $ay;
        $len = hypot($dx, $dy);
        if ($len < 1e-9) {
            return false;
        }
        // Least-squares d = c0 + c1*t + c2*t^2 over t in [-1,1]: c2 is the bow of an arc,
        // which is what separates a gentle curve from a genuinely straight edge.
        $S = array_fill(0, 5, 0.0);
        $T = array_fill(0, 3, 0.0);
        for ($i = $a; $i <= $b; $i++) {
            $d = (($run[$i][0] - $ax) * $dy - ($run[$i][1] - $ay) * $dx) / $len;
            if (abs($d) > $tol) {
                return false;
            }
            $t = 2.0 * (($run[$i][0] - $ax) * $dx + ($run[$i][1] - $ay) * $dy) / ($len * $len) - 1.0;
            $tp = 1.0;
            for ($e = 0; $e <= 4; $e++) {
                $S[$e] += $tp;
                if ($e <= 2) {
                    $T[$e] += $tp * $d;
                }
                $tp *= $t;
            }
        }
        if ($b - $a < 6) {
            return true;
        }
        $m = [[$S[0], $S[1], $S[2]], [$S[1], $S[2], $S[3]], [$S[2], $S[3], $S[4]]];
        $det = self::det3($m);
        if (abs($det) < 1e-12) {
            return true;
        }
        $m2 = $m;
        foreach ([0, 1, 2] as $r) {
            $m2[$r][2] = $T[$r];
        }
        return abs(self::det3($m2) / $det) <= 0.08 + 0.04 * $tol;
    }

    private static function det3(array $m): float
    {
        return $m[0][0] * ($m[1][1] * $m[2][2] - $m[1][2] * $m[2][1])
             - $m[0][1] * ($m[1][0] * $m[2][2] - $m[1][2] * $m[2][0])
             + $m[0][2] * ($m[1][0] * $m[2][1] - $m[1][1] * $m[2][0]);
    }

    /** Make near-horizontal / near-vertical lines exact, moving neighbours with them. */
    private static function snap(array $segs, float $maxDeg): array
    {
        $m = count($segs);
        $lim = tan(deg2rad($maxDeg));
        for ($i = 0; $i < $m; $i++) {
            if ($segs[$i][0] !== 'L') {
                continue;
            }
            $a = $segs[$i][1];
            $b = $segs[$i][4];
            $dx = $b[0] - $a[0];
            $dy = $b[1] - $a[1];
            if (abs($dx) > 1e-9 && abs($dy / $dx) <= $lim) {
                $y = ($a[1] + $b[1]) / 2;
                $na = [$a[0], $y];
                $nb = [$b[0], $y];
            } elseif (abs($dy) > 1e-9 && abs($dx / $dy) <= $lim) {
                $x = ($a[0] + $b[0]) / 2;
                $na = [$x, $a[1]];
                $nb = [$x, $b[1]];
            } else {
                continue;
            }
            self::moveStart($segs, $i, $na);
            self::moveEnd($segs, ($i - 1 + $m) % $m, $na);
            self::moveEnd($segs, $i, $nb);
            self::moveStart($segs, ($i + 1) % $m, $nb);
        }
        return $segs;
    }

    private static function moveStart(array &$segs, int $i, array $to): void
    {
        $dx = $to[0] - $segs[$i][1][0];
        $dy = $to[1] - $segs[$i][1][1];
        $segs[$i][1] = $to;
        if ($segs[$i][0] === 'C') {
            $segs[$i][2] = [$segs[$i][2][0] + $dx, $segs[$i][2][1] + $dy];
        }
    }

    private static function moveEnd(array &$segs, int $i, array $to): void
    {
        $dx = $to[0] - $segs[$i][4][0];
        $dy = $to[1] - $segs[$i][4][1];
        $segs[$i][4] = $to;
        if ($segs[$i][0] === 'C') {
            $segs[$i][3] = [$segs[$i][3][0] + $dx, $segs[$i][3][1] + $dy];
        }
    }

    // ------------------------------------------------------------------
    // Schneider curve fitting ("An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems 1990)

    private static function fitCubic(array $d, int $first, int $last, array $t1, array $t2, float $err2, array &$out, int $depth): void
    {
        $p0 = $d[$first];
        $p3 = $d[$last];
        $dist = hypot($p3[0] - $p0[0], $p3[1] - $p0[1]);
        if ($last - $first === 1 || $depth > 40) {
            $out[] = ['C', $p0, self::add($p0, $t1, $dist / 3), self::add($p3, $t2, $dist / 3), $p3];
            return;
        }
        $u = self::chordParams($d, $first, $last);
        $bez = self::generate($d, $first, $last, $u, $t1, $t2);
        [$max, $split] = self::maxError($d, $first, $last, $bez, $u);
        if ($max < $err2) {
            $out[] = ['C', ...$bez];
            return;
        }
        if ($max < $err2 * 4) {
            for ($it = 0; $it < 4; $it++) {
                $u = self::reparam($d, $first, $last, $u, $bez);
                $bez = self::generate($d, $first, $last, $u, $t1, $t2);
                [$max, $split] = self::maxError($d, $first, $last, $bez, $u);
                if ($max < $err2) {
                    $out[] = ['C', ...$bez];
                    return;
                }
            }
        }
        $w = max(1, min(4, $split - $first, $last - $split));
        $a = $d[$split - $w];
        $b = $d[$split + $w];
        $tc = self::unit([$a[0] - $b[0], $a[1] - $b[1]]);
        if ($tc === [0.0, 0.0]) {
            $tc = self::unit([$d[$split - 1][0] - $d[$split][0], $d[$split - 1][1] - $d[$split][1]]);
        }
        self::fitCubic($d, $first, $split, $t1, $tc, $err2, $out, $depth + 1);
        self::fitCubic($d, $split, $last, self::neg($tc), $t2, $err2, $out, $depth + 1);
    }

    private static function chordParams(array $d, int $first, int $last): array
    {
        $u = [0.0];
        for ($i = $first + 1; $i <= $last; $i++) {
            $u[] = $u[$i - $first - 1] + hypot($d[$i][0] - $d[$i - 1][0], $d[$i][1] - $d[$i - 1][1]);
        }
        $total = $u[$last - $first] ?: 1.0;
        foreach ($u as $i => $v) {
            $u[$i] = $v / $total;
        }
        return $u;
    }

    private static function generate(array $d, int $first, int $last, array $u, array $t1, array $t2): array
    {
        $p0 = $d[$first];
        $p3 = $d[$last];
        $c00 = $c01 = $c11 = $x0 = $x1 = 0.0;
        foreach ($u as $i => $t) {
            $mt = 1 - $t;
            $b0 = $mt * $mt * $mt;
            $b1 = 3 * $t * $mt * $mt;
            $b2 = 3 * $t * $t * $mt;
            $b3 = $t * $t * $t;
            $a0 = [$t1[0] * $b1, $t1[1] * $b1];
            $a1 = [$t2[0] * $b2, $t2[1] * $b2];
            $c00 += $a0[0] * $a0[0] + $a0[1] * $a0[1];
            $c01 += $a0[0] * $a1[0] + $a0[1] * $a1[1];
            $c11 += $a1[0] * $a1[0] + $a1[1] * $a1[1];
            $q = $d[$first + $i];
            $tx = $q[0] - ($p0[0] * ($b0 + $b1) + $p3[0] * ($b2 + $b3));
            $ty = $q[1] - ($p0[1] * ($b0 + $b1) + $p3[1] * ($b2 + $b3));
            $x0 += $a0[0] * $tx + $a0[1] * $ty;
            $x1 += $a1[0] * $tx + $a1[1] * $ty;
        }
        $det = $c00 * $c11 - $c01 * $c01;
        $al = abs($det) > 1e-12 ? ($x0 * $c11 - $x1 * $c01) / $det : 0.0;
        $ar = abs($det) > 1e-12 ? ($c00 * $x1 - $c01 * $x0) / $det : 0.0;
        $seg = hypot($p3[0] - $p0[0], $p3[1] - $p0[1]);
        if ($al < 1e-6 * $seg || $ar < 1e-6 * $seg) {
            $al = $ar = $seg / 3;
        }
        return [$p0, self::add($p0, $t1, $al), self::add($p3, $t2, $ar), $p3];
    }

    private static function maxError(array $d, int $first, int $last, array $bez, array $u): array
    {
        $max = 0.0;
        $split = intdiv($first + $last, 2);
        for ($i = $first + 1; $i < $last; $i++) {
            $q = self::bez($bez, $u[$i - $first]);
            $e = ($q[0] - $d[$i][0]) ** 2 + ($q[1] - $d[$i][1]) ** 2;
            if ($e >= $max) {
                $max = $e;
                $split = $i;
            }
        }
        return [$max, max($first + 1, min($last - 1, $split))];
    }

    private static function reparam(array $d, int $first, int $last, array $u, array $bez): array
    {
        $q1 = [];
        for ($i = 0; $i < 3; $i++) {
            $q1[] = [3 * ($bez[$i + 1][0] - $bez[$i][0]), 3 * ($bez[$i + 1][1] - $bez[$i][1])];
        }
        $q2 = [];
        for ($i = 0; $i < 2; $i++) {
            $q2[] = [2 * ($q1[$i + 1][0] - $q1[$i][0]), 2 * ($q1[$i + 1][1] - $q1[$i][1])];
        }
        foreach ($u as $i => $t) {
            $p = $d[$first + $i];
            $q = self::bez($bez, $t);
            $mt = 1 - $t;
            $d1 = [$q1[0][0] * $mt * $mt + 2 * $q1[1][0] * $t * $mt + $q1[2][0] * $t * $t,
                   $q1[0][1] * $mt * $mt + 2 * $q1[1][1] * $t * $mt + $q1[2][1] * $t * $t];
            $d2 = [$q2[0][0] * $mt + $q2[1][0] * $t, $q2[0][1] * $mt + $q2[1][1] * $t];
            $num = ($q[0] - $p[0]) * $d1[0] + ($q[1] - $p[1]) * $d1[1];
            $den = $d1[0] ** 2 + $d1[1] ** 2 + ($q[0] - $p[0]) * $d2[0] + ($q[1] - $p[1]) * $d2[1];
            if (abs($den) > 1e-12) {
                $u[$i] = max(0.0, min(1.0, $t - $num / $den));
            }
        }
        return $u;
    }

    private static function bez(array $b, float $t): array
    {
        $mt = 1 - $t;
        $a = $mt * $mt * $mt;
        $c = 3 * $t * $mt * $mt;
        $e = 3 * $t * $t * $mt;
        $f = $t * $t * $t;
        return [$a * $b[0][0] + $c * $b[1][0] + $e * $b[2][0] + $f * $b[3][0],
                $a * $b[0][1] + $c * $b[1][1] + $e * $b[2][1] + $f * $b[3][1]];
    }

    // ------------------------------------------------------------------
    // Geometry helpers

    /** Least-squares line through points $a..$b (indices wrap when $n > 0). [cx, cy, dx, dy] */
    private static function fitLine(array $pts, int $a, int $b, int $n): ?array
    {
        $sx = $sy = 0.0;
        $c = 0;
        for ($i = $a; $i <= $b; $i++) {
            $q = $pts[$n > 0 ? (($i % $n) + $n) % $n : $i];
            $sx += $q[0];
            $sy += $q[1];
            $c++;
        }
        if ($c < 2) {
            return null;
        }
        $cx = $sx / $c;
        $cy = $sy / $c;
        $xx = $xy = $yy = 0.0;
        for ($i = $a; $i <= $b; $i++) {
            $q = $pts[$n > 0 ? (($i % $n) + $n) % $n : $i];
            $dx = $q[0] - $cx;
            $dy = $q[1] - $cy;
            $xx += $dx * $dx;
            $xy += $dx * $dy;
            $yy += $dy * $dy;
        }
        $ang = 0.5 * atan2(2 * $xy, $xx - $yy);
        $minEig = max(0.0, ($xx + $yy) / 2 - sqrt((($xx - $yy) / 2) ** 2 + $xy * $xy));
        return [$cx, $cy, cos($ang), sin($ang), sqrt($minEig / $c)]; // [.., rms distance from line]
    }

    private static function intersect(?array $l1, ?array $l2): ?array
    {
        if ($l1 === null || $l2 === null) {
            return null;
        }
        $den = $l1[2] * $l2[3] - $l1[3] * $l2[2];
        if (abs($den) < 0.17) { // under ~10 degrees apart: no clear corner point
            return null;
        }
        $t = (($l2[0] - $l1[0]) * $l2[3] - ($l2[1] - $l1[1]) * $l2[2]) / $den;
        return [$l1[0] + $t * $l1[2], $l1[1] + $t * $l1[3]];
    }

    private static function project(array $l, array $q): array
    {
        $t = ($q[0] - $l[0]) * $l[2] + ($q[1] - $l[1]) * $l[3];
        return [$l[0] + $t * $l[2], $l[1] + $t * $l[3]];
    }

    private static function flat(array $sg, float $tol): bool
    {
        [, $a, $c1, $c2, $b] = $sg;
        $dx = $b[0] - $a[0];
        $dy = $b[1] - $a[1];
        $len = hypot($dx, $dy);
        if ($len < 1e-9) {
            return true;
        }
        foreach ([$c1, $c2] as $c) {
            $t = (($c[0] - $a[0]) * $dx + ($c[1] - $a[1]) * $dy) / ($len * $len);
            $dist = abs(($c[0] - $a[0]) * $dy - ($c[1] - $a[1]) * $dx) / $len;
            if ($dist > $tol || $t < -0.01 || $t > 1.01) {
                return false;
            }
        }
        return true;
    }

    private static function smoothClosed(array $pts): array
    {
        $n = count($pts);
        if ($n < 8) {
            return $pts;
        }
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            $a = $pts[($i - 1 + $n) % $n];
            $b = $pts[$i];
            $c = $pts[($i + 1) % $n];
            $out[] = [($a[0] + 2 * $b[0] + $c[0]) / 4, ($a[1] + 2 * $b[1] + $c[1]) / 4];
        }
        return $out;
    }

    private static function tangentAt(array $pts, int $i): array
    {
        $n = count($pts);
        $a = $pts[($i - 3 + $n) % $n];
        $b = $pts[($i + 3) % $n];
        return self::unit([$b[0] - $a[0], $b[1] - $a[1]]);
    }

    private static function line(array $a, array $b): array
    {
        return ['L', $a, $a, $b, $b];
    }

    private static function unit(array $v): array
    {
        $l = hypot($v[0], $v[1]);
        return $l < 1e-12 ? [0.0, 0.0] : [$v[0] / $l, $v[1] / $l];
    }

    private static function neg(array $v): array
    {
        return [-$v[0], -$v[1]];
    }

    private static function add(array $p, array $v, float $s): array
    {
        return [$p[0] + $v[0] * $s, $p[1] + $v[1] * $s];
    }

    private static function area(array $loop): float
    {
        $a = 0.0;
        $n = count($loop);
        for ($i = 0; $i < $n; $i++) {
            $p = $loop[$i];
            $q = $loop[($i + 1) % $n];
            $a += $p[0] * $q[1] - $q[0] * $p[1];
        }
        return $a / 2;
    }

    /** @return array{0:int,1:int,2:int,3:int} */
    private static function box(array $loop): array
    {
        $xs = array_column($loop, 0);
        $ys = array_column($loop, 1);
        return [min($xs), min($ys), max($xs), max($ys)];
    }

    private static function inside(array $loop, float $x, float $y): bool
    {
        $in = false;
        $n = count($loop);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$xi, $yi] = $loop[$i];
            [$xj, $yj] = $loop[$j];
            if (($yi > $y) !== ($yj > $y) && $x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi) {
                $in = !$in;
            }
        }
        return $in;
    }

    private static function borderColour(\GdImage $img, int $w, int $h): ?int
    {
        $count = [];
        $step = max(1, intdiv(max($w, $h), 400));
        for ($x = 0; $x < $w; $x += $step) {
            foreach ([0, $h - 1] as $y) {
                $c = imagecolorat($img, $x, $y) & 0xFFFFFF;
                $count[$c] = ($count[$c] ?? 0) + 1;
            }
        }
        for ($y = 0; $y < $h; $y += $step) {
            foreach ([0, $w - 1] as $x) {
                $c = imagecolorat($img, $x, $y) & 0xFFFFFF;
                $count[$c] = ($count[$c] ?? 0) + 1;
            }
        }
        arsort($count);
        return $count ? (int)array_key_first($count) : null;
    }

    private static function num(float $v, int $prec): string
    {
        $s = number_format($v, $prec, '.', '');
        if ($prec > 0) {
            $s = rtrim(rtrim($s, '0'), '.');
        }
        return $s === '-0' ? '0' : $s;
    }
}
