import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('la app levanta y el servidor responde', () => {
    // La API usa prefijo /api/v1 y no expone endpoint root; un 404 confirma
    // que el AppModule compila, levanta y el server responde (smoke test).
    return request(app.getHttpServer()).get('/').expect(404);
  });
});
