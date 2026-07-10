import type { TStringedSolarsystemClass } from '@/types/models';

/**
 * Work out the next concatenated child alias for a system, given its parent's
 * alias and every alias already in use on the map.
 *
 * Top-level systems (no parent alias) are numbered 1, 2, 3…; children of "1"
 * become 11, 12, 13…; children of "12" become 121, 122… The next index is the
 * highest existing direct-child index + 1. Direct children are aliases that
 * extend the parent's prefix with digits and are not themselves nested under a
 * longer prefix, so "121" is never mistaken for a direct child of "1".
 */
export function guessNextAlias(parentAlias: string | null | undefined, aliases: string[]): string {
    const prefix = (parentAlias ?? '').trim();

    const numericChildren = aliases.filter((alias) => {
        if (alias.length <= prefix.length) return false;
        if (!alias.startsWith(prefix)) return false;
        return /^\d+$/.test(alias.slice(prefix.length));
    });

    const directChildren = numericChildren.filter(
        (alias) => !numericChildren.some((other) => other !== alias && other.length < alias.length && alias.startsWith(other)),
    );

    const highest = directChildren.reduce((max, alias) => {
        const index = Number.parseInt(alias.slice(prefix.length), 10);
        return Number.isNaN(index) ? max : Math.max(max, index);
    }, 0);

    return `${prefix}${highest + 1}`;
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
}): string | null {
    const originIsAliased = Boolean(params.parentAlias && params.parentAlias.trim());

    if (!params.targetIsWormhole && !params.originIsWormhole && !originIsAliased) {
        return null;
    }

    return guessNextAlias(params.parentAlias, params.aliases);
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
        branch = nextBranchLetter(context.homeBranchLetters);
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
