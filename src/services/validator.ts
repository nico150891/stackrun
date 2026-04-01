export interface ValidationError {
  field: string;
  received: unknown;
  expected: string;
}

const VALID_AUTH_TYPES = ['none', 'api_key', 'bearer', 'oauth2'] as const;
const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const VALID_PARAM_LOCATIONS = ['query', 'body', 'path'] as const;
const VALID_PARAM_TYPES = ['string', 'number', 'boolean'] as const;

/** Validates a full tool manifest. Returns an array of errors (empty = valid). */
export function validateManifest(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // name — non-empty, lowercase, alphanumeric + hyphens
  if (typeof data.name !== 'string' || !/^[a-z0-9-]+$/.test(data.name)) {
    errors.push({
      field: 'name',
      received: data.name,
      expected: 'non-empty lowercase string (alphanumeric + hyphens)',
    });
  }

  // version — semver
  if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+/.test(data.version)) {
    errors.push({
      field: 'version',
      received: data.version,
      expected: 'semver string (e.g., "1.0.0")',
    });
  }

  // description — non-empty string
  if (typeof data.description !== 'string' || data.description.length === 0) {
    errors.push({
      field: 'description',
      received: data.description,
      expected: 'non-empty string',
    });
  }

  // base_url — valid HTTPS URL
  if (typeof data.base_url !== 'string' || !data.base_url.startsWith('https://')) {
    errors.push({
      field: 'base_url',
      received: data.base_url,
      expected: 'valid HTTPS URL',
    });
  }

  // auth
  if (typeof data.auth !== 'object' || data.auth === null) {
    errors.push({ field: 'auth', received: data.auth, expected: 'object with type field' });
  } else {
    const auth = data.auth as Record<string, unknown>;
    if (!VALID_AUTH_TYPES.includes(auth.type as (typeof VALID_AUTH_TYPES)[number])) {
      errors.push({
        field: 'auth.type',
        received: auth.type,
        expected: `one of: ${VALID_AUTH_TYPES.join(', ')}`,
      });
    }
    if ((auth.type === 'api_key' || auth.type === 'bearer') && typeof auth.header !== 'string') {
      errors.push({
        field: 'auth.header',
        received: auth.header,
        expected: 'string (required when auth.type is "api_key" or "bearer")',
      });
    }
    if (auth.type === 'oauth2') {
      if (typeof auth.auth_url !== 'string' || !auth.auth_url.startsWith('https://')) {
        errors.push({
          field: 'auth.auth_url',
          received: auth.auth_url,
          expected: 'valid HTTPS URL (required when auth.type is "oauth2")',
        });
      }
      if (typeof auth.token_url !== 'string' || !auth.token_url.startsWith('https://')) {
        errors.push({
          field: 'auth.token_url',
          received: auth.token_url,
          expected: 'valid HTTPS URL (required when auth.type is "oauth2")',
        });
      }
      if (!Array.isArray(auth.scopes)) {
        errors.push({
          field: 'auth.scopes',
          received: auth.scopes,
          expected: 'array of scope strings (required when auth.type is "oauth2")',
        });
      }
    }
  }

  // headers (optional)
  if (data.headers !== undefined) {
    if (typeof data.headers !== 'object' || data.headers === null || Array.isArray(data.headers)) {
      errors.push({
        field: 'headers',
        received: data.headers,
        expected: 'plain object with string keys and string values',
      });
    } else {
      for (const [key, val] of Object.entries(data.headers as Record<string, unknown>)) {
        if (typeof val !== 'string') {
          errors.push({
            field: `headers.${key}`,
            received: val,
            expected: 'string value',
          });
        }
      }
    }
  }

  // commands — non-empty array
  if (!Array.isArray(data.commands) || data.commands.length === 0) {
    errors.push({
      field: 'commands',
      received: Array.isArray(data.commands)
        ? `array with ${data.commands.length} items`
        : data.commands,
      expected: 'non-empty array of commands',
    });
  } else {
    for (let i = 0; i < data.commands.length; i++) {
      const cmdErrors = validateCommand(data.commands[i] as Record<string, unknown>, i);
      errors.push(...cmdErrors);
    }
  }

  return errors;
}

/** Validates a single command definition. */
export function validateCommand(
  cmd: Record<string, unknown>,
  index: number = 0,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `commands[${index}]`;

  // name — non-empty, lowercase, alphanumeric + underscores
  if (typeof cmd.name !== 'string' || !/^[a-z0-9_]+$/.test(cmd.name)) {
    errors.push({
      field: `${prefix}.name`,
      received: cmd.name,
      expected: 'non-empty lowercase string (alphanumeric + underscores)',
    });
  }

  // method
  if (!VALID_METHODS.includes(cmd.method as (typeof VALID_METHODS)[number])) {
    errors.push({
      field: `${prefix}.method`,
      received: cmd.method,
      expected: `one of: ${VALID_METHODS.join(', ')}`,
    });
  }

  // path — starts with /
  if (typeof cmd.path !== 'string' || !cmd.path.startsWith('/')) {
    errors.push({
      field: `${prefix}.path`,
      received: cmd.path,
      expected: 'string starting with "/"',
    });
  }

  // description
  if (typeof cmd.description !== 'string' || cmd.description.length === 0) {
    errors.push({
      field: `${prefix}.description`,
      received: cmd.description,
      expected: 'non-empty string',
    });
  }

  // headers (optional, same rules as tool-level)
  if (cmd.headers !== undefined) {
    if (typeof cmd.headers !== 'object' || cmd.headers === null || Array.isArray(cmd.headers)) {
      errors.push({
        field: `${prefix}.headers`,
        received: cmd.headers,
        expected: 'plain object with string keys and string values',
      });
    }
  }

  // params (optional)
  if (cmd.params !== undefined) {
    if (!Array.isArray(cmd.params)) {
      errors.push({
        field: `${prefix}.params`,
        received: cmd.params,
        expected: 'array of param definitions',
      });
    } else {
      for (let j = 0; j < cmd.params.length; j++) {
        const paramErrors = validateParam(
          cmd.params[j] as Record<string, unknown>,
          cmd.path as string,
          index,
          j,
        );
        errors.push(...paramErrors);
      }
    }
  }

  return errors;
}

/** Validates a single param definition. */
function validateParam(
  param: Record<string, unknown>,
  commandPath: string,
  cmdIndex: number,
  paramIndex: number,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `commands[${cmdIndex}].params[${paramIndex}]`;

  if (typeof param.name !== 'string' || param.name.length === 0) {
    errors.push({ field: `${prefix}.name`, received: param.name, expected: 'non-empty string' });
  }

  if (typeof param.description !== 'string' || param.description.length === 0) {
    errors.push({
      field: `${prefix}.description`,
      received: param.description,
      expected: 'non-empty string',
    });
  }

  if (typeof param.required !== 'boolean') {
    errors.push({ field: `${prefix}.required`, received: param.required, expected: 'boolean' });
  }

  if (!VALID_PARAM_LOCATIONS.includes(param.location as (typeof VALID_PARAM_LOCATIONS)[number])) {
    errors.push({
      field: `${prefix}.location`,
      received: param.location,
      expected: `one of: ${VALID_PARAM_LOCATIONS.join(', ')}`,
    });
  }

  if (!VALID_PARAM_TYPES.includes(param.type as (typeof VALID_PARAM_TYPES)[number])) {
    errors.push({
      field: `${prefix}.type`,
      received: param.type,
      expected: `one of: ${VALID_PARAM_TYPES.join(', ')}`,
    });
  }

  // If location is "path", the command path must contain :name placeholder
  if (
    param.location === 'path' &&
    typeof param.name === 'string' &&
    typeof commandPath === 'string' &&
    !commandPath.includes(`:${param.name}`)
  ) {
    errors.push({
      field: `${prefix}.location`,
      received: `path param "${param.name}" but path is "${commandPath}"`,
      expected: `command path to contain ":${param.name}" placeholder`,
    });
  }

  return errors;
}

/** Formats validation errors into human-readable lines */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map(
    (e) => `  - ${e.field}: got ${JSON.stringify(e.received)}, expected ${e.expected}`,
  );
}
