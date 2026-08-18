/**
 * Drop-in tracing for the corp alias suggester (`<branch><type><slot>`).
 *
 * NOT wired in by default — it costs nothing while dormant. Reach for it when a
 * suggested alias looks wrong (a slot skipped, a collision, the wrong branch).
 * It prints ONE flat, copy-pasteable `[ALIAS-DEBUG]` JSON line with the exact
 * pool, systems, connections and result the suggester saw — enough to see WHY a
 * slot was chosen without expanding console objects (Chrome often refuses to
 * expand a logged object once it has been garbage-collected).
 *
 * To use: inside `suggested_aliases` in `Signatures.vue`, compute `result` into
 * a const, then before returning it add:
 *
 *   import { dumpAliasSuggestionDebug } from '@/lib/aliasDebug';
 *   dumpAliasSuggestionDebug({
 *       selected,
 *       homeSolarsystemId: alias_context.value.homeSolarsystemId,
 *       homeStaticCodes: alias_context.value.homeStaticCodes,
 *       homeBranchLetters: alias_context.value.homeBranchLetters,
 *       pool: alias_context.value.aliases,
 *       systems: all_map_solarsystems.value,
 *       connections: page.props.map.map_connections,
 *       signatures: signatures.value,
 *       result,
 *   });
 *
 * Then rebuild the frontend, reproduce, and read the `[ALIAS-DEBUG]` line.
 * Remove the call (not this file) once diagnosed.
 *
 * The key fields to inspect:
 *   - `pool`   — every alias the slot-picker treats as taken. A phantom entry
 *                here (e.g. an "a5a" you can't see on the map) is the usual cause.
 *   - `systems`/`signatures` — where that phantom actually lives (an orphaned
 *                system, or a connected hole's stale `alias` — see
 *                `buildSuggestionAliasPool`).
 */

type DebugSystem = { id: number; solarsystem_id: number; alias: string | null | undefined };
type DebugConnection = { from_map_solarsystem_id: number; to_map_solarsystem_id: number };
type DebugSignature = {
    id: number;
    signature_id?: string | null;
    alias?: string | null;
    map_connection_id?: number | null;
    wormhole?: { name?: string | null } | null;
    signature_type?: { target_class?: string | null } | null;
};

export function dumpAliasSuggestionDebug(context: {
    selected: DebugSystem;
    homeSolarsystemId: number | null;
    homeStaticCodes: readonly string[];
    homeBranchLetters: readonly string[];
    pool: readonly string[];
    systems: readonly DebugSystem[];
    connections: readonly DebugConnection[];
    signatures: readonly DebugSignature[];
    result: ReadonlyMap<number, string | null>;
}): void {
    // eslint-disable-next-line no-console
    console.log(
        '[ALIAS-DEBUG] ' +
            JSON.stringify({
                selected: {
                    id: context.selected.id,
                    sys: context.selected.solarsystem_id,
                    alias: context.selected.alias ?? null,
                },
                homeSolarsystemId: context.homeSolarsystemId,
                homeStaticCodes: [...context.homeStaticCodes],
                homeBranchLetters: [...context.homeBranchLetters],
                pool: [...context.pool],
                systems: context.systems.map((system) => ({
                    id: system.id,
                    sys: system.solarsystem_id,
                    alias: system.alias ?? null,
                })),
                connections: context.connections.map((connection) => [connection.from_map_solarsystem_id, connection.to_map_solarsystem_id]),
                signatures: context.signatures.map((signature) => ({
                    id: signature.id,
                    sig: signature.signature_id ?? null,
                    alias: signature.alias ?? null,
                    conn: signature.map_connection_id ?? null,
                    wh: signature.wormhole?.name ?? null,
                    tc: signature.signature_type?.target_class ?? null,
                })),
                result: [...context.result.entries()],
            }),
    );
}
