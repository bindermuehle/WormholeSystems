/**
 * Live tracing for the corp alias suggester (`<branch><type><slot>`).
 *
 * Always installed on the map page — it costs nothing until called. When a
 * suggested alias looks wrong (a slot skipped, a slot reused, the wrong branch),
 * open the browser console with the system selected and run:
 *
 *   aliasDebug()
 *
 * It prints ONE flat, copy-pasteable `[ALIAS-DEBUG]` JSON line with the exact
 * pool, systems, connections, signatures and suggestions the suggester saw, and
 * returns the same object for poking at. Flat on purpose: Chrome often refuses
 * to expand a logged object once it has been garbage-collected.
 *
 * The fields that usually explain a bad suggestion:
 *   - `pool`      — every alias the slot-picker treats as taken. The suggestion
 *                   is the lowest free slot NOT in here, so an alias missing
 *                   from the pool gets handed out a second time.
 *   - `unreachable` — systems dropped from the pool because no connection path
 *                   ties them to home; their aliases are deliberately freed for
 *                   reuse. A rename that "won't stick" is often one of these.
 *   - `signatures` — the selected system's holes. Only *these* reserved aliases
 *                   reach the pool: the map prop carries signature counts, not
 *                   signatures, so holes named in other systems are invisible.
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

export type AliasDebugContext = {
    scheme: string;
    suggestEnabled: boolean;
    selected: DebugSystem | null;
    homeSolarsystemId: number | null;
    homeMapSolarsystemId: number | null;
    homeStaticCodes: readonly string[];
    homeBranchLetters: readonly string[];
    pool: readonly string[];
    systems: readonly DebugSystem[];
    connections: readonly DebugConnection[];
    signatures: readonly DebugSignature[];
    reachable: ReadonlySet<number> | null;
    suggestions: ReadonlyMap<number, string | null>;
};

declare global {
    interface Window {
        aliasDebug?: () => unknown;
    }
}

function snapshot(context: AliasDebugContext) {
    return {
        scheme: context.scheme,
        suggestEnabled: context.suggestEnabled,
        selected: context.selected && {
            id: context.selected.id,
            sys: context.selected.solarsystem_id,
            alias: context.selected.alias ?? null,
        },
        homeSolarsystemId: context.homeSolarsystemId,
        homeMapSolarsystemId: context.homeMapSolarsystemId,
        homeStaticCodes: [...context.homeStaticCodes],
        homeBranchLetters: [...context.homeBranchLetters],
        pool: [...context.pool],
        systems: context.systems.map((system) => ({
            id: system.id,
            sys: system.solarsystem_id,
            alias: system.alias ?? null,
        })),
        // Systems whose alias the pool ignores because nothing connects them to
        // home — the usual reason a name appears to be handed out twice.
        unreachable: context.systems
            .filter((system) => context.reachable !== null && !context.reachable.has(system.id))
            .map((system) => ({ id: system.id, alias: system.alias ?? null })),
        connections: context.connections.map((connection) => [connection.from_map_solarsystem_id, connection.to_map_solarsystem_id]),
        signatures: context.signatures.map((signature) => ({
            id: signature.id,
            sig: signature.signature_id ?? null,
            alias: signature.alias ?? null,
            conn: signature.map_connection_id ?? null,
            wh: signature.wormhole?.name ?? null,
            tc: signature.signature_type?.target_class ?? null,
        })),
        suggestions: [...context.suggestions.entries()],
    };
}

/**
 * Expose `aliasDebug()` in the console for as long as the caller lives. The
 * context is read at call time, so the dump always reflects the current map.
 */
export function installAliasDebug(context: () => AliasDebugContext): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    window.aliasDebug = () => {
        const result = snapshot(context());
        // eslint-disable-next-line no-console
        console.log('[ALIAS-DEBUG] ' + JSON.stringify(result));

        return result;
    };

    return () => {
        delete window.aliasDebug;
    };
}
