<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import PlaceholderPage from '@/components/PlaceholderPage.vue'

const route = useRoute()
const config = computed(() => route.meta.pageConfig!)
</script>

<template><PlaceholderPage :config="config" /></template>
