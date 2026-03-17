<script setup lang="ts">
import { message } from './main'
</script>

<template>
  <div class="min-nuxt" data-e2e-magic="8712">
    <h1>Mini Nuxt 示例页面</h1>
    <p>插件输出: {{ message }}</p>
  </div>
</template>

<style scoped>
.min-nuxt {
  padding: 2rem;
  font-family: system-ui, sans-serif;
}
</style>
