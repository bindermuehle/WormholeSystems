<script setup lang="ts">
import { TMapSolarsystem } from '@/pages/maps';
import { computed } from 'vue';

const props = defineProps<{
    map_solarsystem: TMapSolarsystem;
    /** Truncate to a single line for the fixed-width tree layout. */
    truncate?: boolean;
}>();

// Who lives there beats what CCP called it: a J-name is noise once the system
// is known, and node width is scarce. The name stays in the title attribute so
// it is still one hover away.
const label = computed(() => props.map_solarsystem.occupier_alias || props.map_solarsystem.solarsystem?.name);

const title = computed(() =>
    [props.map_solarsystem.solarsystem?.name, props.map_solarsystem.occupier_alias].filter(Boolean).join(' — '),
);
</script>

<template>
    <span class="pointer-events-none col-start-2 row-start-1" :class="{ 'block min-w-0 truncate': truncate }" :title="title">
        <span class="mr-1 inline-block" v-if="map_solarsystem.alias">{{ map_solarsystem.alias }}</span>
        <span :data-has-alias="map_solarsystem.alias !== null" class="data-[has-alias=true]:text-muted-foreground">{{ label }}</span>
    </span>
</template>

<style scoped></style>
