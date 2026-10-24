import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import './styles.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus)

window.addEventListener('auth:unauthorized', () => {
  useAuthStore(pinia).clearSession()
  router.replace('/login')
})
window.addEventListener('auth:forbidden', () => router.replace('/403'))

app.mount('#app')
