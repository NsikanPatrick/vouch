import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
    // Auth configurations
    auth: {
        jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'fallback-super-secret-key',
        jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
        jwtVerificationSecret: process.env.JWT_VERIFICATION_SECRET,
        // Parsing this into a number to prevent calculations on strings!
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
    },

    // Email configurations
    email: {
        host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
        port: parseInt(process.env.EMAIL_PORT || '2525', 10), // 2525 gives parseInt an initial value to avoid having an undefined before extracting from the env file
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        fromName: process.env.EMAIL_FROM_NAME || 'Vouch',
        fromAddress: process.env.EMAIL_FROM_ADDRESS,
        resendApiKey: process.env.RESEND_API_KEY,
        webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    },

    // Frontendurl Configuration
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

    // Coudinary Configuration
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    }
}));
