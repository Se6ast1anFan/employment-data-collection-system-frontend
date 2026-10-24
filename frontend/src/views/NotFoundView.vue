<template>
  <main class="error-page">
    <el-result icon="info" title="404" sub-title="访问的页面不存在">
      <template #extra><el-button type="primary" @click="$router.push('/home')">返回工作台</el-button></template>
    </el-result>
  </main>
</template>
