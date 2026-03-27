# Stackrun

CLI universal para instalar, autenticar y ejecutar herramientas SaaS desde terminal.
Diseñado para developers y agentes de IA que necesitan interactuar con APIs externas sin wrappers ni SDKs.

## Stack

- Node.js 20+ + TypeScript 5+
- Commander.js — framework CLI
- Axios — cliente HTTP
- Chalk + Ora — UX terminal (colores, spinners)
- Registry MVP: repo GitHub con JSONs (zero infra)
- Testing: Vitest
- Linting: ESLint + Prettier
- Type checking: tsc --noEmit

## Comandos

```bash
# Desarrollo
npm run dev         # ts-node src/index.ts
npm run build       # compila a dist/

# Instalar globalmente en desarrollo
npm link            # permite usar `stackrun` desde cualquier carpeta

# Tests
npm test                        # todos los tests
npm test -- --run src/commands  # tests de un módulo específico

# Lint + Format
npm run lint
npm run format

# Type check
npm run typecheck
```

## Arquitectura

```
stackrun/
├── src/
│   ├── commands/       # Un archivo por comando CLI
│   │   ├── search.ts
│   │   ├── install.ts
│   │   ├── login.ts
│   │   ├── call.ts
│   │   └── list.ts
│   ├── services/       # Lógica de negocio reutilizable
│   │   ├── registry.ts     # fetch de manifests desde GitHub
│   │   ├── auth.ts         # gestión de tokens locales
│   │   ├── executor.ts     # ejecuta las llamadas HTTP al SaaS
│   │   └── storage.ts      # lee/escribe ~/.stackrun/
│   ├── types/
│   │   └── manifest.ts     # tipos TypeScript del manifest
│   └── index.ts            # entry point, registra comandos
├── registry/           # JSONs de cada tool (fuente del registry MVP)
│   ├── stripe.json
│   ├── github.json
│   └── notion.json
├── tests/
│   ├── unit/           # tests de servicios aislados
│   └── integration/    # tests de comandos end-to-end (mock HTTP)
├── docs/
│   ├── plan.md         # plan activo y checkpoints (Claude puede escribir aquí)
│   ├── scratchpad.md   # notas de sesión y discoveries (Claude puede escribir aquí)
│   └── decisions.md    # decisiones de arquitectura (ADRs)
└── .claude/
    ├── rules/          # reglas específicas por dominio
    └── skills/         # workflows reutilizables
```

## El Manifest

El contrato central del sistema. Cada SaaS se describe con un JSON declarativo:

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
    }
  ]
}
```

Auth soportado en MVP: `none`, `api_key`, `bearer`. OAuth2 queda para V1.

## Almacenamiento local

Todo en `~/.stackrun/`:
- `config.json` — URL del registry
- `tokens.json` — tokens por tool (texto plano en MVP, encriptado en V1)
- `tools/*.json` — manifests instalados

## Comunicación

- ALWAYS explicar cada decisión y cambio: qué se hizo, por qué, qué alternativas había, qué trade-offs tiene.
- Cuando modifiques un archivo, explicar QUÉ cambiaste y POR QUÉ antes de mostrar el código.
- Si hay un patrón que no es obvio, explicarlo brevemente.

## Reglas

- NEVER modificar este archivo (CLAUDE.md). Es read-only para el agente.
- ALWAYS usar tipos explícitos en funciones públicas. No usar `any` salvo que sea inevitable y justificado con un comentario.
- NEVER hardcodear tokens, API keys o URLs de producción. Usar `~/.stackrun/config.json` o variables de entorno.
- NEVER hacer catch vacíos. Siempre capturar errores específicos y mostrar mensajes útiles al usuario con Chalk.
- El flag `--json` en `stackrun call` debe devolver JSON limpio a stdout y nada más. Los logs de UX (Ora, Chalk) van a stderr.
- Los comentarios y docstrings dentro del código deben estar en inglés.
- Planificación, checkpoints y progreso van en `docs/plan.md`, NUNCA en este archivo.
- Notas de sesión y discoveries van en `docs/scratchpad.md`.

## Organización de .claude/

Si necesitás crear rules, skills o workflows nuevos, seguí esta estructura:

```
.claude/
├── rules/
│   └── [dominio].md        # ej: manifest-validation.md, error-handling.md
└── skills/
    └── [workflow].md       # ej: add-new-tool.md, release.md
```

**Rules** → restricciones o convenciones que aplican siempre (ej: cómo formatear errores, cómo validar un manifest antes de guardarlo).  
**Skills** → secuencias de pasos para tareas recurrentes (ej: cómo agregar un nuevo tool al registry, cómo hacer un release a npm).

Cuando crees uno, mencionarlo en esta sección y en `docs/decisions.md` con el contexto de por qué se creó.

## References

- @docs/decisions.md para decisiones de arquitectura y stack (ADRs)
- @README.md para overview e instrucciones de instalación
