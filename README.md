# 🚀 Study Hub Academy (v2.0)

Plataforma web interactiva de aprendizaje gamificado diseñada bajo una arquitectura modular y resၵliente, inspirada en la estética anime de alto rendimiento (*Blue Lock / Captain Tsubasa*). 

Este repositorio administra el control de versiones y el ciclo de vida del desarrollo (SDLC) de la plataforma, manteniendo un entorno estable en producción y un entorno de staging/desarrollo continuo para nuevas características.

---

## 🏗️ Arquitectura del Proyecto

El repositorio se encuentra estructurado bajo un enfoque híbrido de entrega continua:

```text
study-hub-academy/
├── production/              # Entorno estable v1.7 (Desplegado en Google Sites para Alfonso)
│   └── index.html           # Versión monolítica optimizada y sin dependencias externas complejas
├── src/                     # Entorno de desarrollo activo v2.0 (Modularizado para GitHub Pages)
│   ├── index.html           # Estructura SPA y vistas principales
│   ├── style.css            # Sistema de diseño centralizado (Variables, colores y UI táctil)
│   └── app.js               # Lógica de negocio, parseo CSV, Web Audio API y gamificación
└── README.md                # Documentación técnica y bitácora del proyecto
