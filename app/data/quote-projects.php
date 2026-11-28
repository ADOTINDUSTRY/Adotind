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
        'description' => 'Upload a DXF drawing for a cutting estimate.',
        'keywords' => 'laser sheet CNC router acrylic metal wood cutting DXF CAD fabrication',
        'workflow' => 'drawing',
    ],
    'picture' => [
        'name' => 'Cut-out logo or shape',
        'description' => 'Preview the outline of a picture before preparing a cutting file.',
        'keywords' => 'photo image JPG PNG artwork logo trace shape silhouette',
        'workflow' => 'picture',
    ],
    'fiber' => ['name'=>'Fiber laser cutting','description'=>'Tell us about the metal parts you need cut.','keywords'=>'fiber fibre laser steel sheet metal cutting dxf','workflow'=>'inquiry'],
    'co2' => ['name'=>'CO2 laser cutting','description'=>'Tell us about the non-metal parts you need cut.','keywords'=>'co2 laser acrylic wood non-metal cutting dxf','workflow'=>'inquiry'],
    'acrylic' => ['name'=>'Acrylic cutting','description'=>'Request cut acrylic shapes or parts.','keywords'=>'acrylic plexiglass perspex plastic laser router cnc','workflow'=>'inquiry'],
    'metal' => ['name'=>'Metal cutting','description'=>'Request custom metal parts or shapes.','keywords'=>'metal steel aluminium stainless fiber laser sheet dxf','workflow'=>'inquiry'],
    'wood' => ['name'=>'Wood and MDF cutting','description'=>'Request cut timber, plywood or MDF parts.','keywords'=>'wood mdf plywood timber cnc router co2 laser','workflow'=>'inquiry'],
    'letters3d' => ['name'=>'3D and illuminated letters','description'=>'Plan custom three-dimensional letters or illuminated signage.','keywords'=>'channel letters 3d signs light front lit halo','workflow'=>'inquiry'],
    'printing' => ['name'=>'Printing and graphics','description'=>'Tell us about your printed signs, graphics or stickers.','keywords'=>'printing stickers vinyl banners graphics vehicle wraps','workflow'=>'inquiry'],
    'fabrication' => ['name'=>'Metal fabrication','description'=>'Tell us about custom metalwork, welding or structures.','keywords'=>'fabrication welding metalwork brackets structure','workflow'=>'inquiry'],
];
