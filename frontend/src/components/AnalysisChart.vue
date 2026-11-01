<script setup lang="ts">
import { computed } from 'vue'
import { chartGeometry, type ChartPoint } from '@/utils/chart'
const props=defineProps<{points:ChartPoint[];unit:string;title:string;mode:'line'|'bar'}>()
const g=computed(()=>chartGeometry(props.points))
const fmt=(v:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v)
</script>
<template>
  <figure class="chart-figure">
    <figcaption>{{title}}（{{unit}}）；“—”表示无有效分母，折线在该期断开。</figcaption>
    <div class="chart-scroll">
      <svg :viewBox="`0 0 ${g.width} ${g.height}`" :style="{minWidth:g.width+'px'}" role="img" :aria-label="title+'，单位'+unit">
        <g v-for="tick in [g.min, (g.min+g.max)/2, g.max]" :key="tick">
          <line x1="65" :x2="g.width-30" :y1="g.y(tick)" :y2="g.y(tick)" stroke="#dce4ed"/>
          <text x="58" :y="g.y(tick)+4" text-anchor="end">{{fmt(tick)}}</text>
        </g>
        <line x1="65" :x2="g.width-30" :y1="g.zero" :y2="g.zero" stroke="#7a8898"/>
        <template v-if="mode==='line'">
          <polyline v-for="(segment,i) in g.segments" :key="i" :points="segment.map(p=>`${p.x},${p.y}`).join(' ')" fill="none" stroke="#2468ad" stroke-width="3"/>
        </template>
        <g v-for="(p,i) in points" :key="i">
          <template v-if="p.value!==null">
            <rect v-if="mode==='bar'" :x="g.x(i)-18" :y="Math.min(g.zero,g.y(p.value))" width="36" :height="Math.max(1,Math.abs(g.zero-g.y(p.value)))" :fill="p.value<0?'#c65a46':'#2468ad'"><title>{{p.label}}：{{fmt(p.value)}}{{unit}}</title></rect>
            <circle v-else :cx="g.x(i)" :cy="g.y(p.value)" r="5" fill="#2468ad"><title>{{p.label}}：{{fmt(p.value)}}{{unit}}</title></circle>
            <text :x="g.x(i)" :y="g.y(p.value)-10" text-anchor="middle">{{fmt(p.value)}}{{unit==='%'?'%':''}}</text>
          </template>
          <text v-else :x="g.x(i)" y="25" text-anchor="middle">—</text>
          <text :transform="`translate(${g.x(i)},245) rotate(-25)`" text-anchor="end">{{p.label}}</text>
        </g>
      </svg>
    </div>
  </figure>
</template>
<style scoped>
.chart-figure{margin:20px 0}.chart-figure figcaption{margin-bottom:12px;color:#52677c}.chart-scroll{overflow-x:auto;border:1px solid #e5e8ee;border-radius:6px;padding:12px}svg{width:100%;display:block;font-family:inherit}text{font-size:12px;fill:#344b64}
</style>
