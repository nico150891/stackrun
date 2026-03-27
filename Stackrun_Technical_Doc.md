# Stackrun — Documento Técnico del MVP

> Versión 0.1 — Marzo 2026  
> Estado: En desarrollo  
> Stack: Node.js + TypeScript + Commander.js

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [El Manifest](#4-el-manifest)
5. [Comandos del CLI](#5-comandos-del-cli)
6. [Almacenamiento local](#6-almacenamiento-local)
7. [Flujo completo de uso](#7-flujo-completo-de-uso)
8. [Tools del MVP](#8-tools-del-mvp)
9. [Prompt para Claude Code](#9-prompt-para-claude-code)
10. [Roadmap técnico](#10-roadmap-técnico)
11. [Criterio de éxito del MVP](#11-criterio-de-éxito-del-mvp)

---

## 1. Arquitectura general

```
[Developer / Agente de IA]
         ↓
    Stackrun CLI
    (Node.js local)
         ↓
  Stackrun Registry
  (GitHub repo con JSONs)
         ↓
     SaaS API
(Stripe, GitHub, Notion...)
```

En el MVP todo corre local. No hay servidor propio. El CLI:
1. Busca el manifest en el registry (repo de GitHub)
2. Lo descarga y guarda en la máquina del usuario
3. Gestiona el token de autenticación localmente
4. Ejecuta la llamada directo al SaaS

**No hay infra que mantener en el MVP. Cero.**

---

## 2. Stack tecnológico

| Componente | Tecnología | Por qué |
|---|---|---|
| CLI | Node.js + TypeScript | Ecosistema npm, adopción dev, tipado |
| CLI Framework | Commander.js | Estándar de facto para CLIs en Node |
| HTTP Client | Axios | Robusto, interceptors, fácil de usar |
| UX Terminal | Chalk + Ora | Output con color y spinners |
| Registry MVP | GitHub repo con JSONs | Zero infra, simple, gratis |
| Auth local | JSON encriptado | Zero-dependency, portable |
| Backend fase 2 | Supabase | Auth, DB y API out of the box |
| SDK Python | pip (fase 2) | Para AI engineers que construyen agentes |

---

## 3. Estructura del proyecto

```
stackrun/
├── src/
│   ├── commands/
│   │   ├── search.ts       # buscar tools en el registry
│   │   ├── install.ts      # descargar manifest de un tool
│   │   ├── login.ts        # autenticar y guardar token
│   │   ├── call.ts         # ejecutar un comando del SaaS
│   │   └── list.ts         # ver tools instalados
│   ├── services/
│   │   ├── registry.ts     # fetch de manifests desde GitHub
│   │   ├── auth.ts         # gestión de tokens locales
│   │   ├── executor.ts     # ejecuta las llamadas HTTP al SaaS
│   │   └── storage.ts      # lee y escribe archivos locales
│   ├── types/
│   │   └── manifest.ts     # tipos TypeScript del manifest
│   └── index.ts            # entry point del CLI
├── registry/               # JSONs de cada tool
│   ├── stripe.json
│   ├── github.json
│   └── notion.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. El Manifest

Cada SaaS se describe con un archivo `tool.json`. Es el contrato central del sistema. Tiene que ser simple y declarativo, sin código.

### Formato completo

```json
{
  "name": "stripe",
  "version": "1.0.0",
  "description": "Stripe payments API",
  "base_url": "https://api.stripe.com/v1",
  "auth": {
    "type": "api_key",
    "header": "Authorization",
    "prefix": "Bearer"
  },
  "commands": [
    {
      "name": "list_customers",
      "method": "GET",
      "path": "/customers",
      "description": "List all customers"
    },
    {
      "name": "create_payment",
      "method": "POST",
      "path": "/payment_intents",
      "description": "Create a payment intent",
      "params": {
        "amount": "number",
        "currency": "string"
      }
    }
  ]
}
```

### Tipos de auth soportados en el MVP

| Tipo | Descripción | Ejemplo |
|---|---|---|
| `api_key` | API key en header | Stripe, Notion |
| `bearer` | Bearer token | GitHub |
| `none` | Sin auth | APIs públicas |

> OAuth2 queda para V1. No entra en el MVP.

### Campos del manifest

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `name` | string | ✅ | Identificador único del tool |
| `version` | string | ✅ | Versión semántica |
| `description` | string | ✅ | Descripción legible |
| `base_url` | string | ✅ | URL base de la API |
| `auth.type` | enum | ✅ | none / api_key / bearer |
| `auth.header` | string | ✅ | Header HTTP para auth |
| `auth.prefix` | string | ❌ | Prefijo del token (ej: "Bearer") |
| `commands[].name` | string | ✅ | Nombre del comando |
| `commands[].method` | enum | ✅ | GET / POST / PUT / PATCH / DELETE |
| `commands[].path` | string | ✅ | Endpoint relativo |
| `commands[].params` | object | ❌ | Schema de parámetros de entrada |

---

## 5. Comandos del CLI

### `stackrun search <query>`
Busca tools disponibles en el registry.
```bash
stackrun search payments
stackrun search database
```

### `stackrun install <tool>`
Descarga el manifest del tool desde el registry y lo guarda localmente.
```bash
stackrun install stripe
stackrun install github
stackrun install notion
```

### `stackrun login <tool> --token <token>`
Guarda el token de autenticación para el tool indicado.
```bash
stackrun login stripe --token sk_test_xxx
stackrun login github --token ghp_xxx
stackrun login notion --token secret_xxx
```

### `stackrun call <tool.command> [params]`
Ejecuta un comando del tool con los parámetros indicados.
```bash
stackrun call stripe.list_customers
stackrun call stripe.create_payment amount=100 currency=usd
stackrun call github.list_repos
stackrun call notion.search query="proyecto stackrun"
```

Output por defecto: pretty print en terminal.  
Output para agentes: `--json` flag devuelve JSON limpio.
```bash
stackrun call stripe.list_customers --json
```

### `stackrun list`
Muestra todos los tools instalados localmente.
```bash
stackrun list
```

---

## 6. Almacenamiento local

Todo se guarda en `~/.stackrun/` en la máquina del usuario.

```
~/.stackrun/
├── config.json          # configuración general (URL del registry)
├── tokens.json          # tokens de autenticación por tool
└── tools/
    ├── stripe.json      # manifest instalado de stripe
    ├── github.json      # manifest instalado de github
    └── notion.json      # manifest instalado de notion
```

### config.json
```json
{
  "registry_url": "https://raw.githubusercontent.com/stackrun/registry/main"
}
```

### tokens.json
```json
{
  "stripe": "sk_test_xxx",
  "github": "ghp_xxx",
  "notion": "secret_xxx"
}
```

> En el MVP los tokens se guardan en texto plano localmente. En V1 se encriptan. En V2 se mueven a Stackrun Cloud.

---

## 7. Flujo completo de uso

### Flujo de un developer

```bash
# 1. Buscar el tool
stackrun search payments

# 2. Instalar el tool (descarga el manifest)
stackrun install stripe

# 3. Autenticar con el token de Stripe (modo test)
stackrun login stripe --token sk_test_xxx

# 4. Ejecutar
stackrun call stripe.list_customers
```

### Flujo de un agente de IA

El agente ejecuta los mismos comandos pero consume el output en JSON:

```python
import subprocess
import json

result = subprocess.run(
    ["stackrun", "call", "stripe.list_customers", "--json"],
    capture_output=True,
    text=True
)

customers = json.loads(result.stdout)
```

**Esto es todo lo que necesita el agente.** Sin wrappers, sin SDKs, sin leer documentación.

---

## 8. Tools del MVP

### Stripe
- **Auth:** API key (`sk_test_xxx` en modo test)
- **Cuenta:** Gratis, no requiere tarjeta real
- **Comandos MVP:** `list_customers`, `create_payment`
- **Docs:** https://stripe.com/docs/api

### GitHub
- **Auth:** Personal Access Token (`ghp_xxx`)
- **Cuenta:** Gratis
- **Comandos MVP:** `list_repos`, `get_repo`, `list_issues`
- **Docs:** https://docs.github.com/en/rest

### Notion
- **Auth:** Integration Token (`secret_xxx`)
- **Cuenta:** Gratis para desarrollo
- **Comandos MVP:** `search`, `get_page`, `list_databases`
- **Docs:** https://developers.notion.com

---

## 9. Prompt para Claude Code

Usar este prompt para arrancar el proyecto desde cero:

```
Construí un CLI en Node.js + TypeScript llamado "stackrun".

El CLI permite instalar, autenticar y ejecutar herramientas SaaS 
desde terminal con un patrón único.

STACK:
- Node.js + TypeScript
- Commander.js para el CLI
- Axios para HTTP
- Chalk + Ora para UX terminal

COMANDOS A IMPLEMENTAR:
1. stackrun search <query> — busca tools en el registry
2. stackrun install <tool> — descarga manifest desde GitHub registry
3. stackrun login <tool> --token <token> — guarda token localmente
4. stackrun call <tool.command> [params] — ejecuta llamada al SaaS
5. stackrun list — muestra tools instalados

ESTRUCTURA DE CARPETAS:
stackrun/
├── src/
│   ├── commands/ (search.ts, install.ts, login.ts, call.ts, list.ts)
│   ├── services/ (registry.ts, auth.ts, executor.ts, storage.ts)
│   ├── types/manifest.ts
│   └── index.ts
├── registry/ (stripe.json, github.json, notion.json)
├── package.json
└── tsconfig.json

ALMACENAMIENTO LOCAL en ~/.stackrun/:
- config.json (URL del registry)
- tokens.json (tokens por tool)
- tools/*.json (manifests instalados)

EL MANIFEST (tool.json) tiene esta estructura:
{
  "name": "stripe",
  "version": "1.0.0",
  "description": "Stripe payments API",
  "base_url": "https://api.stripe.com/v1",
  "auth": { "type": "api_key", "header": "Authorization", "prefix": "Bearer" },
  "commands": [
    { "name": "list_customers", "method": "GET", "path": "/customers" }
  ]
}

COMPORTAMIENTO:
- Output por defecto: pretty print con colores
- Flag --json: output JSON limpio para agentes
- El registry es un repo de GitHub con JSONs
- Los tokens se guardan en ~/.stackrun/tokens.json

Empezá por index.ts y el comando install + call con stripe como primer tool de prueba.
```

---

## 10. Roadmap técnico

### Semana 1-2 — Core
- [ ] Setup del proyecto (package.json, tsconfig, estructura)
- [ ] Comando `install` funcionando con stripe
- [ ] Comando `login` guardando token localmente
- [ ] Comando `call` ejecutando `stripe.list_customers`
- [ ] Output JSON limpio con `--json` flag

### Semana 3-4 — MVP completo
- [ ] Comandos `search` y `list` funcionando
- [ ] 3 tools completos: stripe, github, notion
- [ ] Manifest de los 3 tools en `/registry`
- [ ] README con GIF demo
- [ ] `npm install -g stackrun` funcionando

### Mes 2 — Lanzamiento
- [ ] Repo público en GitHub
- [ ] Post en Hacker News
- [ ] Build in public en X/Twitter

### Mes 3-6 — V2 Cloud
- [ ] Registry en Supabase (reemplaza GitHub JSONs)
- [ ] Proxy runtime (requests pasan por servidor Stackrun)
- [ ] Dashboard web básico
- [ ] SDK Python inicial (`pip install stackrun`)

---

## 11. Criterio de éxito del MVP

> ¿Puede alguien ejecutar esto en menos de 2 minutos sin leer docs?

```bash
stackrun install stripe
stackrun login stripe --token sk_test_xxx
stackrun call stripe.list_customers
```

Si sí → el MVP cumple su objetivo.  
Si no → hay que iterar en la DX antes de lanzar.

---

*stackrun.sh — The Universal CLI Runtime for SaaS Tools*
