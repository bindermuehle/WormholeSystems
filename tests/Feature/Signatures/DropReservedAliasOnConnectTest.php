<?php

declare(strict_types=1);

use App\Models\Map;
use App\Models\MapConnection;

it('drops a reserved alias when the hole becomes connected', function () {
    $map = Map::factory()->create();
    $origin = placeMapSolarsystem($map, 30024001);
    $target = placeMapSolarsystem($map, 30024002);
    $connection = MapConnection::factory()->create([
        'map_id' => $map->id,
        'from_map_solarsystem_id' => $origin->id,
        'to_map_solarsystem_id' => $target->id,
    ]);

    $signature = $origin->signatures()->create(['signature_id' => 'ABC-123', 'alias' => 'a5a']);

    $signature->update(['map_connection_id' => $connection->id]);

    expect($signature->fresh()->alias)->toBeNull();
});

it('keeps a reserved alias while the hole stays unconnected', function () {
    $map = Map::factory()->create();
    $origin = placeMapSolarsystem($map, 30024003);

    $signature = $origin->signatures()->create(['signature_id' => 'ABC-123']);

    $signature->update(['alias' => 'a5a']);

    expect($signature->fresh()->alias)->toBe('a5a');
});

it('respects an alias set in the same update as the connection', function () {
    $map = Map::factory()->create();
    $origin = placeMapSolarsystem($map, 30024004);
    $target = placeMapSolarsystem($map, 30024005);
    $connection = MapConnection::factory()->create([
        'map_id' => $map->id,
        'from_map_solarsystem_id' => $origin->id,
        'to_map_solarsystem_id' => $target->id,
    ]);

    $signature = $origin->signatures()->create(['signature_id' => 'ABC-123', 'alias' => 'a5a']);

    $signature->update(['map_connection_id' => $connection->id, 'alias' => 'a5b']);

    expect($signature->fresh()->alias)->toBe('a5b');
});

it('does not touch the alias when an unrelated field changes on a connected hole', function () {
    $map = Map::factory()->create();
    $origin = placeMapSolarsystem($map, 30024006);
    $target = placeMapSolarsystem($map, 30024007);
    $connection = MapConnection::factory()->create([
        'map_id' => $map->id,
        'from_map_solarsystem_id' => $origin->id,
        'to_map_solarsystem_id' => $target->id,
    ]);

    // A hole connected while still (legacy) carrying an alias: a later edit to an
    // unrelated field must not silently wipe it — only the connect transition does.
    $signature = $origin->signatures()->create([
        'signature_id' => 'ABC-123',
        'alias' => 'a5a',
        'map_connection_id' => $connection->id,
    ]);

    $signature->update(['signature_id' => 'XYZ-999']);

    expect($signature->fresh()->alias)->toBe('a5a');
});
