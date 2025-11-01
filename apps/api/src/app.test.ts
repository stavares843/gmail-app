import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from './app';

describe('API app', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('protected routes require auth', async () => {
    let res = await request(app).get('/categories');
    expect(res.status).toBe(401);
    res = await request(app).get('/emails/uncategorized');
    expect(res.status).toBe(401);
  });
});
