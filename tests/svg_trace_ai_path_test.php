<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/svg_trace_ai.php';
foreach ([
    ['M0 0 L50 2 Q40 40 10 12 Z M6 6 L8 8 L10 8 Z',true,false,true],
    ['M0 0 C10 5 20 5 25 0',false,true,true],
    ['M0 0 L10 2',true,true,false],
    ['M0 0 L999999 0 Z',true,true,false],
    ['M0 0 L10 0 Z M2 0 L3 0 Z',true,true,false],
    ['M0 0 L4 4 Z<script/>',true,true,false],
    ['M0 0 L4 4 Z',false,true,false],
] as [$d,$closed,$single,$valid]) {
    if ((svg_trace_ai_path($d,100,100,$closed,$single) !== null) !== $valid) throw new RuntimeException('Unexpected path validation result.');
}
echo "AI trace path validation passed.\n";
