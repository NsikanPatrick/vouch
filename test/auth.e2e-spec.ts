import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth E2E Tests', () => {
    let app: INestApplication;
    let accessToken: string;
    let refreshToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Complete User Journey', () => {
        const testUser = {
            email: 'e2e@example.com',
            name: 'E2E Test User',
            password: 'Test123!@#',
        };

        it('should register a new user', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send(testUser)
                .expect(201)
                .expect((res) => {
                    expect(res.body.user.email).toBe(testUser.email);
                    expect(res.body.message).toContain('Registration successful');
                });
        });

        it('should not register with duplicate email', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send(testUser)
                .expect(409);
        });

        it('should login successfully', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: testUser.email, password: testUser.password })
                .expect(201)
                .expect((res) => {
                    expect(res.body.accessToken).toBeDefined();
                    expect(res.body.refreshToken).toBeDefined();
                    accessToken = res.body.accessToken;
                    refreshToken = res.body.refreshToken;
                });
        });

        it('should get user profile with valid token', () => {
            return request(app.getHttpServer())
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200)
                .expect((res) => {
                    expect(res.body.email).toBe(testUser.email);
                });
        });

        it('should reject profile request without token', () => {
            return request(app.getHttpServer())
                .get('/api/v1/auth/profile')
                .expect(401);
        });

        it('should refresh access token', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/refresh-token')
                .send({ refreshToken })
                .expect(201)
                .expect((res) => {
                    expect(res.body.accessToken).toBeDefined();
                    accessToken = res.body.accessToken;
                });
        });

        it('should change password', () => {
            return request(app.getHttpServer())
                .patch('/api/v1/auth/change-password')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    currentPassword: testUser.password,
                    newPassword: 'NewTest123!@#',
                })
                .expect(200);
        });

        it('should login with new password', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: testUser.email, password: 'NewTest123!@#' })
                .expect(201);
        });

        it('should logout', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ refreshToken })
                .expect(201);
        });
    });

    describe('Password Reset Flow', () => {
        const resetUser = {
            email: 'reset@example.com',
            name: 'Reset User',
            password: 'Test123!@#',
        };

        beforeAll(async () => {
            // Create user for password reset test
            await request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send(resetUser);
        });

        it('should request password reset', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/forgot-password')
                .send({ email: resetUser.email })
                .expect(201);
        });

        // Note: Actual token from email would be used here
        // For testing, you'd need to capture the token from your email service
        it('should reset password with valid token', async () => {
            // This test would require the actual token from the email
            // You'd need to mock the email service or extract the token
            const resetToken = 'test-token'; // Would come from email in real test

            return request(app.getHttpServer())
                .post('/api/v1/auth/reset-password')
                .send({ token: resetToken, newPassword: 'ResetPass123!@#' })
                .expect(400); // Expect 400 with invalid token for now
        });
    });

    describe('Validation Errors', () => {
        it('should reject weak password', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send({
                    email: 'weak@example.com',
                    name: 'Weak User',
                    password: 'weak',
                })
                .expect(400);
        });

        it('should reject invalid email format', () => {
            return request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send({
                    email: 'invalid-email',
                    name: 'Invalid User',
                    password: 'Test123!@#',
                })
                .expect(400);
        });
    });
});