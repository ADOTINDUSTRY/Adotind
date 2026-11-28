<?php
declare(strict_types=1);
require_once __DIR__ . '/../svg-trace/app/lib/conversion.php';

$dir = sys_get_temp_dir() . '/trace-test-' . bin2hex(random_bytes(6));
mkdir($dir);
try {
    $source = $dir . '/logo.png';
    $png = $dir . '/prepared.png';
    $svg = $dir . '/result.svg';
    $image = imagecreatetruecolor(96, 80);
    $white = imagecolorallocate($image, 255, 255, 255);
    imagefill($image, 0, 0, $white);
    imagefilledellipse($image, 48, 40, 68, 60, imagecolorallocate($image, 10, 30, 120));
    imagefilledellipse($image, 48, 40, 34, 30, $white);
    imagepng($image, $source);
    foreach ([['mode'=>'precise'], ['preset'=>'neon']] as $options) {
        $settings = StEngine::normaliseSettings($options);
        $prep = StPrep::prepare($source, $png, $settings);
        if (!$prep) throw new RuntimeException('Image preparation failed.');
        $run = StConversion::tracePrepared($png, $svg, $prep, $settings, 30, 768, StConfig::load());
        if (!$run['ok']) throw new RuntimeException('Trace failed.');
        $doc = new DOMDocument();
        if (!$doc->loadXML(StConversion::readSvg($svg, $prep, $settings)) || $doc->getElementsByTagName('path')->length < 1
            || $doc->documentElement->getAttribute('width') !== '96' || $doc->documentElement->getAttribute('height') !== '80') {
            throw new RuntimeException('Expected editable paths at the original artwork size.');
        }
    }
    echo "Editable logo and centreline SVG conversions passed.\n";
} finally {
    foreach ([$source, $png, $svg] as $path) if (is_file($path)) unlink($path);
    rmdir($dir);
}
