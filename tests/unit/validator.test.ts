import { describe, it, expect } from 'vitest';
import { validateManifest, validateCommand } from '../../src/services/validator.js';

const validManifest = {
  name: 'stripe',
  version: '1.0.0',
  description: 'Stripe payments API',
  base_url: 'https://api.stripe.com/v1',
  auth: { type: 'api_key', header: 'Authorization', prefix: 'Bearer' },
  commands: [
    {
      name: 'list_customers',
      method: 'GET',
      path: '/customers',
      description: 'List all customers',
    },
  ],
};

describe('Validator Service', () => {
  describe('validateManifest', () => {
    it('should return no errors for a valid manifest', () => {
      const errors = validateManifest(validManifest);
      expect(errors).toEqual([]);
    });

    it('should reject missing name', () => {
      const errors = validateManifest({ ...validManifest, name: undefined });
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject uppercase name', () => {
      const errors = validateManifest({ ...validManifest, name: 'Stripe' });
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject invalid version', () => {
      const errors = validateManifest({ ...validManifest, version: 'latest' });
      expect(errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('should reject empty description', () => {
      const errors = validateManifest({ ...validManifest, description: '' });
      expect(errors.some((e) => e.field === 'description')).toBe(true);
    });

    it('should reject non-HTTPS base_url', () => {
      const errors = validateManifest({ ...validManifest, base_url: 'http://api.stripe.com' });
      expect(errors.some((e) => e.field === 'base_url')).toBe(true);
    });

    it('should reject invalid auth type', () => {
      const errors = validateManifest({
        ...validManifest,
        auth: { type: 'magic_token' },
      });
      expect(errors.some((e) => e.field === 'auth.type')).toBe(true);
    });

    it('should require auth.header for api_key type', () => {
      const errors = validateManifest({
        ...validManifest,
        auth: { type: 'api_key' },
      });
      expect(errors.some((e) => e.field === 'auth.header')).toBe(true);
    });

    it('should accept auth.type "none" without header', () => {
      const errors = validateManifest({
        ...validManifest,
        auth: { type: 'none' },
      });
      expect(errors.some((e) => e.field === 'auth.header')).toBe(false);
    });

    it('should reject empty commands array', () => {
      const errors = validateManifest({ ...validManifest, commands: [] });
      expect(errors.some((e) => e.field === 'commands')).toBe(true);
    });

    it('should reject invalid headers values', () => {
      const errors = validateManifest({
        ...validManifest,
        headers: { 'X-Version': 123 },
      });
      expect(errors.some((e) => e.field === 'headers.X-Version')).toBe(true);
    });

    it('should accept valid optional headers', () => {
      const errors = validateManifest({
        ...validManifest,
        headers: { 'X-Version': '2024-01-01' },
      });
      expect(errors).toEqual([]);
    });
  });

  describe('validateCommand', () => {
    it('should return no errors for a valid command', () => {
      const errors = validateCommand(validManifest.commands[0], 0);
      expect(errors).toEqual([]);
    });

    it('should reject invalid method', () => {
      const errors = validateCommand({ ...validManifest.commands[0], method: 'FETCH' }, 0);
      expect(errors.some((e) => e.field.includes('method'))).toBe(true);
    });

    it('should reject path not starting with /', () => {
      const errors = validateCommand({ ...validManifest.commands[0], path: 'customers' }, 0);
      expect(errors.some((e) => e.field.includes('path'))).toBe(true);
    });

    it('should validate params', () => {
      const cmd = {
        ...validManifest.commands[0],
        params: [
          { name: 'limit', description: 'Max results', required: false, location: 'query', type: 'number' },
        ],
      };
      const errors = validateCommand(cmd, 0);
      expect(errors).toEqual([]);
    });

    it('should reject param with invalid location', () => {
      const cmd = {
        ...validManifest.commands[0],
        params: [
          { name: 'limit', description: 'Max results', required: false, location: 'cookie', type: 'number' },
        ],
      };
      const errors = validateCommand(cmd, 0);
      expect(errors.some((e) => e.field.includes('location'))).toBe(true);
    });

    it('should reject path param without placeholder in path', () => {
      const cmd = {
        name: 'get_customer',
        method: 'GET',
        path: '/customers',
        description: 'Get a customer',
        params: [
          { name: 'id', description: 'Customer ID', required: true, location: 'path', type: 'string' },
        ],
      };
      const errors = validateCommand(cmd, 0);
      expect(errors.some((e) => e.expected?.includes(':id'))).toBe(true);
    });

    it('should accept path param with matching placeholder', () => {
      const cmd = {
        name: 'get_customer',
        method: 'GET',
        path: '/customers/:id',
        description: 'Get a customer',
        params: [
          { name: 'id', description: 'Customer ID', required: true, location: 'path', type: 'string' },
        ],
      };
      const errors = validateCommand(cmd, 0);
      expect(errors).toEqual([]);
    });
  });
});
