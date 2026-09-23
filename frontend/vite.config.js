import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/victims': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'src/pages/index.html'),
        cases: resolve(__dirname, 'src/pages/cases.html'),
        case: resolve(__dirname, 'src/pages/case.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        submit: resolve(__dirname, 'src/pages/submit.html'),
        login: resolve(__dirname, 'src/pages/login.html'),
        signup: resolve(__dirname, 'src/pages/signup.html'),
        hospital: resolve(__dirname, 'src/pages/hospital.html'),
        municipality: resolve(__dirname, 'src/pages/municipality.html'),
        god: resolve(__dirname, 'src/pages/god.html'),
      },
    },
  },
})
