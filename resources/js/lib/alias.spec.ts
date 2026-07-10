import { describe, expect, it } from 'vitest';

import {
    classToTypeChar,
    generateAlias,
    nextBranchLetter,
    nextSlotLetter,
    parentTowardHome,
    suggestSignatureAlias,
    usedHomeBranchLetters,
} from './alias';

describe('classToTypeChar', () => {
    it('maps wormhole classes C1–C6 to their digit', () => {
        for (const cls of ['1', '2', '3', '4', '5', '6'] as const) {
            expect(classToTypeChar(cls)).toBe(cls);
        }
    });

    it('maps k-space classes to capital letters', () => {
        expect(classToTypeChar('h')).toBe('H');
        expect(classToTypeChar('l')).toBe('L');
        expect(classToTypeChar('n')).toBe('N');
        expect(classToTypeChar('p')).toBe('P');
    });

    it('returns null for classes the scheme does not name', () => {
        expect(classToTypeChar('unknown')).toBeNull();
        expect(classToTypeChar('13')).toBeNull();
    });
});

describe('nextBranchLetter', () => {
    it('starts at "a"', () => {
        expect(nextBranchLetter([])).toBe('a');
    });

    it('picks the next free letter', () => {
        expect(nextBranchLetter(['a'])).toBe('b');
        expect(nextBranchLetter(['a', 'b'])).toBe('c');
    });

    it('reuses a letter freed when a branch died', () => {
        expect(nextBranchLetter(['a', 'c'])).toBe('b');
    });
});

describe('nextSlotLetter', () => {
    it('starts at "a"', () => {
        expect(nextSlotLetter('a', '5', [])).toBe('a');
    });

    it('skips "s" — the static slot — so the first non-static hole is "a"', () => {
        expect(nextSlotLetter('a', '5', ['a5s'])).toBe('a');
    });

    it('advances past used slots', () => {
        expect(nextSlotLetter('a', '5', ['a5s', 'a5a'])).toBe('b');
    });

    it('only considers the same branch + type', () => {
        expect(nextSlotLetter('a', '5', ['b5a', 'a6a', 'aHa'])).toBe('a');
    });

    it('ignores a leading "+" homeward marker on stored names', () => {
        expect(nextSlotLetter('a', '5', ['+a5a'])).toBe('b');
    });
});

describe('generateAlias', () => {
    const base = {
        originIsHome: false,
        isHomeStatic: false,
        homeBranchLetters: [] as string[],
        aliases: [] as string[],
    };

    it('names the home static as "a5s"', () => {
        expect(generateAlias({ ...base, originIsHome: true, isHomeStatic: true, targetClass: '5', originAlias: null })).toBe('a5s');
    });

    it('names the next C5 down branch "a" as "a5a"', () => {
        expect(generateAlias({ ...base, targetClass: '5', originAlias: 'a5s', aliases: ['a5s'] })).toBe('a5a');
    });

    it('advances the slot for further C5s down the same branch', () => {
        expect(generateAlias({ ...base, targetClass: '5', originAlias: 'a5s', aliases: ['a5s', 'a5a'] })).toBe('a5b');
    });

    it('assigns a fresh branch letter for a new link off home', () => {
        expect(generateAlias({ ...base, originIsHome: true, targetClass: '3', originAlias: null, homeBranchLetters: ['a'], aliases: ['a5s'] })).toBe(
            'b3a',
        );
    });

    it('names k-space with a capital type char', () => {
        expect(generateAlias({ ...base, targetClass: 'h', originAlias: 'a5s', aliases: ['a5s'] })).toBe('aHa');
        expect(generateAlias({ ...base, targetClass: 'n', originAlias: 'a5s', aliases: ['a5s'] })).toBe('aNa');
    });

    it('inherits the branch letter from the origin at any depth', () => {
        expect(generateAlias({ ...base, targetClass: '4', originAlias: 'b3a', aliases: ['a5s', 'b3a'] })).toBe('b4a');
    });

    it('reuses a freed branch letter for a new home link', () => {
        expect(
            generateAlias({
                ...base,
                originIsHome: true,
                targetClass: '2',
                originAlias: null,
                homeBranchLetters: ['a', 'c'],
                aliases: ['a5s', 'c1a'],
            }),
        ).toBe('b2a');
    });

    it('returns null for classes the scheme does not name', () => {
        expect(generateAlias({ ...base, targetClass: 'unknown', originAlias: 'a5s', aliases: ['a5s'] })).toBeNull();
    });

    it('returns null when a non-home origin has no alias to inherit', () => {
        expect(generateAlias({ ...base, targetClass: '5', originAlias: null })).toBeNull();
    });

    it('does not apply the static slot to a non-home static', () => {
        expect(generateAlias({ ...base, isHomeStatic: true, targetClass: '5', originAlias: 'a5s', aliases: ['a5s'] })).toBe('a5a');
    });
});

describe('usedHomeBranchLetters', () => {
    it('returns the first letter of each direct home link alias', () => {
        const aliases = new Map<number, string | null>([
            [2, 'a5s'],
            [3, 'b3a'],
            [4, 'c1a'],
        ]);
        const connections = [
            { from_map_solarsystem_id: 1, to_map_solarsystem_id: 2 },
            { from_map_solarsystem_id: 3, to_map_solarsystem_id: 1 },
        ];

        expect(usedHomeBranchLetters(1, connections, aliases).sort()).toEqual(['a', 'b']);
    });

    it('ignores connections that do not touch home', () => {
        const aliases = new Map<number, string | null>([[4, 'c1a']]);
        const connections = [{ from_map_solarsystem_id: 3, to_map_solarsystem_id: 4 }];

        expect(usedHomeBranchLetters(1, connections, aliases)).toEqual([]);
    });

    it('returns nothing when there is no home system', () => {
        expect(usedHomeBranchLetters(null, [], new Map())).toEqual([]);
    });

    it('strips a leading "+" from a neighbour alias', () => {
        const aliases = new Map<number, string | null>([[2, '+a5s']]);
        const connections = [{ from_map_solarsystem_id: 1, to_map_solarsystem_id: 2 }];

        expect(usedHomeBranchLetters(1, connections, aliases)).toEqual(['a']);
    });
});

describe('parentTowardHome', () => {
    // home(1) — a(2) — b(3) — c(4), with a stray branch home(1) — d(5)
    const connections = [
        { from_map_solarsystem_id: 1, to_map_solarsystem_id: 2 },
        { from_map_solarsystem_id: 2, to_map_solarsystem_id: 3 },
        { from_map_solarsystem_id: 3, to_map_solarsystem_id: 4 },
        { from_map_solarsystem_id: 1, to_map_solarsystem_id: 5 },
    ];

    it('returns the neighbour one hop closer to home', () => {
        expect(parentTowardHome(1, 4, connections)).toBe(3);
        expect(parentTowardHome(1, 3, connections)).toBe(2);
        expect(parentTowardHome(1, 2, connections)).toBe(1);
        expect(parentTowardHome(1, 5, connections)).toBe(1);
    });

    it('treats connections as undirected regardless of endpoint order', () => {
        expect(
            parentTowardHome(1, 3, [
                { from_map_solarsystem_id: 3, to_map_solarsystem_id: 2 },
                { from_map_solarsystem_id: 2, to_map_solarsystem_id: 1 },
            ]),
        ).toBe(2);
    });

    it('returns null for home itself, no home, or an unreachable system', () => {
        expect(parentTowardHome(1, 1, connections)).toBeNull();
        expect(parentTowardHome(null, 4, connections)).toBeNull();
        expect(parentTowardHome(1, 99, connections)).toBeNull();
    });
});

describe('suggestSignatureAlias', () => {
    const base = {
        originSolarsystemId: 31000005,
        homeSolarsystemId: 31000005,
        wormholeCode: null as string | null,
        homeStaticCodes: [] as string[],
        homeBranchLetters: [] as string[],
        aliases: [] as string[],
    };

    it('names the home static when the wormhole code matches a home static', () => {
        expect(suggestSignatureAlias({ ...base, originAlias: null, targetClass: '5', wormholeCode: 'N062', homeStaticCodes: ['N062'] })).toBe('a5s');
    });

    it('does not use the static slot for a non-static hole off home', () => {
        expect(
            suggestSignatureAlias({
                ...base,
                originAlias: null,
                targetClass: '3',
                wormholeCode: 'K162',
                homeStaticCodes: ['N062'],
                homeBranchLetters: ['a'],
                aliases: ['a5s'],
            }),
        ).toBe('b3a');
    });

    it('inherits the branch when the origin is not home', () => {
        expect(
            suggestSignatureAlias({
                ...base,
                originSolarsystemId: 31000010,
                originAlias: 'b3a',
                targetClass: '4',
                wormholeCode: 'K162',
                aliases: ['a5s', 'b3a'],
            }),
        ).toBe('b4a');
    });

    it('returns null when the destination class is unknown', () => {
        expect(suggestSignatureAlias({ ...base, originAlias: 'a5s', targetClass: null, wormholeCode: 'K162' })).toBeNull();
    });
});
