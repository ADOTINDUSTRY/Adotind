<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/svg_trace_ai.php';

function review_check(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
}

$loop = [
    'id'=>'p4s2','closed'=>true,'nodes'=>[[0,0],[25,0],[50,0],[50,50],[0,50]],
    'segments'=>[['L'],['C',30,0,40,0],['L'],['L'],['A',60,60,0,0,1]],
    'candidates'=>[['action'=>'remove','index'=>1],['action'=>'straighten','index'=>0]]
];
$open = [
    'id'=>'range:48','closed'=>false,'nodes'=>[[4,20],[15,25],[32,20]],
    'segments'=>[['L'],['C',18,24,23,21]]
];
$review = svg_trace_ai_review_contours([$loop,$open]);
review_check($review !== null && $review[0]['nodes'] === $loop['nodes'], 'Review must retain original positions and indexes.');
review_check(count($review[0]['candidates']) === 1, 'Ignore a redundant candidate to straighten a line.');
review_check(svg_trace_ai_review_contours([$loop,$loop]) === null, 'Duplicate contour id.');
review_check(svg_trace_ai_review_contours([array_replace($open,['segments'=>[['L']]])]) === null, 'Invalid segment count.');
review_check(svg_trace_ai_review_contours([array_replace($open,['segments'=>[['A',5,4,45,0,2],['L']]])]) === null, 'Invalid arc flag.');
review_check(svg_trace_ai_review_contours([array_replace($open,['nodes'=>[[0,0],[NAN,3],[10,2]]])]) === null, 'Invalid coordinate.');
review_check(svg_trace_ai_review_contours([array_replace($loop,['nodes'=>array_fill(0,641,[0,0]),'segments'=>array_fill(0,641,['L'])])]) === null, 'Request must be bounded before contacting Gemini.');

$edit = static fn(string $action,int $index): array => ['action'=>$action,'index'=>$index,'reason'=>'Clean up this edge.'];
$reply = ['proposals'=>[
    ['id'=>'other','edits'=>[$edit('smooth',1)]],
    ['id'=>'p4s2','edits'=>[
        $edit('smooth',0),$edit('remove',0),$edit('straighten',1),$edit('straighten',0),$edit('invent',2),$edit('remove',3),
        $edit('remove',4),$edit('remove',2),$edit('remove',6),$edit('smooth',-1)
    ]],
    ['id'=>'range:48','edits'=>[$edit('remove',0),$edit('remove',2),$edit('smooth',1),$edit('straighten',2)]]
]];
$valid = svg_trace_ai_review_proposals($reply,$review);
review_check($valid === [
    ['id'=>'p4s2','edits'=>[$edit('smooth',0),$edit('straighten',1),$edit('remove',3),$edit('remove',4)]],
    ['id'=>'range:48','edits'=>[$edit('smooth',1)]],
], 'Actions must target the original contour, protect open endpoints and leave a valid closed loop.');
$single = svg_trace_ai_review_contours([array_replace($loop,['focus'=>['type'=>'segment','index'=>1]])]);
review_check(svg_trace_ai_review_proposals($reply,$single) === [['id'=>'p4s2','edits'=>[$edit('straighten',1)]]], 'Focus must restrict edits.');
review_check(svg_trace_ai_review_proposals(['proposals'=>[]],$review) === [], 'An empty review is a valid result.');
review_check(svg_trace_ai_review_proposals(['paths'=>[]],$review) === null, 'Replacement SVG paths cannot be applied as review actions.');
echo "Node review geometry, focus, bounds and proposal filtering passed.\n";
