import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Admin Routes E2E Tests', () => {
    let app: INestApplication;
    let adminAccessToken: string;
    let userAccessToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        // Create a regular user
        await request(app.getHttpServer())
            .post('/api/v1/auth/register')
            .send({
                email: 'regular@example.com',
                name: 'Regular User',
                password: 'Test123!@#',
            });

        // Login as regular user
        const userLogin = await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: 'regular@example.com', password: 'Test123!@#' });
        userAccessToken = userLogin.body.accessToken;

        // Note: In real tests, you'd need an admin user created via database seeding
        // For this test, we'll assume an admin exists or create one via a test-only endpoint
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Role-Based Access Control', () => {
        it('should prevent regular user from accessing admin routes', () => {
            return request(app.getHttpServer())
                .get('/api/v1/auth/users')
                .set('Authorization', `Bearer ${userAccessToken}`)
                .expect(403); // Forbidden - insufficient permissions
        });

        it('should prevent regular user from creating admin accounts', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/create-admin')
                .set('Authorization', `Bearer ${userAccessToken}`)
                .send({
                    email: 'shouldnot@example.com',
                    name: 'Should Not Create',
                    password: 'Test123!@#',
                })
                .expect(403);
        });
    });
});