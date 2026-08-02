# 📱 QR Vision Pro - Lector & Generador de QR Móvil

Aplicación web progresiva (PWA) móvil y responsiva para escaneo y generación de códigos QR en tiempo real usando la cámara del celular. Diseñada con estética *glassmorphism*, retroalimentación sonora/háptica y lista para desplegar en la nube con **Railway** y **GitHub**.

---

## 🌟 Características
- 📷 **Escaneo de Cámara en Tiempo Real**: Soporte multi-cámara (trasera y frontal por defecto).
- 🔒 **Conexión Segura (HTTPS)**: Requisito indispensable para que navegadores móviles (iOS Safari / Android Chrome) otorguen permisos de cámara.
- 🎨 **Diseño Móvil Premium**: Interfaz en Vanilla CSS con colores HSL, efectos traslúcidos (*glassmorphism*) y animaciones tipo láser de escaneo.
- 🔊 **Retroalimentación Auditiva y Háptica**: Sonido *beep* sintetizado con Web Audio API (sin archivos de audio externos) y vibración al detectar códigos.
- 📜 **Historial de Escaneos**: Guardado local en el navegador (`localStorage`) con opción de copiar, abrir enlaces y limpiar.
- ⚡ **Generador de Códigos QR**: Crea y descarga tus propios códigos QR al instante.

---

## 🛠️ Requisitos Previos
- **Node.js** v18+ y **npm**
- **Git**

---

## 🚀 Instalación y Ejecución Local

1. Clonar el repositorio (o entrar a la carpeta del proyecto):
```bash
cd c:\Users\ajmon\proyectos\qr_reader
```

2. Instalar dependencias:
```bash
npm install
```

3. Iniciar el servidor local:
```bash
npm start
```

4. Abrir en tu navegador:
```text
http://localhost:3000
```

---

## 🐙 Subir el Proyecto a GitHub

1. Inicializar repositorio e historial de commits:
```bash
git init
git add .
git commit -m "Initial commit - QR Vision Pro App"
```

2. Crear un nuevo repositorio vacío en [GitHub](https://github.com/new).

3. Vincular y subir tu rama principal:
```bash
git remote add origin https://github.com/TU_USUARIO/qr-reader-app.git
git branch -M main
git push -u origin main
```

---

## 🚂 Despliegue en Railway

1. Entra a [Railway.app](https://railway.app) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **New Project** -> **Deploy from GitHub repo**.
3. Selecciona tu repositorio `qr-reader-app`.
4. Railway detectará automáticamente el archivo `package.json` y ejecutará `npm start`.
5. En la sección **Settings** -> **Networking**, haz clic en **Generate Domain**.
6. ¡Listo! Obtendrás un enlace HTTPS seguro (`https://qr-reader-app-production.up.railway.app`) que podrás abrir directamente desde el navegador de tu celular para escanear códigos QR con la cámara trasera.
