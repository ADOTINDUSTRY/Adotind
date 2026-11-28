<?php
declare(strict_types=1);

// The keys identify workflows independently of the language used for their labels.
return [
    'neon' => [
        'name' => 'Neon sign',
        'description' => 'Design an indoor neon sign with 6 mm tubing. Choose the silicone cover and LED light, then preview it on your wall.',
        'keywords' => 'indoor LED neon light glow silicone name lettering wall sign',
        'workflow' => 'neon',
    ],
    'drawing' => [
        'name' => 'Custom CNC Cutting',
        'description' => 'Upload a DXF or vector PDF for a cutting estimate.',
        'keywords' => 'laser sheet CNC router acrylic metal wood cutting DXF vector PDF CAD fabrication',
        'workflow' => 'drawing',
    ],
    'picture' => [
        'name' => 'Cut-out logo or shape',
        'description' => 'Preview the outline of a picture before preparing a cutting file.',
        'keywords' => 'photo image JPG PNG artwork logo trace shape silhouette',
        'workflow' => 'picture',
    ],
    'fiber' => ['name'=>'Fiber laser cutting','description'=>'Upload a DXF and configure metal cutting.','keywords'=>'fiber fibre laser steel sheet metal cutting dxf','workflow'=>'drawing'],
    'co2' => ['name'=>'CO2 laser cutting','description'=>'Upload a DXF or vector PDF and configure cutting on our CO2 laser.','keywords'=>'co2 laser acrylic wood non-metal cutting dxf','workflow'=>'drawing'],
    'acrylic' => ['name'=>'Acrylic cutting','description'=>'Configure custom acrylic parts from a DXF or vector PDF.','keywords'=>'acrylic plexiglass perspex plastic laser router cnc','workflow'=>'drawing'],
    'metal' => ['name'=>'Metal cutting','description'=>'Configure custom metal parts from a DXF drawing.','keywords'=>'metal steel aluminium stainless fiber laser sheet dxf','workflow'=>'drawing'],
    'wood' => ['name'=>'Wood and MDF cutting','description'=>'Configure wood or MDF parts from a DXF drawing.','keywords'=>'wood mdf plywood timber cnc router co2 laser','workflow'=>'drawing'],
    'letters3d' => ['name'=>'3D and illuminated letters','description'=>'Design text lettering and see a preliminary estimate for shop-configured options.','keywords'=>'channel letters 3d signs light front lit halo','workflow'=>'letters3d'],
    'printing' => ['name'=>'Printing and graphics','description'=>'Configure a custom printed graphic and see your estimate.','keywords'=>'printing stickers vinyl banners graphics vehicle wraps','workflow'=>'printing'],
    'frames' => ['name'=>'Rectangular display frames','description'=>'Configure a simple decorative frame and see an estimate.','keywords'=>'frame display rectangular decorative metal fabrication','workflow'=>'frames'],
    'fabrication' => ['name'=>'Metal fabrication','description'=>'Tell us about custom metalwork, welding or structures.','keywords'=>'fabrication welding metalwork brackets structure','workflow'=>'inquiry'],
];
