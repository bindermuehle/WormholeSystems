import { signatureCategories, signatureTypes } from '@/const/signatures';
import { signatureParser } from '@/lib/SignatureParser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
    vi.mocked(toast.error).mockClear();
});

const factionWarfare = signatureCategories.find((cat) => cat.name === 'Factional Warfare Site')!;
const gas = signatureCategories.find((cat) => cat.name === 'Gas Site')!;
const ore = signatureCategories.find((cat) => cat.name === 'Ore Site')!;

describe('parseSignatures', () => {
    it('parses a signature with a known category and type', () => {
        const type = signatureTypes.find((t) => t.signature_category_id === gas.id)!;
        const line = `ABC-123\tCosmic Signature\tGas Site\t${type.name}\t100,0%\t5,03 AU`;

        const [parsed] = signatureParser.parseSignatures(line);

        expect(parsed).toMatchObject({
            signature_id: 'ABC-123',
            signature_category_id: gas.id,
            signature_type_id: type.id,
            raw_type_name: null,
        });
    });

    it('parses faction warfare sites with the raw type name', () => {
        const line = 'BUH-704\tCosmic Anomaly\tFactional Warfare Site - Combat Site\tMinmatar Large NVY-1\t100,0%\t13,83 AU';

        const [parsed] = signatureParser.parseSignatures(line);

        expect(parsed).toMatchObject({
            signature_id: 'BUH-704',
            signature_category_id: factionWarfare.id,
            signature_type_id: null,
            raw_type_name: 'Minmatar Large NVY-1',
        });
    });

    it('parses a real scan window paste with faction warfare, ore, and unscanned rows', () => {
        const paste = [
            'BBL-893\tCosmic Anomaly\tFactional Warfare Site - Combat Site\tAmarr Scout BSC-1\t100,0%\t6,84 AU',
            'CBA-620\tCosmic Anomaly\tOre Site\tGlacial Mass Belt\t100,0%\t7,02 AU',
            'DXA-556\tCosmic Signature\t\t\t0,0%\t6,51 AU',
            'MSA-264\tCosmic Anomaly\tFactional Warfare Site - Combat Site\tAmarr Moderate NVY-3\t100,0%\t60,60 AU',
        ].join('\n');

        const parsed = signatureParser.parseSignatures(paste);

        expect(parsed).toHaveLength(4);
        expect(parsed[0]).toMatchObject({
            signature_id: 'BBL-893',
            signature_category_id: factionWarfare.id,
            raw_type_name: 'Amarr Scout BSC-1',
        });
        expect(parsed[1]).toMatchObject({
            signature_id: 'CBA-620',
            signature_category_id: ore.id,
            raw_type_name: 'Glacial Mass Belt',
        });
        expect(parsed[2]).toMatchObject({
            signature_id: 'DXA-556',
            signature_category_id: null,
            signature_type_id: null,
            raw_type_name: null,
        });
        expect(parsed[3]).toMatchObject({
            signature_id: 'MSA-264',
            signature_category_id: factionWarfare.id,
            raw_type_name: 'Amarr Moderate NVY-3',
        });
    });

    it('drops ships and other non-signature scan results', () => {
        const paste = [
            'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100,0%\t5,03 AU',
            'DEF-456\tShip\tBattlecruiser\tFerox\t100,0%\t12,3 km',
            'GHI-789\tStructure\tUpwell Palatine Keepstar\tKeepstar\t100,0%\t1,2 AU',
            'JKL-012\tDrone\tCombat Scanner Probe\tSisters Combat Scanner Probe\t100,0%\t0,4 AU',
            'MNO-345\tDeployable\tMobile Depot\tMobile Depot\t100,0%\t30,0 km',
        ].join('\n');

        const parsed = signatureParser.parseSignatures(paste);

        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({ signature_id: 'ABC-123' });
    });

    it('drops a ship row without complaining about its missing signature id', () => {
        const parsed = signatureParser.parseSignatures('\tShip\tFrigate\tHeron\t100,0%\t8,1 km');

        expect(parsed).toHaveLength(0);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('keeps rows whose group it does not recognise, so localised clients still work', () => {
        const parsed = signatureParser.parseSignatures('PQR-678\tKosmische Signatur\t\t\t0,0%\t6,51 AU');

        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({
            signature_id: 'PQR-678',
            signature_category_id: null,
        });
    });

    it('keeps only the signatures from a real combat probe paste', () => {
        const paste = [
            'DTB-020\tCosmic Signature\t\t\t5.3%\t7.55 AU',
            'GQF-170\tDrone\t\t\t13.7%\t8.70 AU',
            'LWJ-023\tShip\t\t\t2.7%\t10.00 AU',
            'NSR-149\tShip\t\t\t17.6%\t1.53 AU',
            'RXX-515\tCosmic Signature\t\t\t19.3%\t1.88 AU',
            'SOH-202\tShip\tCarrier\tNidhoggur\t77.4%\t10.51 AU',
            'VPP-145\tDrone\t\t\t13.7%\t9.03 AU',
            'YEN-272\tShip\t\t\t3.4%\t2.31 AU',
        ].join('\n');

        const parsed = signatureParser.parseSignatures(paste);

        expect(parsed.map((signature) => signature.signature_id)).toEqual(['DTB-020', 'RXX-515']);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('leaves unknown categories uncategorised', () => {
        const line = 'XYZ-999\tCosmic Signature\tSomething Unheard Of\tMystery Site\t12,5%\t1,00 AU';

        const [parsed] = signatureParser.parseSignatures(line);

        expect(parsed).toMatchObject({
            signature_id: 'XYZ-999',
            signature_category_id: null,
            signature_type_id: null,
            raw_type_name: null,
        });
    });
});
