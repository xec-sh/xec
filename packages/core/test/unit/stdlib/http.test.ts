
import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createHttpClient } from '../../../src/stdlib/http.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/http', () => {
  let http: any;
  let mockExecutor: ReturnType<typeof vi.fn>;
  let mockEnv: EnvironmentInfo;
  let mockLogger: any;

  beforeEach(async () => {
    mockExecutor = vi.fn();
    mockEnv = {
      type: 'local',
      capabilities: {
        shell: true,
        sudo: true,
        docker: true,
        systemd: true
      },
      platform: {
        os: 'linux',
        arch: 'x64',
        distro: 'ubuntu'
      }
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    http = await createHttpClient(mockExecutor as any, mockEnv, mockLogger);
  });

  describe('get', () => {
    it('should make GET request', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status": "ok", "data": "test"}',
        stderr: '',
        exitCode: 0
      });
      const response = await http.get('https://api.example.com/data');
      expect(response.status).toBe(200);
      expect(response.body).toBe('{"status": "ok", "data": "test"}');
      expect(response.json()).toEqual({ status: 'ok', data: 'test' });
    });

    it('should make GET request with headers', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status": "ok", "data": "test"}',
        stderr: '',
        exitCode: 0
      });
      const response = await http.get('https://api.example.com/data', {
        headers: {
          'Authorization': 'Bearer token123',
          'Accept': 'application/json'
        }
      });
      expect(response.status).toBe(200);
      expect(response.body).toBe('{"status": "ok", "data": "test"}');
    });

    it('should throw error on request failure', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(http.get('https://api.example.com/data')).rejects.toThrow();
    });
  });

  describe('post', () => {
    it('should make POST request with JSON data', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n{"id": "123", "created": true}',
        stderr: '',
        exitCode: 0
      });
      const data = { name: 'test', value: 123 };
      const response = await http.post('https://api.example.com/create', data);
      expect(response.status).toBe(201);
      expect(response.body).toBe('{"id": "123", "created": true}');
      expect(response.json()).toEqual({ id: '123', created: true });
    });

    it('should make POST request with custom headers', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n{"id": "123", "created": true}',
        stderr: '',
        exitCode: 0
      });
      const data = { name: 'test' };
      const response = await http.post('https://api.example.com/create', data, {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom': 'value'
        }
      });
      expect(response.status).toBe(201);
      expect(response.body).toBe('{"id": "123", "created": true}');
    });
  });

  describe('request', () => {
    it('should make custom request', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nOK',
        stderr: '',
        exitCode: 0
      });
      const response = await http.request({ url: 'https://api.example.com/options', method: 'OPTIONS' });
      expect(response.status).toBe(200);
      expect(response.body).toBe('OK');
    });

    it('should make request with all options', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"result": "success"}',
        stderr: '',
        exitCode: 0
      });
      const response = await http.request({
        url: 'https://api.example.com/update',
        method: 'PATCH',
        body: { field: 'value' },
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        retry: 3
      });
      expect(response.status).toBe(200);
      expect(response.json()).toEqual({ result: 'success' });
    });
  });
});