<?php
declare(strict_types=1);

/** Conservative 2D bounds for the small, explicitly supported DXF cutting subset. */
final class QuoteDxfBounds
{
    private float $minX = INF;
    private float $minY = INF;
    private float $maxX = -INF;
    private float $maxY = -INF;
    private int $segments = 0;
    private float $scale = 1.0;

    private function point(float $x, float $y): void
    {
        if (!is_finite($x) || !is_finite($y) || abs($x) * $this->scale > 1e8 || abs($y) * $this->scale > 1e8) throw new RuntimeException('Drawing coordinates need shop review.');
        $this->minX = min($this->minX, $x); $this->maxX = max($this->maxX, $x);
        $this->minY = min($this->minY, $y); $this->maxY = max($this->maxY, $y);
    }

    private static function positiveAngle(float $angle): float
    {
        $angle = fmod($angle, 2 * M_PI);
        return $angle < 0 ? $angle + 2 * M_PI : $angle;
    }

    private function arc(float $cx, float $cy, float $radius, float $start, float $sweep): void
    {
        if (!is_finite($cx) || !is_finite($cy) || !is_finite($radius) || $radius <= 0 || abs($cx)*$this->scale > 1e8 || abs($cy)*$this->scale > 1e8 || $radius*$this->scale > 1e8 || !is_finite($start) || !is_finite($sweep) || abs($sweep) < 1e-12 || abs($sweep) > 2*M_PI + 1e-10) {
            throw new RuntimeException('An arc in this drawing needs shop review.');
        }
        $end = $start + $sweep;
        $this->point($cx + $radius*cos($start), $cy + $radius*sin($start));
        $this->point($cx + $radius*cos($end), $cy + $radius*sin($end));
        foreach ([0.0, M_PI/2, M_PI, 3*M_PI/2] as $angle) {
            $distance = $sweep > 0 ? self::positiveAngle($angle-$start) : self::positiveAngle($start-$angle);
            if ($distance <= abs($sweep) + 1e-10) $this->point($cx + $radius*cos($angle), $cy + $radius*sin($angle));
        }
        $this->segments++;
    }

    private function segment(array $a, array $b): void
    {
        $dx = $b['x']-$a['x']; $dy = $b['y']-$a['y']; $chord = hypot($dx, $dy); $bulge = $a['bulge'];
        if (!is_finite($chord) || $chord <= 0) throw new RuntimeException('A zero-length polyline segment needs shop review.');
        if ($bulge === 0.0) { $this->point($a['x'], $a['y']); $this->point($b['x'], $b['y']); $this->segments++; return; }
        if (abs($bulge) < 1e-6) throw new RuntimeException('A very shallow polyline curve needs shop review.');
        $cx = ($a['x']+$b['x'])/2 - $dy * (1-$bulge*$bulge)/(4*$bulge);
        $cy = ($a['y']+$b['y'])/2 + $dx * (1-$bulge*$bulge)/(4*$bulge);
        $radius = $chord * (1+$bulge*$bulge)/(4*abs($bulge));
        $this->arc($cx, $cy, $radius, atan2($a['y']-$cy, $a['x']-$cx), 4*atan($bulge));
    }

    /** @return array{width_mm:float,height_mm:float} */
    public function measure(string $path): array
    {
        $file = @fopen($path, 'rb');
        if ($file === false) throw new RuntimeException('Unable to read DXF drawing.');
        $section = null; $awaitSection = false; $awaitUnits = false; $units = null;
        $seenHeader = false; $seenEntities = false; $seenEof = false;
        $type = null; $data = []; $first = null; $previous = null; $vertex = null; $vertexCount = 0;
        $number = static function (string $value): float {
            if (!is_numeric($value) || !is_finite((float)$value) || abs((float)$value) > 1e8) throw new RuntimeException('A DXF number needs shop review.');
            return (float)$value;
        };
        $finishVertex = function () use (&$vertex, &$previous, &$first, &$vertexCount): void {
            if ($vertex === null) return;
            if (!isset($vertex['x'], $vertex['y'])) throw new RuntimeException('A polyline vertex is incomplete.');
            if ($previous !== null) $this->segment($previous, $vertex); else $first = $vertex;
            $previous = $vertex; $vertex = null; $vertexCount++;
        };
        $finishEntity = function () use (&$type, &$data, &$first, &$previous, &$vertex, &$vertexCount, $finishVertex): void {
            if ($type === null) return;
            if (($data[67] ?? 0.0) !== 0.0 || ($data[60] ?? 0.0) !== 0.0 || ($data[39] ?? 0.0) !== 0.0 ||
                ($data[210] ?? 0.0) !== 0.0 || ($data[220] ?? 0.0) !== 0.0 || ($data[230] ?? 1.0) !== 1.0 ||
                ($data[30] ?? 0.0) !== 0.0 || ($data[31] ?? 0.0) !== 0.0 || ($data[38] ?? 0.0) !== 0.0) {
                throw new RuntimeException('Only visible, flat XY cutting paths can be priced automatically.');
            }
            if ($type === 'LINE') {
                foreach ([10,20,11,21] as $key) if (!array_key_exists($key, $data)) throw new RuntimeException('A DXF line is incomplete.');
                if (hypot($data[11]-$data[10], $data[21]-$data[20]) <= 0) throw new RuntimeException('A zero-length line needs shop review.');
                $this->point($data[10],$data[20]); $this->point($data[11],$data[21]); $this->segments++;
            } elseif ($type === 'CIRCLE' || $type === 'ARC') {
                foreach ([10,20,40] as $key) if (!array_key_exists($key, $data)) throw new RuntimeException('A DXF circle or arc is incomplete.');
                if ($type === 'ARC') {
                    foreach ([50,51] as $key) if (!array_key_exists($key, $data)) throw new RuntimeException('A DXF arc is incomplete.');
                    if ($data[50] < 0 || $data[50] > 360 || $data[51] < 0 || $data[51] > 360) throw new RuntimeException('A DXF arc angle needs shop review.');
                    $start = deg2rad($data[50]); $sweep = self::positiveAngle(deg2rad($data[51]-$data[50]));
                } else { $start = 0.0; $sweep = 2*M_PI; }
                $this->arc($data[10], $data[20], $data[40], $start, $sweep);
            } elseif ($type === 'LWPOLYLINE') {
                $finishVertex();
                if (!isset($data[90]) || $data[90] !== (float)$vertexCount || $vertexCount < 2 || fmod($data[70] ?? 0.0, 1.0) !== 0.0 || (((int)($data[70] ?? 0)) & ~129) !== 0 || ($data[43] ?? 0.0) !== 0.0) {
                    throw new RuntimeException('A polyline has unsupported or incomplete geometry.');
                }
                if ((((int)($data[70] ?? 0)) & 1) === 1) $this->segment($previous, $first);
            }
            $type = null; $data = []; $first = null; $previous = null; $vertex = null; $vertexCount = 0;
        };
        try {
            while (($codeLine = fgets($file, 65538)) !== false) {
                $valueLine = fgets($file, 65538);
                if ($valueLine === false || strlen($codeLine) > 65536 || strlen($valueLine) > 65536) throw new RuntimeException('The DXF contains an incomplete or oversized group.');
                $code = trim($codeLine); $value = trim($valueLine);
                if (preg_match('/\A\d+\z/D', $code) !== 1) throw new RuntimeException('The DXF contains an invalid group code.');
                // The separate length reader uses canonical group-code strings.
                // Reject padded codes so bounds and length cannot disagree.
                if ($code !== (string)(int)$code) throw new RuntimeException('The DXF contains unsupported group-code formatting.');
                $code = (int)$code;
                if ($awaitSection) {
                    if ($code !== 2 || $section !== null) throw new RuntimeException('The DXF section is incomplete.');
                    $section = strtoupper($value); $awaitSection = false;
                    if ($section === 'HEADER') { if ($seenHeader) throw new RuntimeException('Duplicate DXF header.'); $seenHeader = true; }
                    if ($section === 'ENTITIES') {
                        if ($seenEntities || !$seenHeader || $units === null) throw new RuntimeException('The DXF requires an explicit unit header before its geometry.');
                        $this->scale = match ($units) { 1=>25.4, 2=>304.8, 3=>1609344.0, 4=>1.0, 5=>10.0, 6=>1000.0, 7=>1e6, 8=>0.0000254, 9=>0.0254, 10=>914.4, 11=>1e-7, 12=>1e-6, 13=>0.001, 14=>100.0, 15=>10000.0, 16=>100000.0, 17=>1e12, default=>throw new RuntimeException('Please export your DXF with explicit, supported units such as millimetres.') };
                        $seenEntities = true;
                    }
                    continue;
                }
                if ($code === 0 && strtoupper($value) === 'SECTION') {
                    if ($section !== null) throw new RuntimeException('Nested DXF sections are unsupported.');
                    $awaitSection = true; continue;
                }
                if ($code === 0 && strtoupper($value) === 'ENDSEC') {
                    if ($section === null || ($section === 'HEADER' && $awaitUnits)) throw new RuntimeException('The DXF section is incomplete.');
                    if ($section === 'ENTITIES') $finishEntity();
                    $section = null; continue;
                }
                if ($code === 0 && strtoupper($value) === 'EOF') {
                    if ($section !== null || $awaitSection || !$seenHeader || !$seenEntities || $units === null) throw new RuntimeException('The DXF is missing required sections or units.');
                    $seenEof = true; break;
                }
                if ($section === null) {
                    if ($code === 999) continue; // DXF comments do not affect geometry.
                    throw new RuntimeException('The DXF contains data outside a valid section.');
                }
                if ($section === 'HEADER') {
                    // The length reader expects units immediately after INSUNITS.
                    if ($awaitUnits && $code !== 70) throw new RuntimeException('The DXF units are incomplete.');
                    if ($code === 9) {
                        if ($awaitUnits) throw new RuntimeException('The DXF units are incomplete.');
                        $awaitUnits = strtoupper($value) === '$INSUNITS';
                    } elseif ($awaitUnits && $code === 70) {
                        if ($units !== null || preg_match('/\A\d+\z/D', $value) !== 1) throw new RuntimeException('The DXF units are invalid.');
                        $units = (int)$value; $awaitUnits = false;
                    }
                    continue;
                }
                if ($section !== 'ENTITIES') continue;
                if ($code === 0) {
                    $finishEntity(); $type = strtoupper($value);
                    if (!in_array($type, ['LINE','ARC','CIRCLE','LWPOLYLINE'], true)) throw new RuntimeException('This DXF contains an unsupported entity and needs shop review.');
                    continue;
                }
                if ($type === null) throw new RuntimeException('The DXF entity section is incomplete.');
                if ($code === 410 && strcasecmp($value, 'Model') !== 0) throw new RuntimeException('Only model-space cutting paths can be priced automatically.');
                if ($type === 'LWPOLYLINE' && $code === 10) {
                    $finishVertex(); $vertex = ['x'=>$number($value), 'bulge'=>0.0]; continue;
                }
                if ($type === 'LWPOLYLINE' && ($code === 20 || $code === 42 || $code === 40 || $code === 41)) {
                    if ($vertex === null) throw new RuntimeException('A polyline vertex is incomplete.');
                    $n = $number($value);
                    if (($code === 40 || $code === 41) && $n !== 0.0) throw new RuntimeException('Wide polylines need shop review.');
                    if ($code === 20) { if (isset($vertex['y'])) throw new RuntimeException('Duplicate polyline coordinate.'); $vertex['y'] = $n; }
                    if ($code === 42) { if (isset($vertex['has_bulge'])) throw new RuntimeException('Duplicate polyline bulge.'); $vertex['bulge'] = $n; $vertex['has_bulge'] = true; }
                    continue;
                }
                $scalarCodes = $type === 'LWPOLYLINE' ? [30,31,38,39,43,60,67,70,90,210,220,230] : [10,20,30,11,21,31,39,40,50,51,60,67,210,220,230];
                if (in_array($code, $scalarCodes, true)) {
                    if (array_key_exists($code, $data)) throw new RuntimeException('A DXF entity contains duplicate values.');
                    $data[$code] = $number($value);
                }
            }
            if (!$seenEof) throw new RuntimeException('The DXF file is incomplete.');
            while (!feof($file)) {
                $tail = fread($file, 8192);
                if ($tail === false) throw new RuntimeException('Unable to finish reading the DXF.');
                if (trim($tail) !== '') throw new RuntimeException('The DXF contains trailing data.');
            }
        } finally { fclose($file); }
        $width = ($this->maxX - $this->minX) * $this->scale; $height = ($this->maxY - $this->minY) * $this->scale;
        if (!$this->segments || !is_finite($width) || !is_finite($height) || $width <= 0 || $height <= 0) throw new RuntimeException('The drawing needs a shop review to confirm its dimensions.');
        // A 0.00001 mm margin protects capacity checks from floating-point rounding.
        return ['width_mm'=>$width + 0.00001, 'height_mm'=>$height + 0.00001];
    }
}

function quote_dxf_bounds_mm(string $path): array { return (new QuoteDxfBounds())->measure($path); }
