<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppLayout from '@/components/AppLayout.vue'

const route = useRoute()
const standalone = computed(() => ['/login', '/403', '/404'].includes(route.path))
</script>

<template>
  <router-view v-if="standalone" />
  <AppLayout v-else />
</template>
