import { describe, expect, it } from 'vitest';

import { classToTypeChar, generateAlias, nextBranchLetter, nextSlotLetter } from './alias';

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
