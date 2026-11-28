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

$rasterEdits = [$edit('fit',0),$edit('align',1),$edit('fit',4)];
$withRaster = svg_trace_ai_review_contours([array_replace($loop,['candidates'=>$rasterEdits])]);
review_check($withRaster[0]['candidates'] === [['action'=>'fit','index'=>0],['action'=>'align','index'=>1]],
    'The model should see raster fitting candidates for nodes and for straight segments, excluding exact arcs.');
$model = ['proposals'=>[['id'=>$loop['id'],'edits'=>$rasterEdits]]];
review_check(svg_trace_ai_review_proposals($model,$withRaster)[0]['edits'] === array_slice($rasterEdits,0,2),
    'The client should receive compatible indexed edits for aligning an anchor and fitting a curve.');
$oneSegment = svg_trace_ai_review_contours([array_replace($loop,['focus'=>['type'=>'segment','index'=>0]])]);
review_check(svg_trace_ai_review_proposals($model,$oneSegment)[0]['edits'] === [$edit('fit',0)], 'A focused segment must accept only its fit.');
review_check(svg_trace_ai_edit_target($open,'align',0) === null && svg_trace_ai_edit_target($open,'align',2) === null,
    'Image alignment must preserve open endpoints.');
$boxSegments = $loop['segments'];
$boxSegments[4] = ['C',0,35,0,18];
$selected = svg_trace_ai_review_contours([array_replace($loop,['selected'=>[0,1,4], 'segments'=>$boxSegments])]);
review_check($selected[0]['selected'] === [0,1,4] && $selected[0]['candidates'][0] === ['action'=>'remove','index'=>1],
    'Keep the selected nodes and filter suggested candidates against that selection.');
$box = ['proposals'=>[['id'=>$loop['id'],'edits'=>[$edit('fit',0),$edit('align',2),$edit('straighten',1),$edit('straighten',4)]]]];
review_check(svg_trace_ai_review_proposals($box,$selected)[0]['edits'] === [$edit('fit',0),$edit('straighten',4)],
    'A selected region must exclude other nodes and segments, including an edge with only one selected endpoint.');
foreach ([[],[-1,2],[1,1],[2,8],['1']] as $invalid) {
    review_check(svg_trace_ai_review_contours([array_replace($loop,['selected'=>$invalid])]) === null, 'Invalid selected node list.');
}
$position = ['viewBox'=>[-50,20,220,90], 'imageViewBox'=>[-10,42.5,30,20]];
$frame = svg_trace_ai_review_reference($position,220,90);
review_check($frame['frames'] === $position && $frame['parts'] === [], 'Nonzero origins and fractional crops should be carried through exactly.');
review_check(svg_trace_ai_review_reference([],220,90)['frames']['imageViewBox'] === [0,0,220,90], 'Older clients default to the full drawing.');
review_check(svg_trace_ai_review_reference(['imageViewBox'=>[0,0,0,20]],220,90) === null, 'Invalid crop dimensions.');
review_check(svg_trace_ai_review_reference(['overlay'=>'missing source'],220,90) === null, 'An overlay needs a clean original for comparison.');
review_check(svg_trace_ai_review_reference(['image'=>'broken'],220,90) === null, 'Invalid JPEG.');
if (function_exists('imagejpeg')) {
    $jpeg = static function (int $w, int $h): string {
        ob_start();
        imagejpeg(imagecreatetruecolor($w,$h));
        return base64_encode(ob_get_clean());
    };
    $referenceImage = $jpeg(240,160);
    $paired = svg_trace_ai_review_reference($position+['image'=>$referenceImage,'overlay'=>$referenceImage],220,90);
    review_check($paired['frames']['imagePixels'] === [240,160] && array_keys($paired['parts'][0]) === ['text'] &&
        $paired['parts'][1]['inlineData']['data'] === $referenceImage && isset($paired['parts'][2]['text'],$paired['parts'][3]['inlineData']),
        'Clean and annotated images should be labelled in order with their shared pixel dimensions.');
    review_check(svg_trace_ai_review_reference(['image'=>$referenceImage,'overlay'=>$jpeg(120,90)],220,90) === null,
        'Different-sized images cannot be treated as the same view.');
    review_check(svg_trace_ai_review_reference(['image'=>$jpeg(1025,32)],220,90) === null, 'Cap review image size before calling Gemini.');
}
echo "Node review geometry, focus, raster edit targets and aligned image inputs passed.\n";
