<?php

declare(strict_types=1);

namespace App\Features;

use App\Models\Map;
use App\Models\Signature;
use Illuminate\Database\Eloquent\Builder;
use Inertia\ProvidesInertiaProperties;
use Inertia\RenderContext;

/**
 * Aliases the chain has already handed out to holes that are not yet connected,
 * across the whole map.
 *
 * The map prop carries signature *counts* only — full signatures come with the
 * selected system — so without this the alias suggester can only see the
 * reserved names of the system the scout happens to have open. A hole named in
 * one system then leaves its slot free everywhere else and the next scan hands
 * the same alias out again.
 *
 * Connected holes are excluded: their real alias lives on the destination
 * system (already in the map prop), while the signature keeps a stale copy from
 * before the jump. Counting both double-books the slot.
 *
 * The map_solarsystem id rides along so the client can drop reservations made in
 * systems that have rolled out of the chain, matching how it frees the aliases
 * of unreachable systems.
 */
final readonly class MapReservedAliasesFeature implements ProvidesInertiaProperties
{
    public function __construct(private Map $map) {}

    public function toInertiaProperties(RenderContext $context): array
    {
        return [
            'reserved_aliases' => fn (): array => $this->getReservedAliases(),
        ];
    }

    /**
     * @return list<array{map_solarsystem_id: int, alias: string}>
     */
    private function getReservedAliases(): array
    {
        return Signature::query()
            ->whereNull('map_connection_id')
            ->whereNotNull('alias')
            ->where('alias', '!=', '')
            ->whereHas('mapSolarsystem', fn (Builder $query) => $query->where('map_id', $this->map->id))
            ->get(['map_solarsystem_id', 'alias'])
            ->map(fn (Signature $signature): array => [
                'map_solarsystem_id' => (int) $signature->map_solarsystem_id,
                'alias' => (string) $signature->alias,
            ])
            ->all();
    }
}
