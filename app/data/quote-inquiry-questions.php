<?php
declare(strict_types=1);

// Prompts collect context for a human-reviewed inquiry; they do not set a
// material, machine, stock status, quote or manufacturing approval.
return [
    'fiber' => [
        'dimensions'=>['Size of one part','e.g. 200 × 100 mm'],
        'material'=>['Metal and thickness','e.g. 2 mm stainless steel'],
        'quantity'=>['How many parts?','e.g. 10'],
        'finish'=>['Finish or edge requirements','e.g. brushed finish'],
    ],
    'co2' => [
        'dimensions'=>['Size of one part','e.g. 200 × 100 mm'],
        'material'=>['Material and thickness','e.g. 3 mm acrylic'],
        'quantity'=>['How many parts?','e.g. 10'],
        'finish'=>['Cutting or engraving details','e.g. cut the outline and engrave the logo'],
    ],
    'acrylic' => [
        'dimensions'=>['Size of one piece','e.g. 300 × 200 mm'],
        'material'=>['Acrylic colour and thickness','e.g. white, 3 mm'],
        'quantity'=>['How many pieces?','e.g. 6'],
        'installation'=>['Where will it be used or mounted?','e.g. indoor wall'],
        'finish'=>['Finish or other details','e.g. polished edges'],
    ],
    'metal' => [
        'dimensions'=>['Size of one part','e.g. 200 × 100 mm'],
        'material'=>['Metal and thickness','e.g. 2 mm mild steel'],
        'quantity'=>['How many parts?','e.g. 10'],
        'installation'=>['Where will it be used?','e.g. outdoors'],
        'finish'=>['Finish or edge requirements','e.g. powder coated'],
    ],
    'wood' => [
        'dimensions'=>['Size of one piece','e.g. 400 × 300 mm'],
        'material'=>['Wood type and thickness','e.g. 12 mm plywood'],
        'quantity'=>['How many pieces?','e.g. 5'],
        'installation'=>['Where will it be used?','e.g. indoors'],
        'finish'=>['Finish or machining details','e.g. sanded edges'],
    ],
    'letters3d' => [
        'dimensions'=>['Overall sign size','e.g. 2 metres wide'],
        'material'=>['Preferred material, if known','e.g. acrylic or metal'],
        'quantity'=>['Number of signs','e.g. 1'],
        'installation'=>['Location and mounting','e.g. outside on a wall'],
        'finish'=>['Colour and lighting','e.g. white letters, warm white lighting'],
    ],
    'printing' => [
        'dimensions'=>['Finished size','e.g. 1 × 2 metres'],
        'material'=>['Preferred material, if known','e.g. vinyl or banner'],
        'quantity'=>['How many prints?','e.g. 4'],
        'installation'=>['Where will it be used?','e.g. outdoors on a window'],
        'finish'=>['Finish or application','e.g. matte laminate'],
    ],
    'fabrication' => [
        'dimensions'=>['Overall size','e.g. 1 × 2 metres'],
        'material'=>['Preferred material, if known','e.g. steel tube'],
        'quantity'=>['How many items?','e.g. 2'],
        'installation'=>['Location and mounting','e.g. freestanding indoors'],
        'finish'=>['Finish or fabrication details','e.g. painted black'],
    ],
];
