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
