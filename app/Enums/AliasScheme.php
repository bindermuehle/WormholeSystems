<?php

declare(strict_types=1);

namespace App\Enums;

enum AliasScheme: string
{
    case Numeric = 'numeric';
    case Alphabetical = 'alphabetical';
    case Corp = 'corp';

    public const self DEFAULT = self::Numeric;
}
