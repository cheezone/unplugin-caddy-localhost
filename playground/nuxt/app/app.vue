<script setup lang="ts">
import { message } from './main'
</script>

<template>
  <div class="min-nuxt">
    <h1>Mini Nuxt + unplugin-starter</h1>
    <p>插件输出: {{ message }}</p>
  </div>
</template>

<style scoped>
.min-nuxt {
  padding: 2rem;
  font-family: system-ui, sans-serif;
}
</style>
