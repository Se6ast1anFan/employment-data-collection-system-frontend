<template>
  <main class="error-page">
    <el-result icon="warning" title="403" sub-title="当前账号没有访问该页面的权限">
      <template #extra><el-button type="primary" @click="$router.push('/home')">返回工作台</el-button></template>
    </el-result>
  </main>
</template>
