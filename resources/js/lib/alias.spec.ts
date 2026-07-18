import { describe, expect, it } from 'vitest';

import {
    classToTypeChar,
    generateAlias,
    nextBranchLetter,
    nextSlotLetter,
    parentTowardHome,
    reachableFromHome,
    suggestSignatureAlias,
    suggestSignatureAliases,
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
        homeStaticCount: 1,
        aliases: [] as string[],
    };

    it('reserves the "a" branch for the static, so the first non-static home link is "b"', () => {
        expect(generateAlias({ ...base, originIsHome: true, targetClass: '4', originAlias: null })).toBe('b4a');
    });

    it('does not reserve a branch when home has no statics', () => {
        expect(generateAlias({ ...base, originIsHome: true, homeStaticCount: 0, targetClass: '4', originAlias: null })).toBe('a4a');
    });

    it('reserves two branches when home has two statics', () => {
        expect(generateAlias({ ...base, originIsHome: true, homeStaticCount: 2, targetClass: '4', originAlias: null })).toBe('c4a');
    });

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

describe('reachableFromHome', () => {
    // home(1) — a(2) — b(3); c(4) is orphaned (rolled off, no connection)
    const connections = [
        { from_map_solarsystem_id: 1, to_map_solarsystem_id: 2 },
        { from_map_solarsystem_id: 2, to_map_solarsystem_id: 3 },
    ];

    it('includes home and everything connected to it', () => {
        const reachable = reachableFromHome(1, connections)!;
        expect([...reachable].sort()).toEqual([1, 2, 3]);
    });

    it('excludes an orphaned (disconnected) system', () => {
        const reachable = reachableFromHome(1, connections)!;
        expect(reachable.has(4)).toBe(false);
    });

    it('returns null when there is no home (caller should not filter)', () => {
        expect(reachableFromHome(null, connections)).toBeNull();
    });
});

describe('first hole of a type in a branch (regression for aLb bug)', () => {
    const base = {
        originSolarsystemId: 100,
        originAlias: 'a5s',
        homeSolarsystemId: 1,
        homeStaticCodes: ['N062'],
        homeBranchLetters: ['a'],
    };

    it('names the first lowsec in the A chain aLa, not aLb', () => {
        const result = suggestSignatureAliases({
            ...base,
            aliases: ['a5s', 'a5a', 'a2a', 'a2b', 'c5a', 'bLa', 'aNa'],
            signatures: [{ id: 1, targetClass: 'l', wormholeCode: 'K162' }],
        });
        expect(result.get(1)).toBe('aLa');
    });

    it('only inflates to aLb once a real aLa is in the pool', () => {
        const result = suggestSignatureAliases({
            ...base,
            aliases: ['a5s', 'aLa'],
            signatures: [{ id: 1, targetClass: 'l', wormholeCode: 'K162' }],
        });
        expect(result.get(1)).toBe('aLb');
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

describe('suggestSignatureAliases', () => {
    const home = {
        originSolarsystemId: 31000005,
        originAlias: null as string | null,
        homeSolarsystemId: 31000005,
        homeStaticCodes: ['N062'] as string[],
        homeBranchLetters: [] as string[],
        aliases: [] as string[],
    };

    it('gives two direct home links distinct branch letters', () => {
        const result = suggestSignatureAliases({
            ...home,
            signatures: [
                { id: 1, targetClass: '5', wormholeCode: 'N062' }, // the C5 home static
                { id: 2, targetClass: '4', wormholeCode: 'K162' }, // a second link off home
            ],
        });

        expect(result.get(1)).toBe('a5s');
        expect(result.get(2)).toBe('b4a');
    });

    it('names the home static "a…s" regardless of scan order', () => {
        const result = suggestSignatureAliases({
            ...home,
            signatures: [
                { id: 2, targetClass: '4', wormholeCode: 'K162' }, // non-static listed first
                { id: 1, targetClass: '5', wormholeCode: 'N062' }, // static listed second
            ],
        });

        expect(result.get(1)).toBe('a5s');
        expect(result.get(2)).toBe('b4a');
    });

    it('advances the slot for sibling holes down the same branch off a non-home system', () => {
        const result = suggestSignatureAliases({
            originSolarsystemId: 31000010,
            originAlias: 'b3a',
            homeSolarsystemId: 31000005,
            homeStaticCodes: [],
            homeBranchLetters: [],
            aliases: ['a5s', 'b3a'],
            signatures: [
                { id: 1, targetClass: '4', wormholeCode: 'K162' },
                { id: 2, targetClass: '4', wormholeCode: 'K162' },
            ],
        });

        expect(result.get(1)).toBe('b4a');
        expect(result.get(2)).toBe('b4b');
    });

    it('skips a branch letter already reserved on home', () => {
        const result = suggestSignatureAliases({
            ...home,
            homeBranchLetters: ['a'], // "a" already taken (e.g. an accepted static)
            aliases: ['a5s'],
            signatures: [{ id: 1, targetClass: '4', wormholeCode: 'K162' }],
        });

        expect(result.get(1)).toBe('b4a');
    });

    it('maps non-wormhole and unnamed signatures to null without consuming a letter', () => {
        const result = suggestSignatureAliases({
            ...home,
            signatures: [
                { id: 1, targetClass: null, wormholeCode: null }, // a data/relic site
                { id: 2, targetClass: '5', wormholeCode: 'N062' }, // the static still gets "a"
            ],
        });

        expect(result.get(1)).toBeNull();
        expect(result.get(2)).toBe('a5s');
    });
});
