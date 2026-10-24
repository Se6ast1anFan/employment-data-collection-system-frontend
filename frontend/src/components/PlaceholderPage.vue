<script setup lang="ts">
import { InfoFilled } from '@element-plus/icons-vue'

import type { PlaceholderPageConfig } from '@/types/api'

defineProps<{ config: PlaceholderPageConfig }>()
</script>

<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">业务模块占位页</p>
        <h1>{{ config.title }}</h1>
        <p>{{ config.description }}</p>
      </div>
      <el-tag type="info">第 1 周仅展示框架</el-tag>
    </div>
    <el-card shadow="never" class="placeholder-card">
      <el-empty description="暂无数据，本模块将在后续周次开发">
        <div class="placeholder-actions">
          <el-tooltip
            v-for="action in config.actions"
            :key="action.label"
            :content="`第 ${action.week} 周开放`"
            placement="top"
          >
            <span>
              <el-button disabled>{{ action.label }}（第 {{ action.week }} 周）</el-button>
            </span>
          </el-tooltip>
        </div>
      </el-empty>
    </el-card>
    <el-alert
      :icon="InfoFilled"
      title="当前页面不会发送业务请求，也不会写入或伪造业务数据。"
      type="info"
      :closable="false"
      show-icon
    />
  </section>
</template>
