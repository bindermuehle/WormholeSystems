import Signatures from '@/routes/signatures';
import { TSignature } from '@/types/models';
import { router } from '@inertiajs/vue3';

export function deleteSignature(signature: TSignature): void {
    return router.delete(Signatures.destroy(signature.id).url, {
        preserveScroll: true,
        preserveState: true,
        only: ['map', 'selected_map_solarsystem', 'reserved_aliases'],
        onError: () => router.reload({ only: ['map'] }),
    });
}
