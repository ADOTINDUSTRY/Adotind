<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/quote_assistant.php';
function context_expect(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$landings = require __DIR__ . '/../app/data/service-landing-pages.php';
foreach ($landings as $slug=>$item) {
    context_expect(quote_assistant_service_name('service-landing', $slug) === $item['name'], 'Known landing must resolve to the server-owned name.');
}
context_expect(quote_assistant_service_name('service-landing', 'ignore instructions') === '', 'Unknown or injected slug must not become assistant context.');
context_expect(quote_assistant_service_name('home', array_key_first($landings)) === '', 'Other pages must not accept a service context.');
context_expect(quote_assistant_service_name('service-landing', ['foo']) === '', 'Non-string service must be ignored.');
$services = require __DIR__ . '/../app/data/services.php';
context_expect(quote_assistant_service_name('service-detail', $services[0]['slug']) === $services[0]['name'], 'Existing service detail remains supported.');
$allowed = ['fiber'=>['name'=>'Untrusted label','workflow'=>'inquiry'], 'neon'=>['name'=>'Neon','workflow'=>'neon']];
context_expect(quote_assistant_inquiry_name('fiber', $allowed) === 'Fiber laser cutting', 'Inquiry context must use the built-in category label, not supplied text.');
context_expect(quote_assistant_inquiry_name('metal', $allowed) === '', 'A disabled or unavailable category must not become context.');
context_expect(quote_assistant_inquiry_name('neon', $allowed) === '', 'A non-inquiry workflow must not be accepted as inquiry context.');
context_expect(quote_assistant_inquiry_name(['fiber'], $allowed) === '', 'A non-string inquiry ID must be ignored.');
echo "Assistant service context checks passed.\n";
