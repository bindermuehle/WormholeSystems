<script setup lang="ts">
import PasteIcon from '@/components/icons/PasteIcon.vue';
import PlusIcon from '@/components/icons/PlusIcon.vue';
import TrashIcon from '@/components/icons/TrashIcon.vue';
import PasteSignatureWarningDialog from '@/components/signatures/PasteSignatureWarningDialog.vue';
import Signature from '@/components/signatures/Signature.vue';
import SignaturesEmptyState from '@/components/signatures/SignaturesEmptyState.vue';
import MapPanel from '@/components/ui/map-panel/MapPanel.vue';
import MapPanelContent from '@/components/ui/map-panel/MapPanelContent.vue';
import MapPanelHeader from '@/components/ui/map-panel/MapPanelHeader.vue';
import MapPanelHeaderActionButton from '@/components/ui/map-panel/MapPanelHeaderActionButton.vue';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePasteSignatures } from '@/composables/signatures/usePasteSignatures';
import { useSignatures } from '@/composables/signatures/useSignatures';
import { useSortableSignatures } from '@/composables/signatures/useSortedSignatures';
import { useActiveMapCharacter } from '@/composables/useActiveMapCharacter';
import { useMapUserSettings } from '@/composables/useMapUserSettings';
import usePermission from '@/composables/usePermission';
import { useShowMap } from '@/composables/useShowMap';
import { type AliasSuggestionContext, parentTowardHome, reachableFromHome, suggestSignatureAliases, usedHomeBranchLetters } from '@/lib/alias';
import { createSignature, updateSignature, useMapSolarsystems } from '@/map/api';
import type { TResolvedSelectedMapSolarsystem } from '@/pages/maps';
import { useLocalStorage } from '@vueuse/core';
import { ArrowDown, ArrowUp, CircleHelp, Cloud, Database, Fan, Gem, Landmark, Shield, Swords } from 'lucide-vue-next';
import { type Component, computed, watch } from 'vue';

const props = defineProps<{
    map_solarsystem: TResolvedSelectedMapSolarsystem | null;
}>();

const { connections } = useSignatures();

const page = useShowMap();
const { map_solarsystems: all_map_solarsystems } = useMapSolarsystems();

const { canEdit: can_write } = usePermission();

const map_user_settings = useMapUserSettings();

const character = useActiveMapCharacter();

const {
    signatures,
    pasted_signatures,
    deleted_signatures,
    deleteMissingSignatures,
    pasteSignatures,
    show_system_mismatch_warning,
    confirmPasteInDifferentSystem,
    cancelPaste,
} = usePasteSignatures(() => props.map_solarsystem);

const UNCATEGORIZED_FILTER = '__uncategorized__';

const categoryFilterOptions: Array<{ value: string; icon: Component; color: string; label: string }> = [
    { value: 'Wormhole', icon: Fan, color: 'text-sky-400', label: 'Wormhole' },
    { value: 'Data Site', icon: Database, color: 'text-cyan-400', label: 'Data Site' },
    { value: 'Relic Site', icon: Landmark, color: 'text-amber-400', label: 'Relic Site' },
    { value: 'Ore Site', icon: Gem, color: 'text-yellow-400', label: 'Ore Site' },
    { value: 'Gas Site', icon: Cloud, color: 'text-orange-400', label: 'Gas Site' },
    { value: 'Combat Site', icon: Swords, color: 'text-green-400', label: 'Combat Site' },
    { value: 'Homefront Operations', icon: Shield, color: 'text-rose-400', label: 'Homefront Operations' },
    { value: UNCATEGORIZED_FILTER, icon: CircleHelp, color: 'text-muted-foreground', label: 'Uncategorized' },
];

const activeCategoryFilters = useLocalStorage<string[]>(
    'signatures-category-filters',
    categoryFilterOptions.map((option) => option.value),
);

const filteredSignatures = computed(() =>
    signatures.value.filter((signature) => {
        const key = signature.signature_category?.name ?? UNCATEGORIZED_FILTER;
        return activeCategoryFilters.value.includes(key);
    }),
);

const hiddenSignaturesCount = computed(() => signatures.value.length - filteredSignatures.value.length);

const { sortPreferences, sorted, updateSortPreferences } = useSortableSignatures(filteredSignatures);

const connected_connections = computed(() => {
    return connections.value.filter((connection) => {
        return signatures.value.some((signature) => {
            return signature.map_connection_id === connection.id;
        });
    });
});

const unconnected_connections = computed(() => {
    return connections.value.filter((connection) => {
        return !signatures.value.some((signature) => {
            return signature.map_connection_id === connection.id;
        });
    });
});

// Map-level inputs for the automapper, computed once and shared by every row.
// The alias pool pulls both live system aliases and the reserved aliases of the
// selected system's signatures, so concurrent scouts naming holes in the same
// system get distinct suggestions rather than colliding.
const alias_context = computed<AliasSuggestionContext>(() => {
    const homeSolarsystemId = page.props.map.home_solarsystem_id;
    const systems = all_map_solarsystems.value;
    const home = systems.find((system) => system.solarsystem_id === homeSolarsystemId) ?? null;
    const aliasByMapSolarsystemId = new Map(systems.map((system) => [system.id, system.alias] as const));

    // Only count aliases of systems still reachable from home. A rolled-off
    // (orphaned) system keeps its row until cleaned up, but its alias must stop
    // occupying a slot — otherwise the next hole of that type inflates (e.g. a
    // stale aLa forcing the next lowsec to aLb).
    const reachable = reachableFromHome(home?.id ?? null, page.props.map.map_connections);
    const systemAliases = systems.filter((system) => reachable === null || reachable.has(system.id)).map((system) => system.alias);
    const reservedAliases = (signatures.value ?? []).map((signature) => signature.alias);
    const aliases = [...new Set([...systemAliases, ...reservedAliases].filter((alias): alias is string => Boolean(alias)))];

    return {
        homeSolarsystemId,
        homeStaticCodes: (home?.solarsystem.statics ?? []).map((wormhole_static) => wormhole_static.name),
        homeBranchLetters: usedHomeBranchLetters(home?.id ?? null, page.props.map.map_connections, aliasByMapSolarsystemId),
        aliases,
    };
});

const selected_is_home = computed(() => props.map_solarsystem != null && props.map_solarsystem.solarsystem_id === page.props.map.home_solarsystem_id);

// Suggested aliases for every unconnected, unnamed wormhole in this system,
// generated in one accumulating pass so siblings get distinct names. Keyed by
// signature id; rows read their own entry.
const suggested_aliases = computed<Map<number, string | null>>(() => {
    const selected = props.map_solarsystem;
    if (!selected || !map_user_settings.value.suggest_alias_enabled) return new Map();

    // Branch letters reserved on home's own signatures (set before the hole is
    // connected) also count, so a fresh link off home skips them.
    const reserved_home_letters = selected_is_home.value
        ? signatures.value
              .map((signature) => signature.alias?.trim().replace(/^\+/, '').charAt(0))
              .filter((letter): letter is string => Boolean(letter))
        : [];

    const pending = signatures.value
        .filter((signature) => signature.map_connection_id == null && !signature.alias)
        .map((signature) => ({
            id: signature.id,
            targetClass: signature.signature_type?.target_class ?? null,
            wormholeCode: signature.wormhole?.name ?? null,
        }));

    return suggestSignatureAliases({
        originSolarsystemId: selected.solarsystem_id,
        originAlias: selected.alias,
        homeSolarsystemId: alias_context.value.homeSolarsystemId,
        homeStaticCodes: alias_context.value.homeStaticCodes,
        homeBranchLetters: [...alias_context.value.homeBranchLetters, ...reserved_home_letters],
        aliases: alias_context.value.aliases,
        signatures: pending,
    });
});

// Persist each suggestion the moment it is generated, so a scanned wormhole is
// named with zero clicks — the scout can still overwrite it. Once saved, the
// signature carries the alias and drops out of the suggestion map, so this
// writes each signature at most once (the guard set covers transient re-renders
// and stops a cleared alias from being re-applied against the scout's intent).
const auto_named = new Set<number>();
watch(
    suggested_aliases,
    (suggestions) => {
        if (!can_write.value) return;
        // One write per tick: each save reloads the map, which recomputes the
        // suggestions and re-fires this watcher for the next one. Sequencing this
        // way avoids concurrent Inertia visits cancelling one another.
        for (const [id, suggestion] of suggestions) {
            if (!suggestion || auto_named.has(id)) continue;
            const signature = signatures.value.find((candidate) => candidate.id === id);
            if (!signature || signature.alias) continue;
            auto_named.add(id);
            updateSignature(signature, { alias: suggestion });
            return;
        }
    },
    { immediate: true },
);

// The selected system's neighbour toward home — the hole back home, which each
// row marks with a "+".
const homeward_map_solarsystem_id = computed<number | null>(() => {
    const selected = props.map_solarsystem;
    if (!selected) return null;
    const home = all_map_solarsystems.value.find((system) => system.solarsystem_id === page.props.map.home_solarsystem_id) ?? null;
    return parentTowardHome(home?.id ?? null, selected.id, page.props.map.map_connections);
});

function handleSort(column: 'id' | 'category' | 'type' | 'age') {
    let newDirection: 'asc' | 'desc';

    if (sortPreferences.value.column === column) {
        newDirection = sortPreferences.value.direction === 'asc' ? 'desc' : 'asc';
    } else {
        newDirection = 'asc';
    }

    updateSortPreferences(column, newDirection);
}

function createNewSignature() {
    if (!props.map_solarsystem) return;
    createSignature(props.map_solarsystem.id);
}
</script>

<template>
    <!-- Empty state when no system selected -->
    <SignaturesEmptyState v-if="!map_solarsystem" />

    <!-- Signatures list when system is selected -->
    <MapPanel v-if="map_solarsystem" class="overflow-x-hidden">
        <MapPanelHeader>
            Signatures
            <span v-if="filteredSignatures.length" class="ml-1 text-amber-400">{{ filteredSignatures.length }}</span>
            <span v-if="hiddenSignaturesCount > 0" class="ml-1 text-muted-foreground/70">{{ hiddenSignaturesCount }} hidden</span>
            <template #actions>
                <ToggleGroup v-model="activeCategoryFilters" type="multiple" size="sm" variant="outline">
                    <Tooltip v-for="option in categoryFilterOptions" :key="option.value">
                        <TooltipTrigger as-child>
                            <ToggleGroupItem :value="option.value" :aria-label="option.label">
                                <component :is="option.icon" class="mx-1 size-3" :class="option.color" />
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>{{ option.label }}</TooltipContent>
                    </Tooltip>
                </ToggleGroup>
                <template v-if="can_write">
                    <Tooltip v-if="pasted_signatures">
                        <TooltipTrigger as-child>
                            <MapPanelHeaderActionButton v-if="pasted_signatures" @click="pasted_signatures = null">
                                Unselect
                            </MapPanelHeaderActionButton>
                        </TooltipTrigger>
                        <TooltipContent> Unselect signatures</TooltipContent>
                    </Tooltip>
                    <Tooltip v-if="deleted_signatures.length > 0">
                        <TooltipTrigger as-child>
                            <MapPanelHeaderActionButton @click="deleteMissingSignatures(true)" variant="destructive" size="icon">
                                <TrashIcon />
                            </MapPanelHeaderActionButton>
                        </TooltipTrigger>
                        <TooltipContent> Delete missing signatures and their connections </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <MapPanelHeaderActionButton @click="pasteSignatures" size="icon">
                                <PasteIcon />
                            </MapPanelHeaderActionButton>
                        </TooltipTrigger>
                        <TooltipContent> Paste signatures from clipboard (Ctrl/Cmd + V)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <MapPanelHeaderActionButton @click="createNewSignature" size="icon">
                                <PlusIcon />
                            </MapPanelHeaderActionButton>
                        </TooltipTrigger>
                        <TooltipContent> Create new signature</TooltipContent>
                    </Tooltip>
                </template>
            </template>
        </MapPanelHeader>
        <MapPanelContent>
            <!-- Header -->
            <div
                class="flex items-center gap-2 border-b border-border/30 bg-muted/20 px-3 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
            >
                <button class="flex w-16 shrink-0 items-center gap-1 hover:text-foreground" @click="handleSort('id')">
                    <span>ID</span>
                    <ArrowUp v-if="sortPreferences.column === 'id' && sortPreferences.direction === 'asc'" class="size-3" />
                    <ArrowDown v-if="sortPreferences.column === 'id' && sortPreferences.direction === 'desc'" class="size-3" />
                </button>
                <button class="flex w-24 shrink-0 items-center gap-1 hover:text-foreground" @click="handleSort('category')">
                    <span>Cat</span>
                    <ArrowUp v-if="sortPreferences.column === 'category' && sortPreferences.direction === 'asc'" class="size-3" />
                    <ArrowDown v-if="sortPreferences.column === 'category' && sortPreferences.direction === 'desc'" class="size-3" />
                </button>
                <button class="flex min-w-0 flex-1 items-center gap-1 hover:text-foreground" @click="handleSort('type')">
                    <span>Type</span>
                    <ArrowUp v-if="sortPreferences.column === 'type' && sortPreferences.direction === 'asc'" class="size-3" />
                    <ArrowDown v-if="sortPreferences.column === 'type' && sortPreferences.direction === 'desc'" class="size-3" />
                </button>
                <span class="min-w-0 flex-1">Conn</span>
                <span class="w-14 shrink-0">Alias</span>
                <button class="flex w-10 shrink-0 items-center justify-end gap-1 hover:text-foreground" @click="handleSort('age')">
                    <span>Age</span>
                    <ArrowUp v-if="sortPreferences.column === 'age' && sortPreferences.direction === 'asc'" class="size-3" />
                    <ArrowDown v-if="sortPreferences.column === 'age' && sortPreferences.direction === 'desc'" class="size-3" />
                </button>
                <span class="w-6 shrink-0"></span>
            </div>

            <!-- Signature rows -->
            <template v-if="sorted.length">
                <Signature
                    v-for="signature in sorted"
                    :signature="signature"
                    :key="signature.id"
                    :is_deleted="signature.deleted"
                    :is_new="signature.new"
                    :is_updated="signature.updated"
                    :unconnected_connections="unconnected_connections"
                    :connected_connections="connected_connections"
                    :selected_map_solarsystem="map_solarsystem"
                    :suggested_alias="suggested_aliases.get(signature.id) ?? null"
                    :homeward_map_solarsystem_id="homeward_map_solarsystem_id"
                />
            </template>
            <div v-else class="flex h-full flex-col items-center justify-center gap-2 p-4">
                <p class="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
                    {{ hiddenSignaturesCount > 0 ? `${hiddenSignaturesCount} hidden by filters` : 'No signatures' }}
                </p>
            </div>
        </MapPanelContent>
    </MapPanel>

    <!-- Warning dialog for pasting in different system -->
    <PasteSignatureWarningDialog
        v-model:open="show_system_mismatch_warning"
        :target-system="map_solarsystem"
        :character="character"
        @confirm="confirmPasteInDifferentSystem"
        @cancel="cancelPaste"
    />
</template>
