import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import './styles.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

window.addEventListener('auth:unauthorized', () => {
  useAuthStore(pinia).clearSession()
  router.replace('/login')
})
window.addEventListener('auth:forbidden', () => {
  void useAuthStore(pinia).refreshUser().catch(() => {})
  void router.replace('/403')
})

app.mount('#app')
