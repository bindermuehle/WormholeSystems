<?php

declare(strict_types=1);

use App\Models\Map;
use App\Models\MapConnection;
use App\Models\User;

use function Pest\Laravel\actingAs;

it('shares the aliases reserved by unconnected holes across the whole map', function () {
    $map = Map::factory()->create();
    $user = User::factory()->ownsMap($map)->create();
    $first = placeMapSolarsystem($map, 31024001);
    $second = placeMapSolarsystem($map, 31024002);

    $first->signatures()->create(['signature_id' => 'ABC-123', 'alias' => 'a5c']);
    $second->signatures()->create(['signature_id' => 'DEF-456', 'alias' => 'a5d']);
    $second->signatures()->create(['signature_id' => 'GHI-789']);

    $user->update(['preferred_character_id' => $user->characters->first()->id]);

    actingAs($user);

    $this->get(route('maps.show', $map))
        ->assertSuccessful()
        ->assertInertia(fn ($page) => $page
            ->has('reserved_aliases', 2)
            ->where('reserved_aliases.0.map_solarsystem_id', $first->id)
            ->where('reserved_aliases.0.alias', 'a5c')
            ->where('reserved_aliases.1.map_solarsystem_id', $second->id)
            ->where('reserved_aliases.1.alias', 'a5d')
            ->etc()
        );
});

it('leaves out a connected hole, whose alias already lives on its destination system', function () {
    $map = Map::factory()->create();
    $user = User::factory()->ownsMap($map)->create();
    $origin = placeMapSolarsystem($map, 31024003);
    $target = placeMapSolarsystem($map, 31024004);
    $connection = MapConnection::factory()->create([
        'map_id' => $map->id,
        'from_map_solarsystem_id' => $origin->id,
        'to_map_solarsystem_id' => $target->id,
    ]);

    $origin->signatures()->create([
        'signature_id' => 'ABC-123',
        'alias' => 'a5a',
        'map_connection_id' => $connection->id,
    ]);

    $user->update(['preferred_character_id' => $user->characters->first()->id]);

    actingAs($user);

    $this->get(route('maps.show', $map))
        ->assertSuccessful()
        ->assertInertia(fn ($page) => $page->has('reserved_aliases', 0)->etc());
});

it('does not leak reservations from another map', function () {
    $map = Map::factory()->create();
    $user = User::factory()->ownsMap($map)->create();
    placeMapSolarsystem($map, 31024005);

    $other = Map::factory()->create();
    placeMapSolarsystem($other, 31024006)->signatures()->create(['signature_id' => 'ABC-123', 'alias' => 'a5a']);

    $user->update(['preferred_character_id' => $user->characters->first()->id]);

    actingAs($user);

    $this->get(route('maps.show', $map))
        ->assertSuccessful()
        ->assertInertia(fn ($page) => $page->has('reserved_aliases', 0)->etc());
});
