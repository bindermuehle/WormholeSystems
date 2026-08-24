import type { TStringedSolarsystemClass } from '@/types/models';

/**
 * The per-map alias suggestion convention. Kept in sync with the `AliasScheme`
 * enum on the backend.
 */
export type TAliasScheme = 'numeric' | 'alphabetical' | 'corp';

/**
 * The kind of system an alphabetical suggestion is being generated for. K-space
 * targets get a reserved letter (H/L/N/P) instead of continuing the plain
 * letter sequence.
 */
export type TAliasTargetKind = 'wormhole' | 'h' | 'l' | 'n' | 'p';

type TGuessNextAliasOptions = {
    scheme?: TAliasScheme;
    targetKind?: TAliasTargetKind;
    ignoredAlias?: string;
};

/**
 * Whether `alias` is the map's ignored alias (e.g. "HOME"), case-insensitive and
 * trimmed. An empty `ignoredAlias` disables the feature, so nothing ever matches.
 */
export function isIgnoredAlias(alias: string | null | undefined, ignoredAlias: string | null | undefined): boolean {
    const trimmedIgnored = (ignoredAlias ?? '').trim();
    if (!trimmedIgnored) return false;
    return (alias ?? '').trim().toLowerCase() === trimmedIgnored.toLowerCase();
}

const KSPACE_ALIAS_TARGET_KINDS: readonly string[] = ['h', 'l', 'n', 'p'];

/** The reserved k-space letter for a target's class, or undefined for wormholes/unrecognized classes. */
export function aliasTargetKind(isTargetWormhole: boolean, targetClass: string | null | undefined): TAliasTargetKind | undefined {
    if (isTargetWormhole) return 'wormhole';
    return targetClass && KSPACE_ALIAS_TARGET_KINDS.includes(targetClass) ? (targetClass as TAliasTargetKind) : undefined;
}

/**
 * The alphabetical scheme's 22-letter alphabet: A-Z with H, L, N and P removed,
 * since those are reserved for k-space exits (high/low/null-sec, Pochven).
 */
const WORMHOLE_LETTERS = 'ABCDEFGIJKMOQRSTUVWXYZ';

/**
 * The next letter after `index`, capped at the last letter once the 22-letter
 * alphabet is exhausted. This mirrors numeric's unhandled ">9 children"
 * ambiguity rather than throwing: a map with more than 22 direct wormhole
 * children of one system will see duplicate suggestions past that point.
 */
function letterAtIndex(index: number): string {
    return WORMHOLE_LETTERS[Math.min(index, WORMHOLE_LETTERS.length - 1)];
}

/** The smallest positive integer not present in `used`. */
function lowestFreeIndex(used: Set<number>): number {
    let index = 1;
    while (used.has(index)) {
        index++;
    }
    return index;
}

/**
 * The lowest unused letter extending `prefix`, skipping reserved k-space
 * letters, so a letter freed by a deleted system is reused before the
 * sequence grows. Only aliases that are exactly one letter longer than
 * `prefix` count as direct children, so k-space exits (`AH1`) and deeper
 * descendants (`ABA`) are naturally excluded.
 * Expects `prefix` and `aliases` already upper-cased by `guessNextAlias`.
 */
function nextWormholeLetter(prefix: string, aliases: string[]): string {
    const used = new Set<number>();
    for (const alias of aliases) {
        if (alias.length !== prefix.length + 1 || !alias.startsWith(prefix)) continue;

        const index = WORMHOLE_LETTERS.indexOf(alias.slice(prefix.length));
        if (index !== -1) {
            used.add(index);
        }
    }

    let index = 0;
    while (used.has(index)) {
        index++;
    }
    return letterAtIndex(index);
}

/**
 * The lowest unused per-type index for a k-space exit, e.g. `AH1`, `AH2` for
 * high-sec children of `A`. Each reserved letter keeps its own counter, gaps
 * are filled first, and the anchored digit match excludes anything branching
 * further off a k-space node (`AH1A` is not counted as an `AH` index).
 * Expects `prefix` and `aliases` already upper-cased by `guessNextAlias`.
 */
function nextKspaceIndex(prefix: string, letter: string, aliases: string[]): number {
    const marker = `${prefix}${letter}`;

    const used = new Set<number>();
    for (const alias of aliases) {
        if (!alias.startsWith(marker)) continue;

        const tail = alias.slice(marker.length);
        if (/^\d+$/.test(tail)) {
            used.add(Number.parseInt(tail, 10));
        }
    }

    return lowestFreeIndex(used);
}

/**
 * The alphabetical counterpart to the numeric digit logic: wormhole children
 * extend the prefix with a single non-reserved letter, k-space exits extend it
 * with a reserved letter and a per-type index.
 */
function guessNextAlphabeticalAlias(prefix: string, aliases: string[], targetKind: TAliasTargetKind | undefined): string {
    if (targetKind && targetKind !== 'wormhole') {
        const letter = targetKind.toUpperCase();
        return `${prefix}${letter}${nextKspaceIndex(prefix, letter, aliases)}`;
    }

    return `${prefix}${nextWormholeLetter(prefix, aliases)}`;
}

/**
 * Work out the next concatenated child alias for a system, given its parent's
 * alias and every alias already in use on the map.
 *
 * Numeric (default): top-level systems (no parent alias) are numbered 1, 2,
 * 3…; children of "1" become 11, 12, 13…; children of "12" become 121, 122…
 * The next index is the lowest unused direct-child index, so an alias freed
 * by a deleted system is filled before the sequence grows (1, 3, 4 suggests
 * 2). Direct children are aliases that extend the parent's prefix with digits
 * and are not themselves nested under a longer prefix, so "121" is never
 * mistaken for a direct child of "1".
 *
 * Alphabetical (`opts.scheme`): children use letters instead of digits (see
 * `guessNextAlphabeticalAlias`).
 *
 * Suggestions are always upper-cased, and existing aliases are matched
 * case-insensitively, so a hand-typed lowercase alias ("ab", "ah1") still
 * counts as a taken child and the chain stays visually consistent.
 */
export function guessNextAlias(parentAlias: string | null | undefined, aliases: string[], opts?: TGuessNextAliasOptions): string {
    let prefix = (parentAlias ?? '').trim().toUpperCase();

    if (isIgnoredAlias(prefix, opts?.ignoredAlias)) {
        prefix = '';
    }

    const knownAliases = aliases.map((alias) => alias.trim().toUpperCase());

    if (opts?.scheme === 'alphabetical') {
        return guessNextAlphabeticalAlias(prefix, knownAliases, opts.targetKind);
    }

    const numericChildren = knownAliases.filter((alias) => {
        if (alias.length <= prefix.length) return false;
        if (!alias.startsWith(prefix)) return false;
        return /^\d+$/.test(alias.slice(prefix.length));
    });

    const directChildren = numericChildren.filter(
        (alias) => !numericChildren.some((other) => other !== alias && other.length < alias.length && alias.startsWith(other)),
    );

    const used = new Set<number>();
    for (const alias of directChildren) {
        const index = Number.parseInt(alias.slice(prefix.length), 10);
        if (!Number.isNaN(index)) {
            used.add(index);
        }
    }

    return `${prefix}${lowestFreeIndex(used)}`;
}

/**
 * Suggest an alias for a system reached by a tracked jump, or null when it
 * should not be aliased. The target is aliased when it is itself a wormhole, or
 * when the origin we jumped from is part of the chain — either a wormhole or an
 * already-aliased system. This lets a k-space exit of an aliased wormhole
 * continue the chain (e.g. jumping from "2" into k-space suggests "21").
 */
export function suggestAlias(params: {
    parentAlias: string | null | undefined;
    targetIsWormhole: boolean;
    originIsWormhole: boolean;
    aliases: string[];
    scheme?: TAliasScheme;
    targetKind?: TAliasTargetKind;
    ignoredAlias?: string;
}): string | null {
    const originIsAliased = Boolean(params.parentAlias && params.parentAlias.trim());

    if (!params.targetIsWormhole && !params.originIsWormhole && !originIsAliased) {
        return null;
    }

    return guessNextAlias(params.parentAlias, params.aliases, {
        scheme: params.scheme,
        targetKind: params.targetKind,
        ignoredAlias: params.ignoredAlias,
    });
}

/*
 * -----------------------------------------------------------------------------
 * Corp chain-naming scheme: <branch><type><slot>
 * -----------------------------------------------------------------------------
 * A system's alias is three characters:
 *   - branch: a letter (a, b, c…) assigned per direct link off the home system,
 *     propagating to every system down that branch at any depth. New links take
 *     the lowest currently-free letter; letters are reused when a branch dies.
 *   - type:   the destination class — "1".."6" for C1–C6, capital "H"/"L"/"N"/"P"
 *     for high/low/null/pochven space.
 *   - slot:   the lowest free letter making {branch}{type} unique, skipping "s".
 *     Home's static is the exception and always uses slot "s" (e.g. a5s).
 * The "+" homeward prefix is a display concern (see the signature table), not
 * produced here — this generates a destination system's own name.
 * -----------------------------------------------------------------------------
 */

const BRANCH_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

/**
 * Map a solarsystem class to the scheme's "type" character: C1–C6 → "1".."6",
 * high/low/null/pochven → "H"/"L"/"N"/"P". Returns null for classes the scheme
 * does not name (special wormhole classes, unknown).
 */
export function classToTypeChar(cls: TStringedSolarsystemClass): string | null {
    if (/^[1-6]$/.test(cls)) {
        return cls;
    }

    switch (cls) {
        case 'h':
            return 'H';
        case 'l':
            return 'L';
        case 'n':
            return 'N';
        case 'p':
            return 'P';
        default:
            return null;
    }
}

/**
 * The lowest unused branch letter (a, b, c…), given the letters already in use
 * by the home system's live direct links.
 */
export function nextBranchLetter(usedLetters: readonly string[]): string {
    const used = new Set(usedLetters.map((letter) => letter.toLowerCase()));

    return BRANCH_LETTERS.find((letter) => !used.has(letter)) ?? BRANCH_LETTERS[BRANCH_LETTERS.length - 1];
}

/**
 * The lowest unused slot letter for a given branch + type, scanning every alias
 * on the map. Skips "s" (reserved for the home static). Returns null if the 25
 * non-static letters are exhausted.
 */
export function nextSlotLetter(branch: string, type: string, aliases: readonly string[]): string | null {
    const prefix = `${branch}${type}`;
    const used = new Set<string>();

    for (const alias of aliases) {
        const name = alias.trim().replace(/^\+/, '');
        if (name.length > prefix.length && name.startsWith(prefix)) {
            used.add(name.charAt(prefix.length));
        }
    }

    return BRANCH_LETTERS.find((letter) => letter !== 's' && !used.has(letter)) ?? null;
}

export type AliasContext = {
    /** Alias of the system the hole is scanned in / jumped from. */
    originAlias: string | null | undefined;
    /** Whether that origin system is the map's home system. */
    originIsHome: boolean;
    /** Class of the destination system being named. */
    targetClass: TStringedSolarsystemClass;
    /** Whether this connection is the home system's static (only honoured off home). */
    isHomeStatic: boolean;
    /** Branch letters already used by the home system's live direct links. */
    homeBranchLetters: readonly string[];
    /**
     * How many statics home has. Their branch letters are reserved — the "a"
     * chain always belongs to the static — so a non-static link off home never
     * takes them, even before the static has been scanned.
     */
    homeStaticCount: number;
    /** Every alias currently on the map, including reserved pre-jump aliases. */
    aliases: readonly string[];
};

/**
 * Generate the corp-scheme alias `<branch><type><slot>` for a newly scanned or
 * jumped destination system. Returns null when the class isn't named by the
 * scheme, or a branch letter cannot be determined (a non-home origin with no
 * alias to inherit from).
 */
export function generateAlias(context: AliasContext): string | null {
    const type = classToTypeChar(context.targetClass);
    if (type === null) {
        return null;
    }

    let branch: string;
    if (context.originIsHome) {
        if (context.isHomeStatic) {
            // The static claims the lowest free branch letter, so the primary
            // static reads "a…s".
            branch = nextBranchLetter(context.homeBranchLetters);
        } else {
            // Home's static branches are reserved even before the static is
            // scanned, so a non-static link off home starts past them.
            const reserved = BRANCH_LETTERS.slice(0, Math.max(0, context.homeStaticCount));
            branch = nextBranchLetter([...context.homeBranchLetters, ...reserved]);
        }
    } else {
        const inherited = (context.originAlias ?? '').trim().replace(/^\+/, '').charAt(0);
        if (!inherited) {
            return null;
        }
        branch = inherited;
    }

    if (context.originIsHome && context.isHomeStatic) {
        return `${branch}${type}s`;
    }

    const slot = nextSlotLetter(branch, type, context.aliases);
    if (slot === null) {
        return null;
    }

    return `${branch}${type}${slot}`;
}

type ConnectionEndpoints = {
    from_map_solarsystem_id: number;
    to_map_solarsystem_id: number;
};

/**
 * The branch letters currently in use by the home system's direct links — the
 * first character of each directly-connected system's alias. Feeds
 * `nextBranchLetter` when naming a brand-new link off home. Connections are
 * treated as undirected. `homeMapSolarsystemId` is a map_solarsystem id (not a
 * raw solarsystem id), matching the connection endpoint ids.
 */
export function usedHomeBranchLetters(
    homeMapSolarsystemId: number | null | undefined,
    connections: readonly ConnectionEndpoints[],
    aliasByMapSolarsystemId: ReadonlyMap<number, string | null | undefined>,
): string[] {
    if (homeMapSolarsystemId == null) {
        return [];
    }

    const letters: string[] = [];
    for (const connection of connections) {
        let neighbourId: number | null = null;
        if (connection.from_map_solarsystem_id === homeMapSolarsystemId) {
            neighbourId = connection.to_map_solarsystem_id;
        } else if (connection.to_map_solarsystem_id === homeMapSolarsystemId) {
            neighbourId = connection.from_map_solarsystem_id;
        }

        if (neighbourId === null) {
            continue;
        }

        const letter = aliasByMapSolarsystemId.get(neighbourId)?.trim().replace(/^\+/, '').charAt(0);
        if (letter) {
            letters.push(letter);
        }
    }

    return letters;
}

/**
 * The neighbour of `mapSolarsystemId` that lies one hop closer to home — its
 * parent in the breadth-first tree rooted at home. The hole to this neighbour is
 * the way back home, which the signature table marks with a "+". Returns null
 * when there is no home, the system is home itself, or it is unreachable.
 * Connections are undirected; ids are map_solarsystem ids.
 */
export function parentTowardHome(
    homeMapSolarsystemId: number | null | undefined,
    mapSolarsystemId: number | null | undefined,
    connections: readonly ConnectionEndpoints[],
): number | null {
    if (homeMapSolarsystemId == null || mapSolarsystemId == null || homeMapSolarsystemId === mapSolarsystemId) {
        return null;
    }

    const neighbours = new Map<number, number[]>();
    const link = (a: number, b: number): void => {
        const list = neighbours.get(a) ?? [];
        list.push(b);
        neighbours.set(a, list);
    };
    for (const connection of connections) {
        link(connection.from_map_solarsystem_id, connection.to_map_solarsystem_id);
        link(connection.to_map_solarsystem_id, connection.from_map_solarsystem_id);
    }

    const parent = new Map<number, number>();
    const queue = [homeMapSolarsystemId];
    const visited = new Set<number>([homeMapSolarsystemId]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === mapSolarsystemId) {
            return parent.get(current) ?? null;
        }
        for (const neighbour of neighbours.get(current) ?? []) {
            if (visited.has(neighbour)) {
                continue;
            }
            visited.add(neighbour);
            parent.set(neighbour, current);
            queue.push(neighbour);
        }
    }

    return null;
}

/**
 * The set of map_solarsystem ids reachable from home over the connection graph
 * (home included). Used to keep the alias pool honest: a system that has been
 * rolled off the chain is no longer reachable, so its alias should stop counting
 * and free up for reuse — matching "letters are reused when a hole vanishes".
 * Returns null when there is no home, meaning callers should not filter.
 */
export function reachableFromHome(homeMapSolarsystemId: number | null | undefined, connections: readonly ConnectionEndpoints[]): Set<number> | null {
    if (homeMapSolarsystemId == null) {
        return null;
    }

    const neighbours = new Map<number, number[]>();
    const link = (a: number, b: number): void => {
        const list = neighbours.get(a) ?? [];
        list.push(b);
        neighbours.set(a, list);
    };
    for (const connection of connections) {
        link(connection.from_map_solarsystem_id, connection.to_map_solarsystem_id);
        link(connection.to_map_solarsystem_id, connection.from_map_solarsystem_id);
    }

    const reachable = new Set<number>([homeMapSolarsystemId]);
    const queue = [homeMapSolarsystemId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbour of neighbours.get(current) ?? []) {
            if (reachable.has(neighbour)) {
                continue;
            }
            reachable.add(neighbour);
            queue.push(neighbour);
        }
    }

    return reachable;
}

/**
 * Assemble the pool of aliases the suggester must treat as already taken, for a
 * given selected system. Three sources, de-duplicated:
 *
 *  - System aliases, but only for systems still reachable from home. A rolled-off
 *    (orphaned) system keeps its alias until cleaned up; filtering by reachability
 *    frees its slot for reuse.
 *  - Reserved aliases of *unconnected* holes across the whole map (the
 *    `reserved_aliases` prop), reachability-filtered the same way. An unconnected
 *    hole's reserved alias is its sole record, so without this a hole named in
 *    one system leaves its slot free everywhere else and the next scan elsewhere
 *    hands out the same name again.
 *  - The selected system's own unconnected holes, read locally: the freshest copy
 *    right after an edit, before the map-wide prop has been refetched.
 *
 * A *connected* hole is deliberately excluded from both signature sources: its
 * real alias already lives on its destination system (counted above, and
 * reachability-filtered), while its signature.alias is a stale leftover from when
 * it was auto-named pre-jump. Counting the connected hole double-books the slot —
 * worst for the homeward hole, whose leftover (e.g. "a5a") points back at home
 * and silently burns slot "a", bumping every later hole of that type to "a5b".
 */
export function buildSuggestionAliasPool(input: {
    homeMapSolarsystemId: number | null | undefined;
    connections: readonly ConnectionEndpoints[];
    systems: ReadonlyArray<{ id: number; alias: string | null | undefined }>;
    selectedSignatures: ReadonlyArray<{ alias: string | null | undefined; map_connection_id: number | null | undefined }>;
    reservedAliases?: ReadonlyArray<{ map_solarsystem_id: number; alias: string }>;
}): string[] {
    const reachable = reachableFromHome(input.homeMapSolarsystemId, input.connections);
    const isReachable = (mapSolarsystemId: number): boolean => reachable === null || reachable.has(mapSolarsystemId);

    const systemAliases = input.systems.filter((system) => isReachable(system.id)).map((system) => system.alias);

    // Map-wide reservations, reachability-filtered like system aliases: a hole
    // named in a system that has since rolled out of the chain gives its slot
    // back. The selected system's own signatures are read locally as well —
    // they are the freshest copy right after an edit, and the union only ever
    // marks slots taken, so overlap is harmless.
    const mapReservedAliases = (input.reservedAliases ?? [])
        .filter((reserved) => isReachable(reserved.map_solarsystem_id))
        .map((reserved) => reserved.alias);

    const selectedReservedAliases = input.selectedSignatures
        .filter((signature) => signature.map_connection_id == null)
        .map((signature) => signature.alias);

    return [...new Set([...systemAliases, ...mapReservedAliases, ...selectedReservedAliases].filter((alias): alias is string => Boolean(alias)))];
}

/**
 * Map-level inputs the signature table needs to suggest chain aliases, computed
 * once for the whole map and shared by every signature row. Per-signature inputs
 * (origin, destination class, wormhole code) are derived in the row itself.
 */
export type AliasSuggestionContext = {
    /** The map's home system (raw solarsystem id), or null when unset. */
    homeSolarsystemId: number | null;
    /** Wormhole codes of home's statics — used to detect the home static hole. */
    homeStaticCodes: string[];
    /** Branch letters already claimed by home's live direct links. */
    homeBranchLetters: string[];
    /** Every alias in play on the map, including reserved pre-jump ones. */
    aliases: string[];
};

/**
 * Suggest the chain alias for the destination of a wormhole signature scanned in
 * a given system. Thin adapter over `generateAlias` that derives `originIsHome`
 * and detects the home static (the origin is home and the signature's wormhole
 * code is one of home's static codes). Returns null when the destination class
 * is unknown/unnamed.
 */
export function suggestSignatureAlias(input: {
    originSolarsystemId: number | null | undefined;
    originAlias: string | null | undefined;
    homeSolarsystemId: number | null | undefined;
    targetClass: TStringedSolarsystemClass | null | undefined;
    wormholeCode: string | null | undefined;
    homeStaticCodes: readonly string[];
    homeBranchLetters: readonly string[];
    aliases: readonly string[];
}): string | null {
    if (!input.targetClass) {
        return null;
    }

    const originIsHome = input.originSolarsystemId != null && input.originSolarsystemId === input.homeSolarsystemId;
    const isHomeStatic = originIsHome && input.wormholeCode != null && input.homeStaticCodes.includes(input.wormholeCode);

    return generateAlias({
        originAlias: input.originAlias,
        originIsHome,
        targetClass: input.targetClass,
        isHomeStatic,
        homeBranchLetters: input.homeBranchLetters,
        homeStaticCount: input.homeStaticCodes.length,
        aliases: input.aliases,
    });
}

/**
 * Suggest aliases for several wormhole signatures scanned in the same system, in
 * a single accumulating pass: each suggestion is folded into the alias pool (and,
 * off home, the branch-letter set) before the next is generated, so siblings get
 * distinct names instead of all proposing the first free branch/slot. Returns a
 * map keyed by the caller's signature id; a signature the scheme cannot name maps
 * to null.
 *
 * Home statics are named first so the primary static reads "a…s" — the corp's
 * convention — rather than losing the "a" branch to whichever hole sorts first.
 */
export function suggestSignatureAliases(input: {
    originSolarsystemId: number | null | undefined;
    originAlias: string | null | undefined;
    homeSolarsystemId: number | null | undefined;
    homeStaticCodes: readonly string[];
    homeBranchLetters: readonly string[];
    aliases: readonly string[];
    signatures: ReadonlyArray<{
        id: number;
        targetClass: TStringedSolarsystemClass | null | undefined;
        wormholeCode: string | null | undefined;
    }>;
}): Map<number, string | null> {
    const originIsHome = input.originSolarsystemId != null && input.originSolarsystemId === input.homeSolarsystemId;
    const isStatic = (wormholeCode: string | null | undefined): boolean =>
        originIsHome && wormholeCode != null && input.homeStaticCodes.includes(wormholeCode);

    const ordered = input.signatures
        .map((signature, index) => ({ signature, index }))
        .sort((a, b) => {
            const staticRank = Number(isStatic(b.signature.wormholeCode)) - Number(isStatic(a.signature.wormholeCode));
            return staticRank !== 0 ? staticRank : a.index - b.index;
        });

    const pool = [...input.aliases];
    const branchLetters = [...input.homeBranchLetters];
    const result = new Map<number, string | null>();

    for (const { signature } of ordered) {
        const suggestion = suggestSignatureAlias({
            originSolarsystemId: input.originSolarsystemId,
            originAlias: input.originAlias,
            homeSolarsystemId: input.homeSolarsystemId,
            targetClass: signature.targetClass,
            wormholeCode: signature.wormholeCode,
            homeStaticCodes: input.homeStaticCodes,
            homeBranchLetters: branchLetters,
            aliases: pool,
        });

        result.set(signature.id, suggestion);

        if (suggestion) {
            pool.push(suggestion);
            if (originIsHome) {
                branchLetters.push(suggestion.charAt(0));
            }
        }
    }

    return result;
}
