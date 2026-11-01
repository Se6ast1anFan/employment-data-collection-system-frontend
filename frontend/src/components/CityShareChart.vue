<script setup lang="ts">
import { computed } from 'vue'
import type { CitiesAnalysis } from '@/types/week6'
import { percentText } from '@/utils/week6'
const props=defineProps<{data:CitiesAnalysis}>()
const colors=['#2468ad','#2c927e','#d28a32','#9a65b3','#c65a46','#5b8497','#7f9147']
const slices=computed(()=>{let position=0;return props.data.cities.map((c,i)=>{const start=position;position+=c.enterpriseCount/props.data.totalEnterpriseCount*100;return `${colors[i%colors.length]} ${start}% ${position}%`})})
</script>
<template><figure v-if="!data.empty&&data.totalEnterpriseCount>0" class="pie-figure"><figcaption>各市企业数量占比（分母 {{data.totalEnterpriseCount}} 家）</figcaption><div class="pie-layout"><div class="pie" role="img" aria-label="各市企业数量占比饼图，明细见同页表格" :style="{background:`conic-gradient(${slices.join(',')})`}"/><ul><li v-for="(city,i) in data.cities" :key="city.cityOrgId"><span :style="{background:colors[i%colors.length]}"/>{{city.cityName}}：{{city.enterpriseCount}} 家 · {{percentText(city.sharePercent)}}</li></ul></div></figure></template>
<style scoped>.pie-figure{margin:20px 0}.pie-figure figcaption{margin-bottom:16px}.pie-layout{display:flex;align-items:center;gap:28px;flex-wrap:wrap}.pie{width:220px;height:220px;border-radius:50%;flex-shrink:0}.pie-layout ul{list-style:none;padding:0;margin:0}.pie-layout li{margin:12px 0}.pie-layout li span{display:inline-block;width:12px;height:12px;margin-right:8px}</style>
