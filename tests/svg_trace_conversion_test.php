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
    // An O with an accent. Test opaque and transparent light/dark lettering.
    foreach ([[0,255,false],[255,0,false],[255,0,true],[0,255,true]] as [$ink,$paper,$transparent]) {
        $image = imagecreatetruecolor(100,100);
        imagealphablending($image,false);
        imagesavealpha($image,true);
        $bg = imagecolorallocatealpha($image,$paper,$paper,$paper,$transparent ? 127 : 0);
        $fg = imagecolorallocate($image,$ink,$ink,$ink);
        imagefill($image,0,0,$bg);
        imagefilledellipse($image,50,60,50,60,$fg);
        imagefilledellipse($image,50,60,28,40,$bg);
        imagefilledellipse($image,50,16,6,6,$fg);
        imagepng($image,$source);
        foreach (['font','solid'] as $preset) {
            $settings = StEngine::normaliseSettings(['preset'=>$preset]);
            $prep = StPrep::prepare($source,$png,$settings);
            $run = StConversion::tracePrepared($png,$svg,$prep,$settings,30,768,StConfig::load());
            $doc = new DOMDocument();
            if (!$run['ok'] || !$doc->loadXML(StConversion::readSvg($svg,$prep,$settings))) throw new RuntimeException('Font trace failed.');
            $paths = $doc->getElementsByTagName('path');
            $loops = 0;
            foreach ($paths as $p) $loops += substr_count($p->getAttribute('d'),'M');
            if ($paths->length !== 2 || $loops !== 3) throw new RuntimeException("$preset trace lost an accent or letter counter.");
        }
    }
    // Yellow has strong contrast with white in the blue channel, even though both are bright.
    $image = imagecreatetruecolor(60,48);
    imagefill($image,0,0,0xffffff);
    imagefilledrectangle($image,10,8,49,39,0xffff00);
    imagefilledrectangle($image,22,18,37,29,0xffffff);
    imagepng($image,$source);
    $settings = StEngine::normaliseSettings(['preset'=>'solid']);
    $prep = StPrep::prepare($source,$png,$settings);
    $mask = imagecreatefrompng($png);
    foreach ([[5,5,0xffffff],[15,15,0],[27,24,0xffffff]] as [$x,$y,$want]) {
        if ((imagecolorat($mask,(int)($x*$prep['scale']),(int)($y*$prep['scale'])) & 0xffffff) !== $want) {
            throw new RuntimeException('Solid trace lost light-coloured ink or its opening.');
        }
    }
    foreach (['fill','centerline'] as $output) {
        $settings = StEngine::normaliseSettings(['preset'=>'solid','output'=>$output]);
        $prep = StPrep::prepare($source,$png,$settings);
        $mask = imagecreatefrompng($png);
        $fractional = false;
        $y = (int)(12*$prep['scale']);
        for ($x=0;$x<imagesx($mask);$x++) {
            $v = imagecolorat($mask,$x,$y) & 255;
            if ($v>0 && $v<255) { $fractional = true; break; }
        }
        if ($fractional !== ($output==='fill')) throw new RuntimeException("Unexpected edge coverage for $output.");
    }
    // At native scale, a tonal spike along a vertical edge should be damped
    // without flipping either an isolated ink sample or a pinhole in the ink.
    $image = imagecreatetruecolor(3000,40);
    imagefill($image,0,0,0xffffff);
    imagefilledrectangle($image,10,5,39,34,0);
    imagefilledrectangle($image,40,5,40,34,0x686868);
    imagesetpixel($image,40,20,0x787878);
    imagesetpixel($image,24,18,0xffffff);
    imagesetpixel($image,54,20,0);
    imagepng($image,$source);
    $settings = StEngine::normaliseSettings(['preset'=>'solid']);
    $prep = StPrep::prepare($source,$png,$settings);
    $mask = imagecreatefrompng($png);
    $step = (imagecolorat($mask,40,20)&255) - (imagecolorat($mask,40,19)&255);
    if ($prep['scale'] !== 1.0 || $step < 1 || $step >= 32 ||
        (imagecolorat($mask,24,18)&255)<128 || (imagecolorat($mask,54,20)&255)>=128) {
        throw new RuntimeException('Tone cleanup lost a detail or failed to damp the edge spike.');
    }
    // The colour preset must continue to prepare separate inks including
    // a sharp triangular corner and an opening cut into the triangle.
    $image = imagecreatetruecolor(96,80);
    imagefill($image,0,0,0xffffff);
    imagefilledpolygon($image,[8,64,32,8,56,64],0xff0000);
    imagefilledrectangle($image,29,34,35,40,0xffffff);
    imagefilledrectangle($image,64,16,84,60,0x0000ff);
    imagepng($image,$source);
    $settings = StEngine::normaliseSettings(['preset'=>'logo','remove_bg'=>0]);
    $prep = StPrep::prepare($source,$png,$settings);
    $mask = imagecreatefrompng($png);
    $sample = static fn(int $x,int $y):int => imagecolorat($mask,(int)(($x+.5)*$prep['scale']),(int)(($y+.5)*$prep['scale']))&0xffffff;
    $red=$sample(30,55); $blue=$sample(70,30); $paper=$sample(3,3);
    if (count(array_unique([$red,$blue,$paper]))!==3 || $sample(32,12)!==$red || $sample(32,37)!==$paper) {
        throw new RuntimeException('Colour logo lost an ink, corner or opening.');
    }
    $settings = StEngine::normaliseSettings(['preset'=>'logo','remove_bg'=>0,'replace_from'=>sprintf('#%06x',$red),'replace_to'=>'#117744']);
    $prep = StPrep::prepare($source,$png,$settings);
    $recoloured = imagecreatefrompng($png);
    if ((imagecolorat($recoloured,(int)(30*$prep['scale']),(int)(55*$prep['scale']))&0xffffff)!==0x117744 ||
        (imagecolorat($recoloured,(int)(70*$prep['scale']),(int)(30*$prep['scale']))&0xffffff)!==$blue) {
        throw new RuntimeException('Bitmap recolour must replace just the selected ink.');
    }
    foreach (['fill','outline','centerline'] as $output) {
        $settings=StEngine::normaliseSettings(['preset'=>'solid','output'=>$output,'sharpen'=>45,'ink_color'=>'#336699']);
        $prep=StPrep::prepare($source,$png,$settings);
        $result=StConversion::tracePrepared($png,$svg,$prep,$settings,30,768,StConfig::load());
        if (!$result['ok'] || !str_contains(StConversion::readSvg($svg,$prep,$settings),'="#336699"')) {
            throw new RuntimeException("Selected ink missing from $output SVG.");
        }
    }
    echo "Logo, centreline, fractional edges, tone cleanup, separate inks, corners and counters passed.\n";
} finally {
    foreach ([$source, $png, $svg] as $path) if (is_file($path)) unlink($path);
    rmdir($dir);
}
