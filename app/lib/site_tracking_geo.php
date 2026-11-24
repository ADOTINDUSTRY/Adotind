<?php
declare(strict_types=1);

function site_tracking_country(string $address): ?string
{
    if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_GLOBAL_RANGE)) return null;
    $packed = inet_pton($address);
    if ($packed === false) return null;
    if (strlen($packed) === 16 && str_starts_with($packed, str_repeat("\0", 10) . "\xff\xff")) {
        $packed = substr($packed, 12);
        if (!filter_var(inet_ntop($packed), FILTER_VALIDATE_IP, FILTER_FLAG_GLOBAL_RANGE)) return null;
    }

    $path = '/var/www/site-tracking/geo/country.sqlite';
    if (!is_readable($path)) return null;
    try {
        $database = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $database->exec('PRAGMA query_only=ON');
        $lookup = $database->prepare(
            'SELECT last_ip, country FROM country_ranges
             WHERE address_bytes = :address_bytes AND first_ip <= :ip
             ORDER BY first_ip DESC LIMIT 1'
        );
        $ip = bin2hex($packed);
        $lookup->bindValue(':address_bytes', strlen($packed), PDO::PARAM_INT);
        $lookup->bindValue(':ip', $ip, PDO::PARAM_STR);
        $lookup->execute();
        $match = $lookup->fetch(PDO::FETCH_ASSOC);
        if (!$match || strcmp($match['last_ip'], $ip) < 0) return null;
        $country = $match['country'];
        return $country !== 'ZZ' && preg_match('/^[A-Z]{2}$/D', $country) ? $country : null;
    } catch (PDOException) {
        return null;
    }
}

