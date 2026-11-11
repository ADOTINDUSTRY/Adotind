<?php

return [
    'currency' => env('QUOTE_CURRENCY', 'EUR'),
    'vat_percent' => (float) env('QUOTE_VAT_PERCENT', 19),
    'markup_percent' => (float) env('QUOTE_MARKUP_PERCENT', 0),
    'round_to' => (float) env('QUOTE_ROUND_TO', 0.5),
];

